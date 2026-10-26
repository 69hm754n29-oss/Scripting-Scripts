import { normalizeSourceURL } from "./source_fetcher"
import {
  SCRIPT_HUB_SOURCE_FORMATS,
  SCRIPT_HUB_TARGET_FORMATS,
  type ScriptHubSourceFormat,
  type ScriptHubTargetFormat,
} from "./script_hub_adapter"

export type SourceMode = "direct" | "marketplace"
export type SourceAdapterKind = ScriptHubSourceFormat

export type SourceConfig = {
  id: string
  name: string
  mode: SourceMode
  /** Direct module URL, or the repository URL for a marketplace. */
  sourceURL: string
  /** User-supplied marketplace repository; never bundled by the app. */
  repositoryURL?: string
  repositoryBranch?: string
  repositoryPath?: string
  moduleName?: string
  sourceUserAgent?: string
  sourceKind: SourceAdapterKind
  /** Detect the source body on import unless the user explicitly overrides it. */
  sourceFormatAuto: boolean
  target: ScriptHubTargetFormat
  converter: "script-hub-beta"
  enabled: boolean
  defaultCategory?: string
  saveDir?: string
  autoImport: boolean
  keepOriginalLink: boolean
  removeSourceMetadata: boolean
  enableJQ: boolean
  updatedAt: number
}

export type SourceImportRequest = {
  source: SourceConfig
  moduleName: string
  sourceURL: string
  convertedURL: string
  sourceFormat: ScriptHubSourceFormat
  targetFormat: ScriptHubTargetFormat
  category?: string
  saveDir?: string
  keepOriginalLink: boolean
}

const KEY = "surge_modules_manager_source_adapters_v1"
const MAX_SOURCES = 32

function storage(): any {
  return (globalThis as any).Storage
}

function cleanOneLine(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

function validSourceFormat(value: unknown): ScriptHubSourceFormat {
  const candidate = String(value ?? "") as ScriptHubSourceFormat
  return SCRIPT_HUB_SOURCE_FORMATS.some((item) => item.value === candidate) ? candidate : "loon-plugin"
}

function validTargetFormat(value: unknown): ScriptHubTargetFormat {
  const candidate = String(value ?? "") as ScriptHubTargetFormat
  return SCRIPT_HUB_TARGET_FORMATS.some((item) => item.value === candidate) ? candidate : "surge-module"
}

function normalize(value: unknown, index: number): SourceConfig | null {
  if (!value || typeof value !== "object") return null
  const item = value as any
  const mode: SourceMode = item.mode === "marketplace" ? "marketplace" : "direct"
  let repositoryURL = ""
  if (mode === "marketplace") {
    try {
      repositoryURL = normalizeSourceURL(item.repositoryURL || item.sourceURL)
    } catch {
      return null
    }
  }
  let sourceURL = ""
  if (mode === "marketplace") {
    // Older versions persisted the last selected module here. Normalize those
    // records to the repository so a stale module is never shown on reopen.
    sourceURL = repositoryURL
  } else if (String(item.sourceURL ?? "").trim()) {
    try {
      sourceURL = normalizeSourceURL(item.sourceURL)
    } catch {
      return null
    }
  }
  if (!sourceURL) sourceURL = repositoryURL
  const name = cleanOneLine(item.name, 80)
  if (!sourceURL || !name) return null
  const id = cleanOneLine(item.id, 120) || `source-${Date.now()}-${index}`
  const updatedAt = Number(item.updatedAt)
  return {
    id,
    name,
    mode,
    sourceURL,
    repositoryURL: repositoryURL || undefined,
    repositoryBranch: cleanOneLine(item.repositoryBranch, 200) || undefined,
    repositoryPath: cleanOneLine(item.repositoryPath, 512) || undefined,
    moduleName: cleanOneLine(item.moduleName, 128) || undefined,
    sourceUserAgent: cleanOneLine(item.sourceUserAgent, 256) || undefined,
    sourceKind: validSourceFormat(item.sourceKind),
    sourceFormatAuto: item.sourceFormatAuto !== false,
    target: validTargetFormat(item.target),
    converter: "script-hub-beta",
    enabled: item.enabled !== false,
    defaultCategory: cleanOneLine(item.defaultCategory, 64) || undefined,
    saveDir: String(item.saveDir ?? "").trim() || undefined,
    autoImport: item.autoImport !== false,
    keepOriginalLink: item.keepOriginalLink !== false,
    removeSourceMetadata: item.removeSourceMetadata !== false,
    enableJQ: item.enableJQ !== false,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
  }
}

function write(items: SourceConfig[]): void {
  const st = storage()
  const fixed = items.slice(0, MAX_SOURCES)
  if (typeof st?.set === "function") {
    const ok = st.set(KEY, fixed)
    if (ok === false) throw new Error("Storage.set 保存来源失败")
    return
  }
  if (typeof st?.setString === "function") {
    const ok = st.setString(KEY, JSON.stringify(fixed))
    if (ok === false) throw new Error("Storage.setString 保存来源失败")
    return
  }
  throw new Error("Storage API 不存在：请确认 Scripting 是否提供 Storage.set/get")
}

export function loadSourceConfigs(): SourceConfig[] {
  const st = storage()
  try {
    const raw = st?.get?.(KEY) ?? st?.getString?.(KEY)
    if (!raw) return []
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, index) => normalize(item, index))
      .filter((item): item is SourceConfig => !!item)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SOURCES)
  } catch {
    return []
  }
}

export function saveSourceConfig(source: SourceConfig): SourceConfig {
  const mode: SourceMode = source.mode === "marketplace" ? "marketplace" : "direct"
  const repositoryURL = mode === "marketplace"
    ? normalizeSourceURL(source.repositoryURL || source.sourceURL)
    : undefined
  const fixed: SourceConfig = {
    ...source,
    mode,
    name: cleanOneLine(source.name, 80),
    sourceURL: mode === "marketplace"
      ? normalizeSourceURL(source.repositoryURL || source.sourceURL)
      : normalizeSourceURL(source.sourceURL),
    repositoryURL,
    repositoryBranch: cleanOneLine(source.repositoryBranch, 200) || undefined,
    repositoryPath: cleanOneLine(source.repositoryPath, 512) || undefined,
    sourceKind: validSourceFormat(source.sourceKind),
    sourceFormatAuto: source.sourceFormatAuto !== false,
    target: validTargetFormat(source.target),
    updatedAt: Date.now(),
  }
  if (!fixed.name || !fixed.sourceURL) throw new Error("来源名称和地址不能为空")
  if (mode === "marketplace" && !fixed.repositoryURL) throw new Error("市场仓库地址不能为空")
  const next = loadSourceConfigs().filter((item) => item.id !== fixed.id)
  write([fixed, ...next])
  return fixed
}

export function createSourceConfig(input: {
  name: string
  sourceURL: string
  mode?: SourceMode
  repositoryURL?: string
  repositoryBranch?: string
  repositoryPath?: string
  moduleName?: string
  sourceUserAgent?: string
  sourceKind?: ScriptHubSourceFormat
  sourceFormatAuto?: boolean
  target?: ScriptHubTargetFormat
  defaultCategory?: string
  saveDir?: string
  autoImport?: boolean
  keepOriginalLink?: boolean
  removeSourceMetadata?: boolean
  enableJQ?: boolean
}): SourceConfig {
  const mode: SourceMode = input.mode === "marketplace" ? "marketplace" : "direct"
  const sourceURL = mode === "marketplace"
    ? String(input.repositoryURL || input.sourceURL).trim()
    : String(input.sourceURL ?? "").trim()
  return {
    id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanOneLine(input.name, 80),
    sourceURL,
    mode,
    repositoryURL: String(input.repositoryURL ?? "").trim() || undefined,
    repositoryBranch: cleanOneLine(input.repositoryBranch, 200) || undefined,
    repositoryPath: cleanOneLine(input.repositoryPath, 512) || undefined,
    moduleName: cleanOneLine(input.moduleName, 128) || undefined,
    sourceUserAgent: cleanOneLine(input.sourceUserAgent, 256) || undefined,
    sourceKind: input.sourceKind ?? "loon-plugin",
    sourceFormatAuto: input.sourceFormatAuto !== false,
    target: input.target ?? "surge-module",
    converter: "script-hub-beta",
    enabled: true,
    defaultCategory: cleanOneLine(input.defaultCategory, 64) || undefined,
    saveDir: String(input.saveDir ?? "").trim() || undefined,
    autoImport: input.autoImport !== false,
    keepOriginalLink: input.keepOriginalLink !== false,
    removeSourceMetadata: input.removeSourceMetadata !== false,
    enableJQ: input.enableJQ !== false,
    updatedAt: Date.now(),
  }
}

export function removeSourceConfig(id: string): void {
  const target = String(id ?? "").trim()
  if (!target) return
  write(loadSourceConfigs().filter((item) => item.id !== target))
}
