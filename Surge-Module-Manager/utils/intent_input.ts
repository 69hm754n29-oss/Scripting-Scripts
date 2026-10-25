/**
 * Normalize file inputs across Scripting releases.
 *
 * The public Intent quick-start documents `fileURLsParameter`, while the
 * FileManager documentation also refers to the share-sheet grant as
 * `filesParameter`.  The latter can be an array of strings or small wrapper
 * objects, depending on the host version.  Keep this compatibility layer
 * isolated so the import path never guesses at the configured bookmark.
 */
function collectFileURLs(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return []
  if (typeof value === "string") {
    const text = value.trim()
    return text ? [text] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectFileURLs(item, depth + 1))
  }
  if (typeof value !== "object") return []

  const item = value as Record<string, unknown>
  const fields = ["path", "url", "fileURL", "fileUrl", "localPath", "value"]
  for (const field of fields) {
    const found = collectFileURLs(item[field], depth + 1)
    if (found.length) return found
  }
  return []
}

export function getIntentFileURLs(intent: any): string[] {
  const values = [
    intent?.fileURLsParameter,
    intent?.filesParameter,
    // Keep compatibility with a casing variant seen in older bridges.
    intent?.fileUrlsParameter,
  ]
  return Array.from(new Set(values.flatMap((value) => collectFileURLs(value))))
}

