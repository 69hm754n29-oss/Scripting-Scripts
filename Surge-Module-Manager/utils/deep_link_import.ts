export const SCRIPT_HUB_IMPORT_ACTION = "import-surge-module"

export type ScriptHubImportRequest = {
  url: string
  name: string
  category?: string
}

type QueryParameters = Record<string, any>

export function isScriptHubImport(query: Record<string, any> | null | undefined): boolean {
  // `url` is treated by Scripting as a shared URL payload before it reaches a
  // target script. Script-Hub therefore uses namespaced query keys. Keep the
  // old action key readable for hand-crafted/backward-compatible invocations.
  return String(query?.sh_action ?? query?.action ?? "") === SCRIPT_HUB_IMPORT_ACTION
}

function queryParametersFromURL(value: unknown): QueryParameters | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null

  try {
    const json = JSON.parse(raw)
    if (json && typeof json === "object" && !Array.isArray(json)) {
      return json as QueryParameters
    }
  } catch {}

  try {
    const parsed = new URL(raw)
    const query: QueryParameters = {}
    parsed.searchParams.forEach((item, key) => {
      query[key] = item
    })
    return query
  } catch {
    // Some Intent/Shortcut bridges forward only the query string instead of
    // the complete scripting:// URL. Accept both `?a=1` and `a=1&b=2`.
    try {
      const query = new URLSearchParams(raw.replace(/^\?/, ""))
      const result: QueryParameters = {}
      query.forEach((item, key) => {
        result[key] = item
      })
      return Object.keys(result).length ? result : null
    } catch {
      return null
    }
  }
}

/**
 * Resolve Script-Hub's URL payload across Scripting's supported launch paths.
 *
 * A cold `scripting://run(_single)/...` launch normally exposes
 * `Script.queryParameters`. Depending on the Scripting entry point and app
 * version, the same URL can arrive through Intent.urlsParameter/textsParameter
 * or as a nested `queryParameters` object. If we only inspect one of these,
 * the script silently falls back to the normal "update all" operation.
 */
export function resolveScriptHubQueryParameters(
  direct: QueryParameters | null | undefined,
  candidates: unknown[] = [],
): QueryParameters {
  const values: unknown[] = [
    direct,
    direct && typeof direct === "object" ? (direct as any).queryParameters : null,
    ...candidates,
  ]

  for (const value of values) {
    if (value && typeof value === "object") {
      if (isScriptHubImport(value as QueryParameters)) return value as QueryParameters

      const nestedValues = [
        (value as any).queryParameters,
        (value as any).value,
        (value as any).url,
        (value as any).text,
      ]
      for (const nested of nestedValues) {
        if (nested && typeof nested === "object" && isScriptHubImport(nested)) {
          return nested as QueryParameters
        }

        const nestedQuery = queryParametersFromURL(nested)
        if (nestedQuery && isScriptHubImport(nestedQuery)) return nestedQuery
      }
    }

    const parsed = queryParametersFromURL(value)
    if (parsed && isScriptHubImport(parsed)) return parsed
  }

  return (direct && typeof direct === "object" ? direct : {}) as QueryParameters
}

function cleanOneLine(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

export function sanitizeModuleName(value: unknown): string {
  const raw = cleanOneLine(value, 128).replace(/\.sgmodule$/i, "")
  if (!raw || raw === "." || raw === "..") throw new Error("模块名称为空或无效")
  if (/[\\/]/.test(raw)) throw new Error("模块名称不能包含路径分隔符")
  return raw
}

export function normalizeModuleUrl(value: unknown): string {
  const raw = String(value ?? "").trim()
  if (!raw || raw.length > 8192) throw new Error("模块链接为空或过长")

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("模块链接不是有效 URL")
  }
  const isHttps = parsed.protocol === "https:"
  // Script-Hub's current local/Surge-facing result endpoint is deliberately
  // exposed as http://script.hub. Scriptable accepts that URL and downloads
  // the module, so keep the same narrow compatibility exception here while
  // rejecting arbitrary plain-HTTP sources.
  const isScriptHubHttp =
    parsed.protocol === "http:" &&
    parsed.hostname.toLowerCase() === "script.hub" &&
    (!parsed.port || parsed.port === "80")
  if ((!isHttps && !isScriptHubHttp) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("仅接受不含凭据的 HTTPS 模块链接；仅兼容 Script-Hub 的 http://script.hub 地址")
  }
  return parsed.toString()
}

export function parseScriptHubImport(query: Record<string, any> | null | undefined): ScriptHubImportRequest | null {
  if (!isScriptHubImport(query)) return null
  return {
    url: normalizeModuleUrl(query?.sh_module_url ?? query?.module_url ?? query?.url),
    name: sanitizeModuleName(query?.sh_module_name ?? query?.module_name ?? query?.name),
    category: cleanOneLine(query?.sh_module_category ?? query?.module_category ?? query?.category, 64) || undefined,
  }
}

export function isSameRemoteUrl(left: string | undefined, right: string): boolean {
  if (!left) return false
  try {
    return normalizeModuleUrl(left) === normalizeModuleUrl(right)
  } catch {
    return false
  }
}
