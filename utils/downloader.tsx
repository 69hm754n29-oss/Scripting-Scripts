import { Path } from "scripting"
import {
  formatLinkLine,
  getLinkPrefixes,
  moduleFilePath,
  ensureStorage,
  type ModuleInfo,
  getModulesDirResolved,
} from "./storage"
import { downloadWithProgress } from "./stream_downloader"
import { validateSurgeModuleText } from "./module_validation"
import { withTimeout } from "./async"

export type DownloadModuleOptions = {
  mode?: "stream" | "direct"
}

const FETCH_TIMEOUT_MS = 30 * 1000
const FILE_OPERATION_TIMEOUT_MS = 15 * 1000

async function writeString(fm: any, path: string, content: string): Promise<void> {
  const writer = typeof fm?.writeAsString === "function"
    ? fm.writeAsString
    : fm?.writeAsStringSync
  if (typeof writer !== "function") throw new Error("FileManager.writeAsString 不可用")
  const result = writer.call(fm, path, content)
  if (result && typeof result.then === "function") await result
  if (result === false) throw new Error(`FileManager 拒绝写入：${path}`)
}

function fetchTimeoutMessage(url: string): string {
  if (/^https?:\/\/script\.hub(?:\/|$)/i.test(url)) {
    return `Script-Hub 转换结果请求超时（${FETCH_TIMEOUT_MS / 1000}s）。script.hub/file 不是普通公网下载地址，必须确认当前 Scripting 流量经过 Surge，且 Script Hub 模块和脚本均已启用`
  }
  return `模块请求超时（${FETCH_TIMEOUT_MS / 1000}s）：${url}`
}

function injectNameFlag(content: string): string {
  if (content.includes("🔗")) return content
  return content.replace(/#!\s*name\s*=/i, "#!name=🔗")
}

function injectCategory(content: string, category?: string): string {
  const cat = String(category ?? "").trim()
  if (!cat) return content
  const line = `#!category=${cat}`
  if (/^\s*#!\s*category\s*=.*$/im.test(content)) {
    return content.replace(/^\s*#!\s*category\s*=.*$/im, line)
  }
  return `${line}\n${content}`
}

function injectUrl(content: string, url?: string, preferredPrefix?: string): string {
  const u = String(url ?? "").trim()
  if (!u) return content
  const prefixes = getLinkPrefixes()
  const first = preferredPrefix && prefixes.includes(preferredPrefix) ? preferredPrefix : prefixes[0] ?? "#url="
  const lines = String(content ?? "").split(/\r?\n/g)
  const filtered = lines.filter((line) => {
    const t = line.trimStart()
    return !prefixes.some((p) => t.startsWith(p))
  })
  return `${formatLinkLine(first, u)}\n${filtered.join("\n")}`
}

async function fetchModuleText(url: string): Promise<string> {
  const fetchFn: any = (globalThis as any).fetch
  if (typeof fetchFn !== "function") throw new Error("fetch 不可用")

  const controller = typeof AbortController === "function" ? new AbortController() : undefined
  const isScriptHubHttp = /^http:\/\/script\.hub(?:\/|$)/i.test(url)
  try {
    return await withTimeout(
      async () => {
        const requestInit: any = {
          headers: {
            // Match Scriptable's SurgeModuleTool request.  The Script-Hub
            // converter is exposed through Surge's local `script.hub` route;
            // keeping its expected UA avoids a host-specific rewrite branch.
            "User-Agent": "script-hub/1.0.0",
            Accept: "*/*",
          },
          // Script-Hub's iOS-facing endpoint is intentionally HTTP and is
          // resolved by the iOS Surge module. Scripting otherwise rejects an
          // insecure request before it can reach that local route.
          ...(isScriptHubHttp ? { allowInsecureRequest: true } : {}),
          timeout: FETCH_TIMEOUT_MS / 1000,
          debugLabel: isScriptHubHttp ? "Script-Hub 转换模块" : "Surge 模块更新",
          ...(controller ? { signal: controller.signal } : {}),
        }
        // Scriptable uses `new Request(url)` followed by `loadString()`. Use
        // Scripting's Request object when available as the closest equivalent;
        // retain the plain-fetch fallback for older Scripting runtimes.
        const RequestCtor: any = (globalThis as any).Request
        const request = typeof RequestCtor === "function"
          ? new RequestCtor(url, requestInit)
          : null
        const res = request ? await fetchFn(request) : await fetchFn(url, requestInit)
        const status = Number(res?.status ?? 0)
        if (status < 200 || status >= 400) {
          throw new Error(`HTTP ${res?.status ?? "unknown"} ${res?.statusText ?? ""}`.trim())
        }
        if (typeof res.text !== "function") throw new Error("Response.text 不可用")
        return String(await res.text())
      },
      FETCH_TIMEOUT_MS,
      fetchTimeoutMessage(url),
    )
  } catch (e: any) {
    try { controller?.abort() } catch {}
    throw e
  }
}

async function writeFinalModule(
  fm: any,
  info: ModuleInfo & { linkPrefix?: string },
  targetDir: string,
  rawText: string
): Promise<string> {
  const safeText = validateSurgeModuleText(rawText)

  let content = injectNameFlag(safeText)
  content = injectUrl(content, info.link, info.linkPrefix)
  content = injectCategory(content, info.category)

  const path = moduleFilePath(info.name, targetDir)
  await withTimeout(
    () => writeString(fm, path, content),
    FILE_OPERATION_TIMEOUT_MS,
    `写入模块超时（${FILE_OPERATION_TIMEOUT_MS / 1000}s）：${path}`,
  )
  // File-provider bookmarks may accept a write request before the provider
  // has actually committed it. Read the file back when supported so an
  // import cannot report success while nothing reached Surge's directory.
  if (typeof fm.readAsString === "function") {
    const saved = String(
      await withTimeout(
        () => fm.readAsString(path),
        FILE_OPERATION_TIMEOUT_MS,
        `写入校验超时（${FILE_OPERATION_TIMEOUT_MS / 1000}s）：${path}`,
      ),
    )
    if (saved !== content) throw new Error(`写入后校验失败：${path}`)
  }
  return path
}

/**
 * Write already available module text into the selected Surge bookmark.
 * This is intentionally separate from downloadModule so a local .sgmodule
 * shared from Files can bypass the network and script.hub entirely.
 */
export async function writeModuleText(
  info: ModuleInfo & { linkPrefix?: string },
  targetDir: string,
  rawText: string,
): Promise<{ ok: boolean; message?: string; path?: string }> {
  const fm: any = (globalThis as any).FileManager
  if (!fm?.writeAsString) return { ok: false, message: "FileManager.writeAsString 不可用" }
  try {
    // A file shared from Files is already the converted module. Keep it
    // byte-for-byte as text: do not inject a remote URL/name marker that
    // belongs to the URL-download path.
    const content = validateSurgeModuleText(rawText)
    const path = moduleFilePath(info.name, targetDir)
    await withTimeout(
      () => writeString(fm, path, content),
      FILE_OPERATION_TIMEOUT_MS,
      `写入本地模块超时（${FILE_OPERATION_TIMEOUT_MS / 1000}s）：${path}`,
    )
    if (typeof fm.readAsString === "function") {
      const saved = String(
        await withTimeout(
          () => fm.readAsString(path),
          FILE_OPERATION_TIMEOUT_MS,
          `本地模块校验超时（${FILE_OPERATION_TIMEOUT_MS / 1000}s）：${path}`,
        ),
      )
      if (saved !== content) throw new Error(`写入后校验失败：${path}`)
    }
    return { ok: true, path }
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) }
  }
}

async function downloadModuleDirect(
  fm: any,
  info: ModuleInfo & { linkPrefix?: string },
  targetDir: string
): Promise<string> {
  const text = await fetchModuleText(info.link)
  return writeFinalModule(fm, info, targetDir, text)
}

async function downloadModuleStream(
  fm: any,
  info: ModuleInfo & { linkPrefix?: string },
  targetDir: string
): Promise<string> {
  const tmpDir = fm.temporaryDirectory ?? Path.join(Path.dirname(moduleFilePath(info.name, targetDir)), ".tmp")
  const tmpPath = Path.join(tmpDir, `${info.name}_${Date.now()}.tmp`)

  try {
    await downloadWithProgress(info.link, tmpPath)
  } catch (e: any) {
    throw new Error(`下载失败: ${String(e?.message ?? e)}`)
  }

  let text = ""
  try {
    text = await fm.readAsString(tmpPath)
  } catch (e: any) {
    throw new Error(`读取文件失败: ${String(e?.message ?? e)}`)
  }

  try {
    return await writeFinalModule(fm, info, targetDir, text)
  } finally {
    try {
      if (typeof fm.remove === "function") await fm.remove(tmpPath)
      else if (typeof fm.removeSync === "function") fm.removeSync(tmpPath)
    } catch {}
  }
}

export async function downloadModule(
  info: ModuleInfo & { linkPrefix?: string },
  options: DownloadModuleOptions = {}
): Promise<{ ok: boolean; message?: string; path?: string }> {
  await ensureStorage()

  const fm: any = (globalThis as any).FileManager
  if (!fm?.writeAsString) {
    return { ok: false, message: "FileManager.writeAsString 不可用" }
  }
  if (options.mode !== "direct" && !fm?.readAsString) {
    return { ok: false, message: "FileManager.readAsString 不可用" }
  }

  const targetDir = info.saveDir ?? (await getModulesDirResolved())
  try {
    let path: string
    if (options.mode === "direct") {
      path = await downloadModuleDirect(fm, info, targetDir)
    } else {
      path = await downloadModuleStream(fm, info, targetDir)
    }
    return { ok: true, path }
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) }
  }
}
