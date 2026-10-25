import { Intent, Navigation, Script } from "scripting"
import { HomeView } from "./components/HomeView"
import { runShortcutUpdate } from "./utils/shortcut_update"
import { isScriptHubImport, resolveScriptHubQueryParameters } from "./utils/deep_link_import"

function hasShortcutInput(): boolean {
  return !!(
    Intent.shortcutParameter ||
    Intent.textsParameter?.length ||
    Intent.urlsParameter?.length ||
    Intent.fileURLsParameter?.length
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
    console.log(`[Surge模块管理][Intent] started env=${Script.env} keys=${Object.keys(queryParameters ?? {}).join(",") || "none"}`)
    const result = await runShortcutUpdate({
      shortcutParameter: Intent.shortcutParameter,
      textsParameter: Intent.textsParameter,
      queryParameters,
    })
    // Do not present an app dialog here. A URL-scheme launch has no presented
    // Navigation root, so Dialog.alert may never become visible while its
    // Promise keeps the script alive. Returning through Script.exit is the
    // documented non-interactive Intent lifecycle.
    Script.exit(Intent.text(result.text))
  } catch (e: any) {
    const message = String(e?.stack ?? e?.message ?? e)
    console.log(`[Surge模块管理][Intent] index fatal: ${message}`)
    Script.exit(Intent.text(`Surge 模块更新失败：${message}`))
  }
  return true
}

let externalInputStarted = false

async function run() {
  // `run_single` always terminates an old instance and starts index.tsx again.
  // Handle that cold-start input before installing a resume listener, keeping
  // the import path single-shot and free from UI lifecycle races.
  if (await runExternalInput(incomingQueryParameters(Script.queryParameters))) return

  // Plain `scripting://run/...` can resume an already visible HomeView. Keep a
  // listener only for that long-lived UI path.
  const removeResumeHandler = Script.onResume((details) => {
    const queryParameters = incomingQueryParameters(details.queryParameters)
    if (isScriptHubImport(queryParameters)) {
      void runExternalInput(queryParameters)
    }
  })

  await Navigation.present({
    element: <HomeView />,
  })

  removeResumeHandler()
  // 视图关闭后退出脚本（Scripting 推荐模式）
  Script.exit()
}

run()
