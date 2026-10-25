import type { ShortcutParameter } from "scripting"

import { loadConfig } from "./config"
import {
  detectLinkPrefix,
  ensureStorage,
  getModulesDirResolved,
  loadModuleAtPath,
  loadModules,
  moduleFilePath,
  sortModules,
  type ModuleInfo,
} from "./storage"
import { downloadModule, writeModuleText } from "./downloader"
import { isSameRemoteUrl, parseScriptHubImport, sanitizeModuleName } from "./deep_link_import"
import { withTimeout } from "./async"

type ShortcutOptions = {
  category?: string
  dir?: string
  name?: string
  names?: string[]
}

export type ShortcutUpdateInput = {
  shortcutParameter?: ShortcutParameter
  textsParameter?: string[]
  fileURLsParameter?: string[]
  queryParameters?: Record<string, any> | null
}

export type ShortcutUpdateResult = {
  text: string
  logs: string[]
}

type Logger = (message: string) => void

const IMPORT_STAGE_TIMEOUT_MS = 15 * 1000
const IMPORT_TOTAL_TIMEOUT_MS = 60 * 1000

function clampConcurrency(value: number, total: number): number {
  if (total <= 0) return 1
  const fixed = Math.max(1, Math.min(10, Math.round(value || 3)))
  return Math.min(fixed, total)
}

function inferSaveDir(m: ModuleInfo): string | undefined {
  const path = String(m.filePath ?? "")
  const idx = path.lastIndexOf("/")
  return idx > 0 ? path.slice(0, idx) : undefined
}

function getTopDir(m: ModuleInfo, baseDir: string): string {
  const path = String(m.filePath ?? "")
  if (!path) return ""
  const rel = baseDir ? path.replace(baseDir, "").replace(/^\/+/, "") : path
  return rel.includes("/") ? rel.split("/")[0] : ""
}

function parseObjectOptions(obj: Record<string, any>): ShortcutOptions {
  return {
    category: String(obj.category ?? "").trim() || undefined,
    dir: String(obj.dir ?? obj.folder ?? "").trim() || undefined,
    name: String(obj.name ?? "").trim() || undefined,
    names: Array.isArray(obj.names)
      ? obj.names.map((v) => String(v ?? "").trim()).filter(Boolean)
      : undefined,
  }
}

function parseTextOptions(rawText: string): ShortcutOptions {
  const raw = String(rawText ?? "").trim()
  if (!raw || raw.toLowerCase() === "all" || raw === "全部") return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parseObjectOptions(parsed as Record<string, any>)
    }
  } catch {}
  return { category: raw }
}

function parseShortcutOptions(input: ShortcutUpdateInput, log: Logger): ShortcutOptions {
  const param = input.shortcutParameter
  log(`shortcutParameter: ${param ? param.type : "none"}`)
  if (input.textsParameter?.length) {
    log(`textsParameter: ${input.textsParameter.length}`)
  }

  if (param?.type === "json" && param.value && !Array.isArray(param.value)) {
    return parseObjectOptions(param.value as Record<string, any>)
  }

  if (param?.type === "text") {
    return parseTextOptions(param.value)
  }

  const firstText = input.textsParameter?.[0]
  if (firstText != null) {
    return parseTextOptions(firstText)
  }

  return {}
}

function applyShortcutFilters(list: ModuleInfo[], options: ShortcutOptions, baseDir: string): ModuleInfo[] {
  const names = new Set<string>([...(options.names ?? []), options.name ?? ""].filter(Boolean))
  return list.filter((m) => {
    if (options.category && m.category !== options.category) return false
    if (options.dir && getTopDir(m, baseDir) !== options.dir) return false
    if (names.size > 0 && !names.has(m.name) && !names.has(m.surgeName ?? "")) return false
    return true
  })
}

function formatOptions(options: ShortcutOptions): string {
  return JSON.stringify({
    category: options.category ?? "",
    dir: options.dir ?? "",
    name: options.name ?? "",
    names: options.names ?? [],
  })
}

function localPathFromFileURL(raw: unknown): string {
  const value = String(raw ?? "").trim()
  if (!value) throw new Error("本地文件路径为空")
  if (!/^file:\/\//i.test(value)) return value

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("本地文件 URL 无效")
  }
  if (url.hostname && url.hostname.toLowerCase() !== "localhost") {
    throw new Error("只允许导入本机文件")
  }
  return decodeURIComponent(url.pathname)
}

function localModuleName(filePath: string): string {
  const filename = decodeURIComponent(String(filePath).split("/").pop() ?? "")
  return sanitizeModuleName(filename || "本地模块")
}

async function runLocalFileImport(
  fileURLs: string[] | undefined,
  log: Logger,
): Promise<ShortcutUpdateResult | null> {
  const files = fileURLs ?? []
  const rawSource = files[0]
  if (!rawSource) return null
  if (files.length > 1) log(`local file input: ${files.length} files, importing the first one`)

  const fm: any = (globalThis as any).FileManager
  if (!fm?.readAsString) throw new Error("FileManager.readAsString 不可用")

  const sourcePath = localPathFromFileURL(rawSource)
  const name = localModuleName(sourcePath)
  log(`local file import requested: ${name}`)
  log("local import stage: resolving bookmarked folder")
  await withTimeout(
    () => ensureStorage(),
    IMPORT_STAGE_TIMEOUT_MS,
    `访问书签目录超时（${IMPORT_STAGE_TIMEOUT_MS / 1000}s），请确认 Surge iCloud 目录已授权并可用`,
  )
  const baseDir = await withTimeout(
    () => getModulesDirResolved(),
    IMPORT_STAGE_TIMEOUT_MS,
    `解析书签目录超时（${IMPORT_STAGE_TIMEOUT_MS / 1000}s），请重新选择 Surge 目录`,
  )
  if (!baseDir) throw new Error("书签路径不可用，请在设置页重新选择书签文件夹")

  log(`local import stage: reading ${name}`)
  const content = await withTimeout(
    () => fm.readAsString(sourcePath),
    IMPORT_STAGE_TIMEOUT_MS,
    `读取本地模块超时（${IMPORT_STAGE_TIMEOUT_MS / 1000}s）：${name}`,
  )
  const targetPath = moduleFilePath(name, baseDir)
  const existing = await withTimeout(
    () => loadModuleAtPath(targetPath),
    IMPORT_STAGE_TIMEOUT_MS,
    `读取目标模块超时（${IMPORT_STAGE_TIMEOUT_MS / 1000}s）：${targetPath}`,
  )
  const result = await withTimeout(
    () => writeModuleText(
      {
        name,
        link: "",
        category: existing?.category,
        saveDir: baseDir,
      },
      baseDir,
      String(content ?? ""),
    ),
    IMPORT_TOTAL_TIMEOUT_MS,
    `本地模块写入超时（${IMPORT_TOTAL_TIMEOUT_MS / 1000}s）：${targetPath}`,
  )
  if (!result.ok) throw new Error(result.message ?? "本地模块写入失败")

  log(`local import stage: write verified at ${result.path ?? "unknown"}`)
  return {
    text: `Surge 本地模块${existing ? "已覆盖" : "已导入"}：${name}\n写入路径：${result.path ?? "未返回路径"}\n请回到 Surge 刷新或重新启用该本地模块。`,
    logs: [],
  }
}

async function runScriptHubImport(
  queryParameters: Record<string, any> | null | undefined,
  log: Logger
): Promise<ShortcutUpdateResult | null> {
  const request = parseScriptHubImport(queryParameters)
  if (!request) return null

  log(`Script-Hub import requested: name=${request.name}, url=${/^https?:\/\/script\.hub\//i.test(request.url) ? "script.hub" : "https"}`)
  log("import stage: resolving bookmarked folder")
  await withTimeout(
    () => ensureStorage(),
    IMPORT_STAGE_TIMEOUT_MS,
    `访问书签目录超时（${IMPORT_STAGE_TIMEOUT_MS / 1000}s），请确认 Surge iCloud 目录已授权并可用`,
  )
  const baseDir = await withTimeout(
    () => getModulesDirResolved(),
    IMPORT_STAGE_TIMEOUT_MS,
    `解析书签目录超时（${IMPORT_STAGE_TIMEOUT_MS / 1000}s），请重新选择 Surge 目录`,
  )
  if (!baseDir) throw new Error("书签路径不可用，请在设置页重新选择书签文件夹")

  log(`import stage: target folder=${baseDir}`)
  // Do not recursively scan the complete iCloud bookmark here. The import
  // destination is the selected root; walking every subfolder is both
  // unnecessary and a common source of a background Intent appearing stuck.
  const existingPath = moduleFilePath(request.name, baseDir)
  const sameName = await withTimeout(
    () => loadModuleAtPath(existingPath),
    IMPORT_STAGE_TIMEOUT_MS,
    `读取目标模块超时（${IMPORT_STAGE_TIMEOUT_MS / 1000}s）：${existingPath}`,
  )
  if (sameName && !isSameRemoteUrl(sameName.link, request.url)) {
    throw new Error(`本地已存在同名模块“${request.name}”，且来源不同；为避免覆盖，导入已取消`)
  }

  log(`import stage: downloading ${request.url}`)
  const result = await withTimeout(
    async () =>
      downloadModule(
        {
          name: sameName?.name ?? request.name,
          link: request.url,
          category: request.category ?? sameName?.category,
          saveDir: baseDir,
          linkPrefix: sameName ? await detectLinkPrefix(sameName) : undefined,
        },
        { mode: "direct" },
      ),
    IMPORT_TOTAL_TIMEOUT_MS,
    `Script-Hub 导入超时（${IMPORT_TOTAL_TIMEOUT_MS / 1000}s）。可能是 script.hub 未通过 Surge 解析，或 iCloud 目录暂不可写`,
  )
  if (!result.ok) throw new Error(result.message ?? "模块下载失败")

  const state = sameName ? "已更新" : "已导入"
  log(`import stage: write verified at ${result.path ?? "unknown"}`)
  log(`Script-Hub import completed: ${request.name}`)
  return {
    text: `Surge 本地模块${state}：${request.name}\n写入路径：${result.path ?? "未返回路径"}\n请回到 Surge 刷新或重新启用该本地模块。`,
    logs: [],
  }
}

export async function runShortcutUpdate(input: ShortcutUpdateInput = {}): Promise<ShortcutUpdateResult> {
  const logs: string[] = []
  const log = (message: string) => {
    const line = `[Surge模块管理][Intent] ${message}`
    logs.push(line)
    console.log(line)
  }

  try {
    log("start")
    log(`query parameters: ${Object.keys(input.queryParameters ?? {}).join(", ") || "none"}`)

    // Script-Hub imports do not need the batch-update configuration. Resolve
    // this path first so a stale config/Storage read cannot block a deep-link
    // import before its stage timeouts are installed.
    const importResult = await runScriptHubImport(input.queryParameters, log)
    if (importResult) return importResult

    const localFileResult = await runLocalFileImport(input.fileURLsParameter, log)
    if (localFileResult) return localFileResult

    const cfg = loadConfig()
    log(`config loaded: concurrency=${cfg.downloadConcurrency}, bookmark=${cfg.baseBookmarkName || "none"}`)

    const options = parseShortcutOptions(input, log)
    log(`filters: ${formatOptions(options)}`)

    await ensureStorage()
    log("storage ensured")

    const baseDir = await getModulesDirResolved()
    log(`baseDir: ${baseDir || "empty"}`)

    const allModules = sortModules(await loadModules())
    log(`modules scanned: ${allModules.length}`)

    const filteredModules = applyShortcutFilters(allModules, options, baseDir)
    const targetModules = filteredModules.filter((m) => !!m.link)
    log(`modules matched: ${filteredModules.length}, downloadable: ${targetModules.length}`)

    if (!targetModules.length) {
      return {
        text: `没有找到可更新的远程模块\n\n${logs.join("\n")}`,
        logs,
      }
    }

    let okCount = 0
    let nextIndex = 0
    const errors: string[] = []
    const total = targetModules.length
    const concurrency = clampConcurrency(cfg.downloadConcurrency, total)
    log(`download start: total=${total}, concurrency=${concurrency}`)

    async function worker(workerIndex: number) {
      for (;;) {
        const index = nextIndex
        nextIndex += 1
        if (index >= total) return

        const moduleInfo = targetModules[index]
        log(`worker ${workerIndex}: updating ${moduleInfo.name}`)
        try {
          const linkPrefix = await detectLinkPrefix(moduleInfo)
          log(`worker ${workerIndex}: ${moduleInfo.name} prefix=${linkPrefix ?? "none"}`)
          const res = await downloadModule(
            {
              ...moduleInfo,
              saveDir: inferSaveDir(moduleInfo),
              linkPrefix,
            },
            { mode: "direct" }
          )
          if (res.ok) {
            okCount += 1
            log(`worker ${workerIndex}: ${moduleInfo.name} ok`)
          } else {
            const msg = `${moduleInfo.name}: ${res.message ?? "下载失败"}`
            errors.push(msg)
            log(`worker ${workerIndex}: ${msg}`)
          }
        } catch (e: any) {
          const msg = `${moduleInfo.name}: ${String(e?.stack ?? e?.message ?? e)}`
          errors.push(msg)
          log(`worker ${workerIndex}: ${msg}`)
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)))
    log(`download finished: ok=${okCount}, total=${total}, errors=${errors.length}`)

    const lines = [
      `Surge 模块更新完成：成功 ${okCount}/${total}`,
      `并发数：${concurrency}`,
    ]
    if (errors.length) {
      lines.push("失败模块：")
      lines.push(...errors.slice(0, 20))
      if (errors.length > 20) lines.push(`其余 ${errors.length - 20} 个失败已省略`)
    }
    lines.push("", "调试日志：", ...logs)

    return { text: lines.join("\n"), logs }
  } catch (e: any) {
    const message = String(e?.stack ?? e?.message ?? e)
    log(`fatal: ${message}`)
    return {
      text: `Surge 模块更新失败：${message}\n\n调试日志：\n${logs.join("\n")}`,
      logs,
    }
  }
}
