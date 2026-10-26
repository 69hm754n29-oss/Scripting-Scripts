import type { AppConfig } from "./config"
import { withTimeout } from "./async"

const REMOTE_REQUEST_TIMEOUT_MS = 8 * 1000

export type RemoteConnectionResult = {
  latencyMs: number
  enabledCount: number
}

export type RemoteModuleSnapshot = {
  available: string[]
  enabled: Set<string>
}

export function getRemoteBaseURL(cfg: AppConfig): string {
  const host = String(cfg.remoteHost ?? "http://127.0.0.1").trim() || "http://127.0.0.1"
  const port = String(cfg.remotePort ?? "").trim()
  return port ? `${host.replace(/\/+$/, "")}:${port}` : ""
}

export function getModuleRemoteName(module: { name: string; surgeName?: string }): string {
  return String(module.surgeName ?? "").trim() || module.name
}

function remoteHeaders(cfg: AppConfig): Record<string, string> {
  return {
    "X-Key": String(cfg.remotePassword ?? ""),
    "Content-Type": "application/json",
  }
}

function parseNames(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean)
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => !!enabled)
      .map(([name]) => String(name).trim())
      .filter(Boolean)
  }
  return []
}

export async function fetchRemoteModuleSnapshot(cfg: AppConfig): Promise<RemoteModuleSnapshot> {
  const baseURL = getRemoteBaseURL(cfg)
  if (!baseURL) return { available: [], enabled: new Set() }
  const fetchFn: any = (globalThis as any).fetch
  if (typeof fetchFn !== "function") throw new Error("fetch 不可用")

  const res = await withTimeout(
    () => fetchFn(`${baseURL}/v1/modules`, {
      method: "GET",
      headers: remoteHeaders(cfg),
    }),
    REMOTE_REQUEST_TIMEOUT_MS,
    `远程状态请求超时（${REMOTE_REQUEST_TIMEOUT_MS / 1000}s）`,
  )
  if (!res?.ok) throw new Error(`请求失败：${res?.status ?? "unknown"}`)
  const data = await res.json()
  return {
    available: Array.from(new Set(parseNames(data?.available))),
    enabled: new Set(parseNames(data?.enabled)),
  }
}

export async function fetchEnabledModuleNames(cfg: AppConfig): Promise<Set<string>> {
  return (await fetchRemoteModuleSnapshot(cfg)).enabled
}

/**
 * Verify the same read endpoint used by the module status badges. Keeping the
 * test on this path avoids claiming that the port is healthy when only a
 * different endpoint happens to respond.
 */
export async function testRemoteConnection(cfg: AppConfig): Promise<RemoteConnectionResult> {
  if (!getRemoteBaseURL(cfg)) throw new Error("请先配置 HTTP 远程控制端口")
  const startedAt = Date.now()
  const enabled = await fetchEnabledModuleNames(cfg)
  return {
    latencyMs: Math.max(0, Date.now() - startedAt),
    enabledCount: enabled.size,
  }
}

export async function setRemoteModuleEnabled(
  cfg: AppConfig,
  moduleName: string,
  enabled: boolean
): Promise<void> {
  const baseURL = getRemoteBaseURL(cfg)
  if (!baseURL) throw new Error("请先配置 HTTP 远程控制端口")
  const fetchFn: any = (globalThis as any).fetch
  if (typeof fetchFn !== "function") throw new Error("fetch 不可用")

  const res = await withTimeout(
    () => fetchFn(`${baseURL}/v1/modules`, {
      method: "POST",
      headers: remoteHeaders(cfg),
      body: JSON.stringify({ [moduleName]: enabled }),
    }),
    REMOTE_REQUEST_TIMEOUT_MS,
    `远程开关请求超时（${REMOTE_REQUEST_TIMEOUT_MS / 1000}s）`,
  )
  if (!res?.ok) throw new Error(`请求失败：${res?.status ?? "unknown"}`)
}
