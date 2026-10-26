import type { ModuleInfo } from "./storage"

const KEY = "surge_modules_manager_module_metadata_v1"

export type ModuleMetadata = {
  category: string
  description: string
  author: string
  homepage: string
  tags: string[]
  notes: string
}

type MetadataMap = Record<string, ModuleMetadata>

export function moduleMetadataKey(module: ModuleInfo): string {
  const surgeName = String(module.surgeName ?? module.name).trim().toLocaleLowerCase()
  const path = String(module.filePath ?? "").trim()
  return path ? `file:${path}` : `surge:${surgeName}`
}

function readMap(): MetadataMap {
  const storage: any = (globalThis as any).Storage
  try {
    const raw = storage?.get?.(KEY) ?? storage?.getString?.(KEY)
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function getModuleMetadata(module: ModuleInfo): ModuleMetadata {
  const value = readMap()[moduleMetadataKey(module)] ?? {}
  return {
    category: String(value.category ?? ""),
    description: String(value.description ?? ""),
    author: String(value.author ?? ""),
    homepage: String(value.homepage ?? ""),
    tags: Array.isArray(value.tags) ? value.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [],
    notes: String(value.notes ?? ""),
  }
}

export function saveModuleMetadata(module: ModuleInfo, metadata: ModuleMetadata): void {
  const storage: any = (globalThis as any).Storage
  const map = readMap()
  map[moduleMetadataKey(module)] = {
    category: String(metadata.category ?? "").trim(),
    description: String(metadata.description ?? "").trim(),
    author: String(metadata.author ?? "").trim(),
    homepage: String(metadata.homepage ?? "").trim(),
    tags: Array.from(new Set(metadata.tags.map((tag) => String(tag).trim()).filter(Boolean))),
    notes: String(metadata.notes ?? "").trim(),
  }
  if (storage?.set) {
    const ok = storage.set(KEY, map)
    if (ok === false) throw new Error("保存模块介绍失败")
  } else if (storage?.setString) {
    const ok = storage.setString(KEY, JSON.stringify(map))
    if (ok === false) throw new Error("保存模块介绍失败")
  } else {
    throw new Error("Storage API 不可用")
  }
}
