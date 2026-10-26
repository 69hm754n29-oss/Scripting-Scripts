import { normalizeSourceURL } from "./source_fetcher"

// Keep the existing UI import path stable while the shared fetch layer remains
// the single implementation of URL validation.
export { normalizeSourceURL } from "./source_fetcher"

/** Values accepted by Script-Hub's `type` query parameter for remote input. */
export type ScriptHubSourceFormat =
  | "qx-rewrite"
  | "surge-module"
  | "loon-plugin"
  | "rule-set"
  | "qx-script"
  | "plain-text"

/** Target values exposed by Script-Hub's conversion UI. */
export type ScriptHubTargetFormat =
  | "surge-module"
  | "stash-stoverride"
  | "shadowrocket-module"
  | "loon-plugin"
  | "loon-rule-set"
  | "shadowrocket-rule-set"
  | "surge-rule-set"
  | "surge-domain-set"
  | "surge-domain-set2"
  | "stash-rule-set"
  | "stash-domain-set"
  | "stash-domain-set2"
  | "surge-script"
  | "plain-text"

export type ScriptHubFormatOption<T extends string> = {
  value: T
  label: string
  suffix: string
}

export const SCRIPT_HUB_SOURCE_FORMATS: ScriptHubFormatOption<ScriptHubSourceFormat>[] = [
  { value: "qx-rewrite", label: "QX 重写", suffix: ".sgmodule" },
  { value: "surge-module", label: "Surge 模块", suffix: ".sgmodule" },
  { value: "loon-plugin", label: "Loon 插件", suffix: ".plugin" },
  { value: "rule-set", label: "规则集", suffix: ".list" },
  { value: "qx-script", label: "QX 专属脚本", suffix: ".js" },
  { value: "plain-text", label: "纯文本", suffix: ".txt" },
]

export const SCRIPT_HUB_TARGET_FORMATS: ScriptHubFormatOption<ScriptHubTargetFormat>[] = [
  { value: "surge-module", label: "Surge / Egern 模块", suffix: ".sgmodule" },
  { value: "stash-stoverride", label: "Stash 覆写", suffix: ".stoverride" },
  { value: "shadowrocket-module", label: "Shadowrocket 模块", suffix: ".sgmodule" },
  { value: "loon-plugin", label: "Loon 插件", suffix: ".plugin" },
  { value: "loon-rule-set", label: "规则集（Loon）", suffix: ".list" },
  { value: "shadowrocket-rule-set", label: "规则集（Shadowrocket）", suffix: ".list" },
  { value: "surge-rule-set", label: "规则集（Surge）", suffix: ".list" },
  { value: "surge-domain-set", label: "域名集（Surge）", suffix: ".list" },
  { value: "surge-domain-set2", label: "剩余规则集（Surge）", suffix: ".list" },
  { value: "stash-rule-set", label: "规则集（Stash）", suffix: ".list" },
  { value: "stash-domain-set", label: "域名集（Stash）", suffix: ".list" },
  { value: "stash-domain-set2", label: "剩余规则集（Stash）", suffix: ".list" },
  { value: "surge-script", label: "Surge 脚本（兼容）", suffix: ".js" },
  { value: "plain-text", label: "纯文本", suffix: "" },
]

export function scriptHubSourceFormatLabel(value: ScriptHubSourceFormat): string {
  return SCRIPT_HUB_SOURCE_FORMATS.find((item) => item.value === value)?.label ?? value
}

export function scriptHubTargetFormatLabel(value: ScriptHubTargetFormat): string {
  return SCRIPT_HUB_TARGET_FORMATS.find((item) => item.value === value)?.label ?? value
}

export function scriptHubTargetSuffix(value: ScriptHubTargetFormat): string {
  return SCRIPT_HUB_TARGET_FORMATS.find((item) => item.value === value)?.suffix ?? ".txt"
}

export function scriptHubTargetPath(value: ScriptHubTargetFormat): "file" | "convert" {
  return value === "plain-text" || value.endsWith("-script") ? "convert" : "file"
}

/** Pick a sensible source type for a marketplace file without locking the
 * marketplace to one provider or one filename. The user can still override it
 * in the source settings UI. */
export function inferScriptHubSourceFormat(value: unknown): ScriptHubSourceFormat {
  const raw = String(value ?? "").split(/[?#]/, 1)[0].toLowerCase()
  if (/\.(?:plugin|lpx)$/.test(raw)) return "loon-plugin"
  if (/\.(?:list|rules?)$/.test(raw)) return "rule-set"
  if (/\.(?:js|script)$/.test(raw)) return "qx-script"
  if (/\.(?:sgmodule|sgmodulle)$/.test(raw)) return "surge-module"
  if (/\.conf$/.test(raw)) return "qx-rewrite"
  if (/\.snippet$/.test(raw)) return "plain-text"
  return "loon-plugin"
}

export type ScriptHubConversionOptions = {
  sourceURL: string
  sourceFormat?: ScriptHubSourceFormat
  targetFormat?: ScriptHubTargetFormat
  moduleName?: string
  category?: string
  sourceUserAgent?: string
  removeSourceMetadata?: boolean
  enableJQ?: boolean
}

const SCRIPT_HUB_ORIGIN = "http://script.hub"
const DEFAULT_SOURCE_TYPE: ScriptHubSourceFormat = "loon-plugin"
const DEFAULT_TARGET_TYPE: ScriptHubTargetFormat = "surge-module"

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
      .replace(/\.(?:plugin|lpx|conf|sgmodule|stoverride|module|list|txt|js)$/i, "")
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
    .replace(/\.(?:plugin|lpx|conf|sgmodule|stoverride|module|list|txt|js)$/i, "")
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
  const sourceFormat = options.sourceFormat ?? DEFAULT_SOURCE_TYPE
  const targetFormat = options.targetFormat ?? DEFAULT_TARGET_TYPE
  const removeSourceMetadata = options.removeSourceMetadata !== false
  const enableJQ = options.enableJQ !== false
  const params = [
    `type=${sourceFormat}`,
    `target=${targetFormat}`,
    `del=${removeSourceMetadata ? "true" : "false"}`,
    `jqEnabled=${enableJQ ? "true" : "false"}`,
  ]
  const category = cleanOneLine(options.category, 64)
  if (category) params.push(`category=${encodeURIComponent(category)}`)
  const sourceUserAgent = cleanOneLine(options.sourceUserAgent, 256)
  if (sourceUserAgent) {
    params.push(`headers=${encodeURIComponent(`User-Agent: ${sourceUserAgent}`)}`)
  }

  return `${SCRIPT_HUB_ORIGIN}/${scriptHubTargetPath(targetFormat)}/_start_/${encodeSourceRoutePart(sourceURL)}/_end_/${encodeURIComponent(moduleName)}${scriptHubTargetSuffix(targetFormat)}?${params.join("&")}`
}

export function isScriptHubConversionURL(value: unknown): boolean {
  return /^https?:\/\/script\.hub\/(?:file|convert)\/_start_\/.+\/_end_\//i.test(String(value ?? "").trim())
}
