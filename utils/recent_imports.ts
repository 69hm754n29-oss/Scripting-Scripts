export type RecentImport = {
  name: string
  link: string
  category?: string
  importedAt: number
}

const KEY = "surge_modules_manager_recent_imports_v1"
const MAX_ITEMS = 8

function storage(): any {
  return (globalThis as any).Storage
}

function normalize(value: unknown): RecentImport | null {
  if (!value || typeof value !== "object") return null
  const item = value as any
  const name = String(item.name ?? "").trim()
  if (!name) return null
  const link = String(item.link ?? "").trim()
  const category = String(item.category ?? "").trim()
  const importedAt = Number(item.importedAt)
  return {
    name,
    link,
    ...(category ? { category } : {}),
    importedAt: Number.isFinite(importedAt) && importedAt > 0 ? importedAt : 0,
  }
}

function write(items: RecentImport[]): void {
  const st = storage()
  const fixed = items.slice(0, MAX_ITEMS)
  if (typeof st?.set === "function") {
    st.set(KEY, fixed)
    return
  }
  if (typeof st?.setString === "function") {
    st.setString(KEY, JSON.stringify(fixed))
  }
}

export function loadRecentImports(): RecentImport[] {
  const st = storage()
  try {
    const raw = st?.get?.(KEY) ?? st?.getString?.(KEY)
    if (!raw) return []
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalize)
      .filter((item): item is RecentImport => !!item)
      .sort((a, b) => b.importedAt - a.importedAt)
      .slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

export function recordRecentImport(input: {
  name: string
  link?: string
  category?: string
}): void {
  const name = String(input.name ?? "").trim()
  if (!name) return
  const link = String(input.link ?? "").trim()
  const category = String(input.category ?? "").trim()
  const identity = link || name
  const next: RecentImport = {
    name,
    link,
    ...(category ? { category } : {}),
    importedAt: Date.now(),
  }
  const items = loadRecentImports().filter((item) => (item.link || item.name) !== identity)
  write([next, ...items])
}

export function clearRecentImports(): void {
  write([])
}
