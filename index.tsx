import { Intent, Navigation, Script } from "scripting"
import { runShortcutUpdate } from "./utils/shortcut_update"
import { isScriptHubImport, resolveScriptHubQueryParameters } from "./utils/deep_link_import"
import { getIntentFileURLs } from "./utils/intent_input"

function hasShortcutInput(): boolean {
  const fileURLs = getIntentFileURLs(Intent as any)
  return !!(
    Intent.shortcutParameter ||
    Intent.textsParameter?.length ||
    fileURLs.length
  )
}

function incomingQueryParameters(direct: Record<string, any> | null | undefined): Record<string, any> {
  return resolveScriptHubQueryParameters(direct, [
    ...(Intent.urlsParameter ?? []),
    ...(Intent.textsParameter ?? []),
    Intent.shortcutParameter,
  ])
}

async function runExternalInput(queryParameters: Record<string, any> | null | undefined): Promise<boolean> {
  const isImportRequest = isScriptHubImport(queryParameters)
  if (!isImportRequest && !hasShortcutInput()) return false

  // A run_single launch must have exactly one owner. In particular, do not
  // let an external re-trigger start a second downloader while the first one
  // is waiting for iCloud or the network.
  if (externalInputStarted) {
    console.log("[Surge模块管理][Intent] duplicate external input ignored")
    return true
  }
  externalInputStarted = true

  try {
    const fileURLs = getIntentFileURLs(Intent as any)
    console.log(
      `[Surge模块管理][Intent] started env=${Script.env} name=${Script.name} keys=${Object.keys(queryParameters ?? {}).join(",") || "none"} files=${fileURLs.length}`,
    )
    const result = await runShortcutUpdate({
      shortcutParameter: Intent.shortcutParameter,
      textsParameter: Intent.textsParameter,
      fileURLsParameter: fileURLs,
      queryParameters,
    })
    // Do not present an app dialog here. A URL-scheme launch has no presented
    // Navigation root, so Dialog.alert may never become visible while its
    // Promise keeps the script alive. Returning through Script.exit is the
    // documented non-interactive Intent lifecycle.
    // This is index.tsx, not intent.tsx. A plain string is valid for the
    // main-app URL-scheme path and does not depend on Intent serialization.
    Script.exit(result.text)
  } catch (e: any) {
    const message = String(e?.stack ?? e?.message ?? e)
    console.log(`[Surge模块管理][Intent] index fatal: ${message}`)
    Script.exit(`Surge 模块更新失败：${message}`)
  }
  return true
}

let externalInputStarted = false

async function run() {
  // `run_single` always terminates an old instance and starts index.tsx again.
  // Handle that cold-start input before installing a resume listener, keeping
  // the import path single-shot and free from UI lifecycle races.
  console.log(
    `[Surge模块管理][Intent] cold start env=${Script.env} query=${Object.keys(Script.queryParameters ?? {}).join(",") || "none"}`,
  )
  if (await runExternalInput(incomingQueryParameters(Script.queryParameters))) return

  // Plain `scripting://run/...` can resume an already visible app UI. Keep a
  // listener only for that long-lived UI path.
  const removeResumeHandler = Script.onResume((details) => {
    const queryParameters = incomingQueryParameters(details.queryParameters)
    if (isScriptHubImport(queryParameters)) {
      void runExternalInput(queryParameters)
    }
  })

  // Keep the headless URL/Shortcut path independent from the large UI tree.
  // Scripting supports dynamic imports; load the two-tab app only for normal UI use.
  const { AppView } = await import("./components/AppView")
  await Navigation.present({ element: <AppView /> })

  removeResumeHandler()
  // 视图关闭后退出脚本（Scripting 推荐模式）
  Script.exit()
}

void run().catch((e: any) => {
  const message = String(e?.stack ?? e?.message ?? e)
  console.log(`[Surge模块管理][Intent] unhandled: ${message}`)
  Script.exit(`Surge 模块启动失败：${message}`)
})
