import { withTimeout } from "./async"

export type SourceFetchOptions = {
  timeoutMs?: number
  maxChars?: number
  userAgent?: string
  debugLabel?: string
  /** Only use this narrow exception for a known local converter endpoint. */
  allowPlainHTTPHost?: string
}

export type SourceFetchResponse = {
  url: string
  status: number
  contentType: string
  text: string
}

export type SourceFetchClient = {
  text: (url: string, options?: SourceFetchOptions) => Promise<SourceFetchResponse>
  json: <T = unknown>(url: string, options?: SourceFetchOptions) => Promise<T>
}

export type SourceCatalogEntry = {
  id: string
  name: string
  sourceURL: string
  sourceKind?: string
  moduleName?: string
  description?: string
  category?: string
}

export type SourceCatalogAdapterContext = {
  fetch: SourceFetchClient
  originURL: string
}

export type SourceCatalogAdapter = {
  id: string
  label: string
  sourceKind: string
  matches: (url: string) => boolean
  discover: (url: string, context: SourceCatalogAdapterContext) => Promise<SourceCatalogEntry[]>
}

const DEFAULT_TIMEOUT_MS = 15 * 1000
const DEFAULT_MAX_CHARS = 2 * 1024 * 1024
const DEFAULT_USER_AGENT = "SurgeModulesManager/1.0"
const MAX_CATALOG_ENTRIES = 512

function cleanOneLine(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

function normalizeUserAgent(value: unknown): string {
  const raw = String(value ?? "").trim()
  if (!raw) return DEFAULT_USER_AGENT
  if (/[\r\n]/.test(raw)) throw new Error("User-Agent 不能包含换行")
  return cleanOneLine(raw, 256)
}

function normalizeCatalogEntry(
  value: unknown,
  index: number,
  defaultSourceKind?: string,
  baseURL?: string,
): SourceCatalogEntry | null {
  if (!value || typeof value !== "object") return null
  const item = value as any
  const id = cleanOneLine(item.id, 160) || `module-${index + 1}`
  const name = cleanOneLine(item.name ?? item.moduleName, 160)
  if (!name) return null
  const rawSourceURL = String(item.sourceURL ?? "").trim()
  if (!rawSourceURL) return null
  let sourceURL = ""
  try {
    sourceURL = normalizeSourceURL(new URL(rawSourceURL, baseURL).toString())
  } catch {
    return null
  }
  return {
    id,
    name,
    sourceURL,
    sourceKind: cleanOneLine(item.sourceKind, 64) || cleanOneLine(defaultSourceKind, 64) || undefined,
    moduleName: cleanOneLine(item.moduleName ?? item.name, 160) || undefined,
    description: cleanOneLine(item.description, 300) || undefined,
    category: cleanOneLine(item.category, 64) || undefined,
  }
}

export function normalizeSourceURL(value: unknown, allowPlainHTTPHost?: string): string {
  const raw = String(value ?? "").trim()
  if (!raw || raw.length > 8192) throw new Error("来源地址为空或过长")

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("来源地址不是有效 URL")
  }
  const host = parsed.hostname.toLowerCase()
  const allowHTTP = parsed.protocol === "http:"
    && !!allowPlainHTTPHost
    && host === allowPlainHTTPHost.toLowerCase()
    && !parsed.port
  if ((!allowHTTP && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("来源地址必须是无凭据的 HTTPS 地址")
  }
  return parsed.toString()
}

export async function fetchSourceText(url: string, options: SourceFetchOptions = {}): Promise<SourceFetchResponse> {
  const requestedTimeout = Number(options.timeoutMs)
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.max(1000, Math.min(60 * 1000, Math.round(requestedTimeout)))
    : DEFAULT_TIMEOUT_MS
  const requestedMaxChars = Number(options.maxChars)
  const maxChars = Number.isFinite(requestedMaxChars)
    ? Math.max(16 * 1024, Math.min(8 * 1024 * 1024, Math.round(requestedMaxChars)))
    : DEFAULT_MAX_CHARS
  const normalizedURL = normalizeSourceURL(url, options.allowPlainHTTPHost)
  const parsedURL = new URL(normalizedURL)
  const isAllowedPlainHTTP = parsedURL.protocol === "http:"
    && !!options.allowPlainHTTPHost
    && parsedURL.hostname.toLowerCase() === options.allowPlainHTTPHost.toLowerCase()
    && !parsedURL.port
  const fetchFn: any = (globalThis as any).fetch
  if (typeof fetchFn !== "function") throw new Error("fetch 不可用")

  const controller = typeof AbortController === "function" ? new AbortController() : undefined
  try {
    const RequestCtor: any = (globalThis as any).Request
    const init: any = {
      headers: {
        Accept: "text/html,application/json,text/plain,*/*",
        "User-Agent": normalizeUserAgent(options.userAgent),
      },
      timeout: timeoutMs / 1000,
      debugLabel: options.debugLabel ?? "来源抓取",
      ...(controller ? { signal: controller.signal } : {}),
      ...(isAllowedPlainHTTP ? { allowInsecureRequest: true } : {}),
    }
    const request = typeof RequestCtor === "function" ? new RequestCtor(normalizedURL, init) : null
    const response = await withTimeout(
      () => request ? fetchFn(request) : fetchFn(normalizedURL, init),
      timeoutMs,
      `来源请求超时（${timeoutMs / 1000}s）`,
    )
    const status = Number(response?.status ?? 0)
    if (status < 200 || status >= 400) {
      throw new Error(`来源请求失败：HTTP ${response?.status ?? "unknown"}`)
    }
    const contentLength = Number(response?.headers?.get?.("content-length") ?? 0)
    if (Number.isFinite(contentLength) && contentLength > maxChars * 4) {
      throw new Error(`来源响应超过 ${Math.round(maxChars / 1024)} KiB 限制`)
    }
    if (typeof response?.text !== "function") throw new Error("Response.text 不可用")
    const text = String(await withTimeout(
      () => response.text(),
      timeoutMs,
      `读取来源响应超时（${timeoutMs / 1000}s）`,
    ))
    if (text.length > maxChars) throw new Error(`来源响应超过 ${Math.round(maxChars / 1024)} KiB 限制`)
    return {
      url: normalizedURL,
      status,
      contentType: String(response?.headers?.get?.("content-type") ?? ""),
      text,
    }
  } finally {
    try { controller?.abort() } catch {}
  }
}

export function createSourceFetchClient(): SourceFetchClient {
  return {
    text: fetchSourceText,
    async json<T = unknown>(url: string, options: SourceFetchOptions = {}): Promise<T> {
      const response = await fetchSourceText(url, options)
      try {
        return JSON.parse(response.text) as T
      } catch {
        throw new Error("来源响应不是有效 JSON")
      }
    },
  }
}

/**
 * Extract only HTTPS candidate module links from a source response. This is a
 * helper for future adapters, not an enabled crawler or a built-in source.
 */
export function extractModuleLinks(rawText: string, baseURL?: string): string[] {
  const input = String(rawText ?? "")
  const candidates = input.match(/(?:https:\/\/|\/)[^\s"'<>]+/gi) ?? []
  const output: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[),.;]+$/g, "")
    let absolute = ""
    try {
      absolute = new URL(cleaned, baseURL).toString()
      absolute = normalizeSourceURL(absolute)
    } catch {
      continue
    }
    if (!/\.(?:plugin|lpx|conf|sgmodule)(?:[?#]|$)/i.test(absolute)) continue
    if (seen.has(absolute)) continue
    seen.add(absolute)
    output.push(absolute)
  }
  return output
}

export function createSourceAdapterRegistry(initial: SourceCatalogAdapter[] = []) {
  const adapters: SourceCatalogAdapter[] = []

  function register(adapter: SourceCatalogAdapter): void {
    if (!adapter?.id || !adapter.label || !adapter.sourceKind
      || typeof adapter.matches !== "function" || typeof adapter.discover !== "function") {
      throw new Error("来源适配器契约无效")
    }
    if (adapters.some((item) => item.id === adapter.id)) {
      throw new Error(`来源适配器已注册：${adapter.id}`)
    }
    adapters.push(adapter)
  }

  for (const adapter of initial) register(adapter)

  return {
    register,
    list: (): SourceCatalogAdapter[] => [...adapters],
    find: (url: string): SourceCatalogAdapter | undefined =>
      adapters.find((adapter) => {
        try { return adapter.matches(url) } catch { return false }
      }),
    discover: async (url: string): Promise<SourceCatalogEntry[]> => {
      const adapter = adapters.find((item) => {
        try { return item.matches(url) } catch { return false }
      })
      if (!adapter) throw new Error("没有匹配的来源适配器")
      const originURL = normalizeSourceURL(url)
      const result = await adapter.discover(originURL, {
        fetch: createSourceFetchClient(),
        originURL,
      })
      if (!Array.isArray(result)) return []
      const seen = new Set<string>()
      return result
        .map((item, index) => normalizeCatalogEntry(item, index, adapter.sourceKind, originURL))
        .filter((item): item is SourceCatalogEntry => {
          if (!item || seen.has(item.sourceURL)) return false
          seen.add(item.sourceURL)
          return true
        })
        .slice(0, MAX_CATALOG_ENTRIES)
    },
  }
}

// Deliberately empty. Providers must be explicitly added by a future adapter
// module or by user-provided source integration; no source is bundled here.
export const sourceAdapterRegistry = createSourceAdapterRegistry()
