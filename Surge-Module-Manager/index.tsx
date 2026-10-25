import { Dialog, Intent, Navigation, Script } from "scripting"
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

  try {
    console.log(`[Surge模块管理][Intent] started env=${Script.env} keys=${Object.keys(queryParameters ?? {}).join(",") || "none"}`)
    const result = await runShortcutUpdate({
      shortcutParameter: Intent.shortcutParameter,
      textsParameter: Intent.textsParameter,
      queryParameters,
    })
    // A URL launched from Safari does not expose Script.exit(Intent.text(...))
    // to the user. Show the result in the app so the user can distinguish a
    // routed-and-written import from the app merely being opened.
    if (isImportRequest && Script.env === "index") {
      await Dialog.alert({ title: "Script-Hub 导入", message: result.text })
    }
    Script.exit(Intent.text(result.text))
  } catch (e: any) {
    const message = String(e?.stack ?? e?.message ?? e)
    console.log(`[Surge模块管理][Intent] index fatal: ${message}`)
    if (isImportRequest && Script.env === "index") {
      await Dialog.alert({ title: "Script-Hub 导入失败", message })
    }
    Script.exit(Intent.text(`Surge 模块更新失败：${message}`))
  }
  return true
}

async function run() {
  // `scripting://run/...` resumes an already visible script instead of
  // re-running index.tsx. Register this before presenting the home UI so a
  // Script-Hub import is handled in both cold-start and warm-start paths.
  const removeResumeHandler = Script.onResume((details) => {
    const queryParameters = incomingQueryParameters(details.queryParameters)
    if (isScriptHubImport(queryParameters)) {
      void runExternalInput(queryParameters)
    }
  })

  if (await runExternalInput(incomingQueryParameters(Script.queryParameters))) return

  await Navigation.present({
    element: <HomeView />,
  })

  removeResumeHandler()
  // 视图关闭后退出脚本（Scripting 推荐模式）
  Script.exit()
}

run()
