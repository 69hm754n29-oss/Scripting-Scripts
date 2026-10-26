import type { ModuleInfo } from "./storage"
import { getModuleMetadata, type ModuleMetadata } from "./module_metadata"

export type ModuleManifestItem = {
  name: string
  surgeName?: string
  category?: string
  sourceURL?: string
  link?: string
  relativePath?: string
  isRemoteOnly: boolean
  remoteAvailable: boolean
  remoteEnabled: boolean
  metadata: ModuleMetadata
}

export type ModuleManifest = {
  manifestVersion: 1
  exportedAt: string
  note: string
  modules: ModuleManifestItem[]
}

function relativePath(path: string, baseDir: string): string | undefined {
  const raw = String(path ?? "").trim()
  const base = String(baseDir ?? "").replace(/\/+$/, "")
  if (!raw || !base || !raw.startsWith(`${base}/`)) return undefined
  return raw.slice(base.length + 1)
}

export function buildModuleManifest(
  modules: ModuleInfo[],
  baseDir: string,
  available: Set<string>,
  enabled: Set<string>,
): ModuleManifest {
  return {
    manifestVersion: 1,
    exportedAt: new Date().toISOString(),
    note: "此清单包含模块管理信息。Surge API-only 模块不包含 Surge 未提供的模块正文。",
    modules: modules.map((module) => {
      const remoteName = String(module.surgeName ?? module.name).trim()
      return {
        name: module.name,
        surgeName: module.surgeName,
        category: module.category,
        sourceURL: module.sourceURL,
        link: module.link || undefined,
        relativePath: relativePath(String(module.filePath ?? ""), baseDir),
        isRemoteOnly: !!module.isRemoteOnly,
        remoteAvailable: available.has(remoteName),
        remoteEnabled: enabled.has(remoteName),
        metadata: getModuleMetadata(module),
      }
    }),
  }
}

export async function exportModuleManifest(manifest: ModuleManifest): Promise<string> {
  const picker: any = (globalThis as any).DocumentPicker
  const Data: any = (globalThis as any).Data
  if (!picker?.exportFiles || !Data?.fromString) throw new Error("当前 Scripting 不支持导出清单")
  const data = Data.fromString(JSON.stringify(manifest, null, 2))
  const paths = await picker.exportFiles({
    files: [{ data, name: "surge-modules-manifest.json" }],
  })
  const path = Array.isArray(paths) ? String(paths[0] ?? "") : ""
  if (!path) throw new Error("未选择导出位置")
  return path
}

export function manifestText(manifest: ModuleManifest): string {
  return JSON.stringify(manifest, null, 2)
}
