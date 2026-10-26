import { Intent, Script } from "scripting"

import { runShortcutUpdate } from "./utils/shortcut_update"
import { resolveScriptHubQueryParameters } from "./utils/deep_link_import"
import { getIntentFileURLs } from "./utils/intent_input"

;(async () => {
  try {
    const queryParameters = resolveScriptHubQueryParameters(Script.queryParameters, [
      ...(Intent.urlsParameter ?? []),
      ...(Intent.textsParameter ?? []),
      Intent.shortcutParameter,
    ])
    const fileURLs = getIntentFileURLs(Intent as any)
    const result = await runShortcutUpdate({
      shortcutParameter: Intent.shortcutParameter,
      urlsParameter: Intent.urlsParameter,
      textsParameter: Intent.textsParameter,
      fileURLsParameter: fileURLs,
      queryParameters,
    })
    Script.exit(Intent.text(result.text))
  } catch (e: any) {
    const message = String(e?.stack ?? e?.message ?? e)
    console.log(`[Surge模块管理][Intent] fatal: ${message}`)
    Script.exit(Intent.text(`Surge 模块更新失败：${message}`))
  }
})()
