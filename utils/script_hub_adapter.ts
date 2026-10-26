import { normalizeSourceURL } from "./source_fetcher"

export type ScriptHubSourceFormat = "loon-plugin"
export type ScriptHubTargetFormat = "surge-module"

export type ScriptHubConversionOptions = {
  sourceURL: string
  moduleName?: string
  category?: string
  sourceUserAgent?: string
  removeSourceMetadata?: boolean
  enableJQ?: boolean
}

const SCRIPT_HUB_ORIGIN = "http://script.hub"
const SOURCE_TYPE: ScriptHubSourceFormat = "loon-plugin"
const TARGET_TYPE: ScriptHubTargetFormat = "surge-module"

function cleanOneLine(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

export function deriveModuleNameFromSource(value: unknown): string {
  try {
    const parsed = new URL(normalizeSourceURL(value))
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? ""
    const decoded = decodeURIComponent(last)
      .replace(/\.(?:plugin|lpx|conf|sgmodule)$/i, "")
      .trim()
    return cleanOneLine(decoded, 128) || "第三方模块"
  } catch {
    return "第三方模块"
  }
}

export function normalizeModuleName(value: unknown, sourceURL: string): string {
  const fallback = deriveModuleNameFromSource(sourceURL)
  const name = cleanOneLine(value, 128) || fallback
  const safe = name
    .replace(/\.sgmodule$/i, "")
    .replace(/[\\/]/g, "-")
    .trim()
  if (!safe || safe === "." || safe === "..") throw new Error("模块名称为空或无效")
  return safe
}

function encodeSourceRoutePart(sourceURL: string): string {
  // Match Script-Hub's own URL builder. Its parser reads the raw text between
  // `_start_` and `_end_` and then fetches that value directly. In particular,
  // a source query string must stay unencoded or `%3F` becomes part of the
  // fetched path instead of the original query.
  return sourceURL
    .replace(/#.*$/, "")
    .replace(/😂/g, "%F0%9F%98%82")
}

export function buildScriptHubConversionURL(options: ScriptHubConversionOptions): string {
  const sourceURL = normalizeSourceURL(options.sourceURL)
  const moduleName = normalizeModuleName(options.moduleName, sourceURL)
  const removeSourceMetadata = options.removeSourceMetadata !== false
  const enableJQ = options.enableJQ !== false
  const params = [
    `type=${SOURCE_TYPE}`,
    `target=${TARGET_TYPE}`,
    `del=${removeSourceMetadata ? "true" : "false"}`,
    `jqEnabled=${enableJQ ? "true" : "false"}`,
  ]
  const category = cleanOneLine(options.category, 64)
  if (category) params.push(`category=${encodeURIComponent(category)}`)
  const sourceUserAgent = cleanOneLine(options.sourceUserAgent, 256)
  if (sourceUserAgent) {
    params.push(`headers=${encodeURIComponent(`User-Agent: ${sourceUserAgent}`)}`)
  }

  return `${SCRIPT_HUB_ORIGIN}/file/_start_/${encodeSourceRoutePart(sourceURL)}/_end_/${encodeURIComponent(moduleName)}.sgmodule?${params.join("&")}`
}

export function isScriptHubConversionURL(value: unknown): boolean {
  return /^https?:\/\/script\.hub\/file\/_start_\/.+\/_end_\//i.test(String(value ?? "").trim())
}
