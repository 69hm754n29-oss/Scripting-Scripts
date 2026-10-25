export function validateSurgeModuleText(rawText: string): string {
  const content = String(rawText ?? "")
  if (!content.trim()) throw new Error("下载内容为空")
  if (content.length > 2 * 1024 * 1024) throw new Error("模块内容超过 2 MiB 限制")

  // A module may consist only of metadata, but an HTML error/login page must
  // never replace a local .sgmodule file during refresh or deep-link import.
  const hasMetadata = /^\s*#!\s*(name|desc|category|icon)\s*=/im.test(content)
  const hasSection = /^\s*\[(General|Rule|Rule Set|URL Rewrite|Header Rewrite|Body Rewrite|Map Local|Script|MITM|Host|Proxy)\]\s*$/im.test(content)
  if (!hasMetadata && !hasSection) {
    throw new Error("下载内容不是可识别的 Surge 模块")
  }
  return content
}
