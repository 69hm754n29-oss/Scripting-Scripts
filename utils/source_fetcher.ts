import { withTimeout } from "./async"

export type SourceFetchOptions = {
  timeoutMs?: number
  maxChars?: number
  userAgent?: string
  debugLabel?: string
  /** Only permit this exact plain-HTTP host when a local converter requires it. */
  allowPlainHTTPHost?: string
}

export type SourceFetchResponse = {
  url: string
  status: number
  contentType: string
  text: string
}

const DEFAULT_TIMEOUT_MS = 15 * 1000
const DEFAULT_MAX_CHARS = 2 * 1024 * 1024
const DEFAULT_USER_AGENT = "Script-Hub-Scripting/1.0"

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

export async function fetchSourceText(
  url: string,
  options: SourceFetchOptions = {},
): Promise<SourceFetchResponse> {
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
        Accept: "text/plain,text/html,application/json,*/*",
        "User-Agent": normalizeUserAgent(options.userAgent),
      },
      timeout: timeoutMs / 1000,
      debugLabel: options.debugLabel ?? "Script-Hub 来源读取",
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
