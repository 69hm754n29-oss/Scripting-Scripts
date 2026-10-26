import { normalizeSourceURL } from "./source_fetcher"

export type SourceAdapterKind = "loon-plugin"

export type SourceConfig = {
  id: string
  name: string
  sourceURL: string
  moduleName?: string
  sourceUserAgent?: string
  sourceKind: SourceAdapterKind
  target: "surge-module"
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

function normalize(value: unknown, index: number): SourceConfig | null {
  if (!value || typeof value !== "object") return null
  const item = value as any
  let sourceURL = ""
  try {
    sourceURL = normalizeSourceURL(item.sourceURL)
  } catch {
    return null
  }
  const name = cleanOneLine(item.name, 80)
  if (!sourceURL || !name) return null
  const id = cleanOneLine(item.id, 120) || `source-${Date.now()}-${index}`
  const updatedAt = Number(item.updatedAt)
  return {
    id,
    name,
    sourceURL,
    moduleName: cleanOneLine(item.moduleName, 128) || undefined,
    sourceUserAgent: cleanOneLine(item.sourceUserAgent, 256) || undefined,
    sourceKind: "loon-plugin",
    target: "surge-module",
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
  const fixed: SourceConfig = {
    ...source,
    name: cleanOneLine(source.name, 80),
    sourceURL: normalizeSourceURL(source.sourceURL),
    updatedAt: Date.now(),
  }
  if (!fixed.name || !fixed.sourceURL) throw new Error("来源名称和直链不能为空")
  const next = loadSourceConfigs().filter((item) => item.id !== fixed.id)
  write([fixed, ...next])
  return fixed
}

export function createSourceConfig(input: {
  name: string
  sourceURL: string
  moduleName?: string
  sourceUserAgent?: string
  defaultCategory?: string
  saveDir?: string
  autoImport?: boolean
  keepOriginalLink?: boolean
  removeSourceMetadata?: boolean
  enableJQ?: boolean
}): SourceConfig {
  return {
    id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanOneLine(input.name, 80),
    sourceURL: String(input.sourceURL ?? "").trim(),
    moduleName: cleanOneLine(input.moduleName, 128) || undefined,
    sourceUserAgent: cleanOneLine(input.sourceUserAgent, 256) || undefined,
    sourceKind: "loon-plugin",
    target: "surge-module",
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
