import {
  createSourceFetchClient,
  normalizeSourceURL,
  type SourceFetchClient,
} from "./source_fetcher"

export type GitHubRepositoryRef = {
  owner: string
  repository: string
  branch: string
  path: string
}

export type GitHubCatalogItem = {
  id: string
  name: string
  kind: "directory" | "module"
  path: string
  sourceURL?: string
  htmlURL?: string
  size?: number
}

const GITHUB_HOST = "github.com"
const GITHUB_API_HOST = "api.github.com"
const DEFAULT_BRANCH = "main"
// GitHub's Contents API returns at most 1,000 entries for one directory. Keep
// the adapter within that bound so larger markets such as Rewrite do not lose
// valid files merely because the first page contains unrelated entries.
const MAX_ITEMS = 1000
// Keep the catalog focused on proxy scripts/modules instead of exposing every
// README, package file, or internal source file in a third-party repository.
// `.js` is included because several open-source markets publish their primary
// QX/Surge/Loon scripts as JavaScript files.
const MODULE_FILE_PATTERN = /\.(?:js|sgmodule|sgmodulle|plugin|lpx|conf|list|rules?|snippet)$/i

function cleanSegment(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength)
}

function normalizePath(value: unknown): string {
  return String(value ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/")
}

function isValidGitHubSegment(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value)
}

/**
 * Parse only public github.com repository URLs. The adapter never embeds a
 * repository in the app; the caller supplies the URL and optional branch.
 */
export function parseGitHubRepositoryURL(value: unknown, branchOverride?: unknown): GitHubRepositoryRef {
  const normalized = normalizeSourceURL(value)
  const parsed = new URL(normalized)
  if (parsed.hostname.toLowerCase() !== GITHUB_HOST || parsed.username || parsed.password) {
    throw new Error("市场来源必须是 github.com 公共仓库地址")
  }

  const parts = parsed.pathname.split("/").filter(Boolean).map((item) => decodeURIComponent(item))
  if (parts.length < 2) throw new Error("GitHub 仓库地址缺少 owner 或仓库名")

  const owner = cleanSegment(parts[0], 100)
  const repository = cleanSegment(parts[1].replace(/\.git$/i, ""), 100)
  if (!isValidGitHubSegment(owner) || !isValidGitHubSegment(repository)) {
    throw new Error("GitHub owner 或仓库名无效")
  }

  let branch = cleanSegment(branchOverride, 200) || cleanSegment(parsed.searchParams.get("ref"), 200) || DEFAULT_BRANCH
  let path = ""
  const treeOrBlob = parts[2]
  if (treeOrBlob === "tree" || treeOrBlob === "blob") {
    branch = cleanSegment(branchOverride, 200) || cleanSegment(parts[3], 200) || branch
    path = normalizePath(parts.slice(4).join("/"))
  }
  if (!branch || /[\u0000\r\n]/.test(branch) || branch.startsWith("/") || branch.endsWith("/")) {
    throw new Error("GitHub 分支名无效；含斜杠的分支请在分支输入框中填写")
  }

  return { owner, repository, branch, path }
}

export function buildGitHubRepositoryURL(ref: GitHubRepositoryRef, path = ref.path): string {
  const cleanPath = normalizePath(path)
  const segments = [GITHUB_HOST, ref.owner, ref.repository, "tree", ref.branch, ...cleanPath.split("/").filter(Boolean)]
  return `https://${segments.map((segment) => encodeURIComponent(segment)).join("/")}`
}

function buildContentsURL(ref: GitHubRepositoryRef, path: string): string {
  const encodedPath = normalizePath(path)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  const suffix = encodedPath ? `/contents/${encodedPath}` : "/contents"
  const url = new URL(`https://${GITHUB_API_HOST}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}${suffix}`)
  url.searchParams.set("ref", ref.branch)
  return url.toString()
}

function moduleNameFromPath(path: string): string {
  const filename = path.split("/").filter(Boolean).pop() ?? ""
  return filename.replace(/\.(?:js|sgmodule|sgmodulle|plugin|lpx|conf|list|rules?|snippet)$/i, "") || filename
}

/**
 * Load one directory only. Nothing is crawled recursively: opening a folder
 * is the explicit user action that triggers its next request.
 */
export async function listGitHubRepositoryDirectory(
  repositoryURL: string,
  branch?: string,
  path?: string,
  fetchClient: SourceFetchClient = createSourceFetchClient(),
): Promise<{ ref: GitHubRepositoryRef; items: GitHubCatalogItem[] }> {
  const parsed = parseGitHubRepositoryURL(repositoryURL, branch)
  const currentPath = normalizePath(path ?? parsed.path)
  const response = await fetchClient.json<unknown>(buildContentsURL(parsed, currentPath), {
    userAgent: "SurgeModulesManager/1.0",
    debugLabel: "GitHub 第三方模块市场",
    maxChars: 1024 * 1024,
  })
  if (!Array.isArray(response)) {
    throw new Error("GitHub 地址不是可浏览的目录；请填写仓库地址或目录地址")
  }

  const items: GitHubCatalogItem[] = []
  for (const raw of response.slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== "object") continue
    const item = raw as any
    const itemPath = normalizePath(item.path)
    const itemName = cleanSegment(item.name, 160)
    if (!itemPath || !itemName) continue
    if (item.type === "dir") {
      items.push({
        id: `dir:${itemPath}`,
        name: itemName,
        kind: "directory",
        path: itemPath,
        htmlURL: typeof item.html_url === "string" ? item.html_url : undefined,
      })
      continue
    }
    if (item.type !== "file" || !MODULE_FILE_PATTERN.test(itemName)) continue
    let sourceURL = ""
    try {
      sourceURL = normalizeSourceURL(item.download_url)
    } catch {
      continue
    }
    items.push({
      id: `module:${itemPath}`,
      name: itemName,
      kind: "module",
      path: itemPath,
      sourceURL,
      htmlURL: typeof item.html_url === "string" ? item.html_url : undefined,
      size: Number.isFinite(Number(item.size)) ? Number(item.size) : undefined,
    })
  }

  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
    return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true, sensitivity: "base" })
  })
  return { ref: { ...parsed, path: currentPath }, items }
}

export function catalogItemModuleName(item: GitHubCatalogItem): string {
  return moduleNameFromPath(item.path)
}

export function parentRepositoryPath(path: string): string {
  const parts = normalizePath(path).split("/").filter(Boolean)
  parts.pop()
  return parts.join("/")
}
