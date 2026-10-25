import { Intent, Script } from "scripting"

import { runShortcutUpdate } from "./utils/shortcut_update"
import { resolveScriptHubQueryParameters } from "./utils/deep_link_import"

;(async () => {
  try {
    const queryParameters = resolveScriptHubQueryParameters(Script.queryParameters, [
      ...(Intent.urlsParameter ?? []),
      ...(Intent.textsParameter ?? []),
      Intent.shortcutParameter,
    ])
    const result = await runShortcutUpdate({
      shortcutParameter: Intent.shortcutParameter,
      textsParameter: Intent.textsParameter,
      queryParameters,
    })
    Script.exit(Intent.text(result.text))
  } catch (e: any) {
    const message = String(e?.stack ?? e?.message ?? e)
    console.log(`[Surge模块管理][Intent] fatal: ${message}`)
    Script.exit(Intent.text(`Surge 模块更新失败：${message}`))
  }
})()
