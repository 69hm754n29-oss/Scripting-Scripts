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

export type ScriptHubFormatDetection = {
  sourceFormat: ScriptHubSourceFormat
  suggestedTargetFormat?: ScriptHubTargetFormat
  confidence: "high" | "medium" | "low"
  reason: string
}

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

function sourceFormatFromPath(value: unknown): ScriptHubSourceFormat {
  const raw = String(value ?? "").split(/[?#]/, 1)[0].toLowerCase()
  if (/\.(?:plugin|lpx)$/.test(raw)) return "loon-plugin"
  if (/\.(?:list|rules?)$/.test(raw)) return "rule-set"
  // A community repository commonly uses `.js` for a QX rewrite source whose
  // executable body is embedded below `[rewrite_local]`.  The extension alone
  // must not force Script-Hub's script-conversion endpoint.  Keep `.script`
  // as the explicit opt-in for a standalone QX script, while treating `.js`
  // as the module-compatible rewrite source that can become a Surge module.
  if (/\.script$/.test(raw)) return "qx-script"
  if (/\.js$/.test(raw)) return "qx-rewrite"
  if (/\.(?:sgmodule|sgmodulle)$/.test(raw)) return "surge-module"
  if (/\.conf$/.test(raw)) return "qx-rewrite"
  if (/\.snippet$/.test(raw)) return "plain-text"
  return "loon-plugin"
}

function isJavaScriptPath(value: unknown): boolean {
  const raw = String(value ?? "").split(/[?#]/, 1)[0].toLowerCase()
  return /\.js$/.test(raw)
}

function normalizedSourceContent(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .slice(0, 512 * 1024)
}

function hasSection(content: string, names: string): boolean {
  return new RegExp(`^\\s*\\[(?:${names})\\]\\s*$`, "im").test(content)
}

function looksLikeRuleSet(content: string): boolean {
  return content.split("\n").some((line) => {
    const value = line.trim()
    if (!value || value.startsWith("#") || value.startsWith("//")) return false
    return /^(?:DOMAIN(?:-SUFFIX|-KEYWORD)?|IP-CIDR6?|GEOIP|USER-AGENT|URL-REGEX|HOST(?:-SUFFIX|-KEYWORD)?|PROCESS-NAME|FINAL|MATCH|AND|OR|NOT),/i.test(value)
  })
}

function looksLikeSurgeModule(content: string): boolean {
  const hasSurgeSection = hasSection(
    content,
    "General|Rule|Rule Set|URL Rewrite|Header Rewrite|Body Rewrite|Map Local",
  )
  const hasSurgeScriptEntry = /\btype\s*=\s*(?:http-request|http-response|cron|event|generic|request|response|websocket|dns)\b/i.test(content)
  const hasSurgeMetadata = /^\s*#!(?:name|desc|category|icon|author|arguments)\s*=/im.test(content)
  return hasSurgeSection || (hasSurgeMetadata && hasSurgeScriptEntry)
}

function looksLikeLoonPlugin(content: string): boolean {
  const hasLoonScriptEntry = /^\s*(?:http-request|http-response|cron|event|dns|websocket)\b[^\n]*\bscript-path\s*=/im.test(content)
  const hasLoonRewriteEntry = /^\s*(?:http-request|http-response|http-data|request-header|response-header)\b/im.test(content)
  const hasLoonSection = hasSection(content, "Script|Rewrite|MITM|Host|Remote Filter")
  const hasSurgeType = /\btype\s*=\s*(?:http-request|http-response|cron|event|generic|request|response|websocket|dns)\b/i.test(content)
  return !hasSurgeType && (hasLoonScriptEntry || hasLoonRewriteEntry || hasLoonSection && /\bscript-path\s*=/i.test(content))
}

function looksLikeQXRewrite(content: string): boolean {
  const hasQXSection = hasSection(content, "rewrite_local|rewrite_remote|filter_remote")
  const hasSurgeSection = hasSection(content, "General|Rule|Rule Set|URL Rewrite|Header Rewrite|Body Rewrite|Map Local")
  return hasQXSection || (!hasSurgeSection && (
    /\burl\s+(?:reject|reject-200|script-(?:request|response)-(?:body|header)|request-header|response-header|echo|rewrite|307|302)\b/i.test(content)
      || /\b(?:script-(?:request|response)-(?:body|header)|request-header|response-header)\s+/i.test(content)
  ))
}

function looksLikeJavaScript(content: string): boolean {
  return /(?:^|\n)\s*(?:const|let|var|function|class|import|export)\s+[$A-Z_a-z]/m.test(content)
    || /\b(?:module\.exports|require\s*\(|\$request|\$response|\$done|\$task|\$notify)\b/.test(content)
}

/**
 * Detect the actual Script-Hub input type. Filename-only detection is not
 * enough for community repositories: many of them publish module/rewrite text
 * with a `.js` suffix. Content signals win over the suffix. A standalone QX
 * script is only inferred from the explicit `.script` extension (or selected
 * manually in the UI), so an ordinary marketplace `.js` file stays eligible
 * for the Surge-module conversion endpoint.
 */
export function detectScriptHubSourceFormat(
  value: unknown,
  content?: unknown,
): ScriptHubFormatDetection {
  const fallback = sourceFormatFromPath(value)
  const text = normalizedSourceContent(content)

  if (text) {
    if (looksLikeRuleSet(text)) {
      return { sourceFormat: "rule-set", confidence: "high", reason: "检测到规则集条目" }
    }
    if (looksLikeSurgeModule(text)) {
      return { sourceFormat: "surge-module", confidence: "high", reason: "检测到 Surge 模块段落或脚本参数" }
    }
    if (looksLikeLoonPlugin(text)) {
      return { sourceFormat: "loon-plugin", confidence: "high", reason: "检测到 Loon 插件脚本语法" }
    }
    if (looksLikeQXRewrite(text)) {
      return { sourceFormat: "qx-rewrite", confidence: "high", reason: "检测到 Quantumult X 重写语法" }
    }
    // Do not classify every JavaScript-looking `.js` file as a QX script. In
    // community module repositories the JS body and the QX rewrite header are
    // often shipped together, and some files omit the header while still being
    // intended for the module converter. `.script` is the explicit standalone
    // script convention; its target remains Surge script (compatible).
    if (looksLikeJavaScript(text) && fallback === "qx-script") {
      return {
        sourceFormat: "qx-script",
        suggestedTargetFormat: "surge-script",
        confidence: "medium",
        reason: "检测到 .script 独立脚本内容；目标应使用 Surge 脚本（兼容）",
      }
    }
    if (/^\s*#!(?:name|desc|category|icon|author)\s*=/im.test(text)) {
      return { sourceFormat: "surge-module", confidence: "medium", reason: "检测到模块元数据" }
    }
  }

  if (fallback === "qx-script") {
    return {
      sourceFormat: fallback,
      suggestedTargetFormat: "surge-script",
      confidence: "low",
      reason: "按 .script 后缀判断；未能读取内容确认格式",
    }
  }
  if (isJavaScriptPath(value) && fallback === "qx-rewrite") {
    return {
      sourceFormat: fallback,
      suggestedTargetFormat: "surge-module",
      confidence: text ? "low" : "medium",
      reason: text
        ? "未检测到独立脚本标记；按第三方 .js 模块源处理，目标使用 Surge 模块"
        : "按第三方 .js 模块源处理，目标使用 Surge 模块",
    }
  }
  return {
    sourceFormat: fallback,
    confidence: text ? "low" : "medium",
    reason: text ? "未检测到明确格式，按文件后缀兜底" : "未读取来源内容，按文件后缀判断",
  }
}

/** Pick a sensible source type for a marketplace file. */
export function inferScriptHubSourceFormat(value: unknown, content?: unknown): ScriptHubSourceFormat {
  return detectScriptHubSourceFormat(value, content).sourceFormat
}

export function isScriptHubSourceTargetCompatible(
  sourceFormat: ScriptHubSourceFormat,
  targetFormat: ScriptHubTargetFormat,
): boolean {
  return sourceFormat !== "qx-script" || targetFormat === "surge-script"
}

export function suggestedScriptHubTargetFormat(
  sourceFormat: ScriptHubSourceFormat,
  currentTarget: ScriptHubTargetFormat,
): ScriptHubTargetFormat {
  return sourceFormat === "qx-script" ? "surge-script" : currentTarget
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
