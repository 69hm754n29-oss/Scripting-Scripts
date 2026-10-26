import {
  Button,
  Divider,
  DisclosureGroup,
  Form,
  HStack,
  Image,
  Menu,
  NavigationStack,
  Picker,
  ProgressView,
  Section,
  Spacer,
  Text,
  TextField,
  Toggle,
  VStack,
  useEffect,
  useMemo,
  useState,
} from "scripting"

import { loadConfig, persistCategory, type AppConfig } from "../utils/config"
import { downloadModule } from "../utils/downloader"
import {
  buildScriptHubConversionURL,
  detectScriptHubSourceFormat,
  deriveModuleNameFromSource,
  isScriptHubSourceTargetCompatible,
  normalizeModuleName,
  SCRIPT_HUB_SOURCE_FORMATS,
  SCRIPT_HUB_TARGET_FORMATS,
  scriptHubSourceFormatLabel,
  scriptHubTargetFormatLabel,
  suggestedScriptHubTargetFormat,
  type ScriptHubSourceFormat,
  type ScriptHubTargetFormat,
} from "../utils/script_hub_adapter"
import { fetchSourceText } from "../utils/source_fetcher"
import {
  ensureStorage,
  getModulesDirResolved,
  loadModules,
  type ModuleInfo,
} from "../utils/storage"
import { recordRecentImport } from "../utils/recent_imports"

type InputMode = "remote-url" | "local-text"

export type ScriptHubInitialInput = {
  sourceURL?: string
  localText?: string
  name?: string
  category?: string
  sourceFormat?: ScriptHubSourceFormat
  targetFormat?: ScriptHubTargetFormat
  sourceUserAgent?: string
  removeSourceMetadata?: boolean
  enableJQ?: boolean
}

type ScriptHubAdvancedValues = {
  description: string
  filename: string
  icon: string
  headers: string
  keepRewrite: string
  excludeRewrite: string
  keepRule: string
  excludeRule: string
  headerAdd: string
  headerDelete: string
  headerRegexDelete: string
  scriptTransform: string
  scriptTransformAll: boolean
  scriptTransform2: string
  scriptTransform2All: boolean
  cron: string
  cronExpression: string
  scriptName: string
  scriptTarget: string
  timeoutTarget: string
  timeoutValue: string
  engineTarget: string
  engineValue: string
  policy: string
  arg: string
  argv: string
  tiles: string
  tileColor: string
  cacheExpiry: string
  noCache: boolean
  noResolve: boolean
  syncMitm: boolean
  noNotification: boolean
  wrapResponse: boolean
  compatibilityOnly: boolean
  prepend: string
  evalScriptOriginal: string
  evalScriptModified: string
  evalURLOriginal: string
  evalURLModified: string
  evalJSOriginal: string
  evalJSModified: string
  evalURLJSOriginal: string
  evalURLJSModified: string
  keepHeader: boolean
  jsDelivr: boolean
  sni: string
  preMatching: string
}

const DEFAULT_ADVANCED: ScriptHubAdvancedValues = {
  description: "",
  filename: "",
  icon: "",
  headers: "",
  keepRewrite: "",
  excludeRewrite: "",
  keepRule: "",
  excludeRule: "",
  headerAdd: "",
  headerDelete: "",
  headerRegexDelete: "",
  scriptTransform: "",
  scriptTransformAll: false,
  scriptTransform2: "",
  scriptTransform2All: false,
  cron: "",
  cronExpression: "",
  scriptName: "",
  scriptTarget: "",
  timeoutTarget: "",
  timeoutValue: "",
  engineTarget: "",
  engineValue: "",
  policy: "",
  arg: "",
  argv: "",
  tiles: "",
  tileColor: "",
  cacheExpiry: "",
  noCache: false,
  noResolve: false,
  syncMitm: false,
  noNotification: false,
  wrapResponse: false,
  compatibilityOnly: false,
  prepend: "",
  evalScriptOriginal: "",
  evalScriptModified: "",
  evalURLOriginal: "",
  evalURLModified: "",
  evalJSOriginal: "",
  evalJSModified: "",
  evalURLJSOriginal: "",
  evalURLJSModified: "",
  keepHeader: false,
  jsDelivr: false,
  sni: "",
  preMatching: "",
}

const SCRIPT_NAME_KEY = "script-hub-scripting-script-name"

function loadStoredScriptName(): string {
  try {
    const storage: any = (globalThis as any).Storage
    return String(storage?.get?.(SCRIPT_NAME_KEY) ?? storage?.getString?.(SCRIPT_NAME_KEY) ?? "").trim()
  } catch {
    return ""
  }
}

function saveStoredScriptName(value: string): void {
  try {
    const storage: any = (globalThis as any).Storage
    const name = String(value ?? "").trim()
    if (typeof storage?.set === "function") storage.set(SCRIPT_NAME_KEY, name)
    else storage?.setString?.(SCRIPT_NAME_KEY, name)
  } catch {}
}

function hideKeyboard(): void {
  try {
    ;(globalThis as any).Keyboard?.hide?.()
  } catch {}
}

async function readClipboardText(): Promise<string> {
  const pasteboard: any = (globalThis as any).Pasteboard
  if (typeof pasteboard?.getString === "function") return String(await pasteboard.getString() ?? "")
  if (typeof pasteboard?.string === "function") return String(await pasteboard.string() ?? "")
  if (typeof pasteboard?.string === "string") return pasteboard.string
  return ""
}

function clipboardURL(value: string): string {
  const match = String(value ?? "").trim().match(/https?:\/\/[^\s<>"']+/i)
  if (!match) return ""
  const candidate = match[0].replace(/[),.;!?，。；！？]+$/g, "")
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
    return parsed.toString()
  } catch {
    return ""
  }
}

function looksLikeConvertibleText(value: string): boolean {
  const text = String(value ?? "").trim()
  if (!text || text.length < 8) return false
  return /(?:^|\n)\s*\[(?:general|rewrite_local|rewrite_remote|filter_remote|script|rewrite|rule|url rewrite|header rewrite|body rewrite|map local)\]\s*$/im.test(text)
    || /^\s*#!(?:name|desc|category|icon|author)\s*=/im.test(text)
    || /(?:^|\n)\s*(?:DOMAIN(?:-SUFFIX|-KEYWORD)?|IP-CIDR6?|GEOIP|URL-REGEX|HOST(?:-SUFFIX|-KEYWORD)?),/im.test(text)
    || /\b(?:const|let|var|function|class|import|export|module\.exports|\$request|\$response|\$done|\$task)\b/.test(text)
}

function sourceNameFromText(value: string): string {
  const metadata = value.match(/^\s*#!(?:name|title)\s*=\s*(.+)$/im)?.[1]
  const firstUsefulLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("//"))
  const candidate = String(metadata ?? firstUsefulLine ?? "本地转换模块")
    .replace(/[\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return candidate.slice(0, 128) || "本地转换模块"
}

function previewURL(value: string): string {
  try {
    const parts = value.split("/_end_/")
    if (parts.length !== 2) return value
    const suffix = parts[1].replace("?", ".txt?")
    return `${parts[0]}/_end_/${suffix}${suffix.includes("?") ? "&" : "?"}noNtf=true`
  } catch {
    return value
  }
}

async function openExternalURL(url: string): Promise<boolean> {
  const safari: any = (globalThis as any).Safari
  try {
    if (typeof safari?.openURL === "function") {
      await safari.openURL(url)
      return true
    }
    if (typeof safari?.open === "function") {
      await safari.open(url)
      return true
    }
  } catch {}
  return false
}

async function copyText(value: string, successMessage: string): Promise<void> {
  try {
    await Pasteboard.setString(value)
    await Dialog.alert({ message: successMessage })
  } catch (e: any) {
    await Dialog.alert({ title: "复制失败", message: String(e?.message ?? e) })
  }
}

function clientImportURL(target: ScriptHubTargetFormat, result: string, filename: string): string {
  const encodedResult = encodeURIComponent(result)
  const encodedName = encodeURIComponent(filename)
  if (target === "shadowrocket-module") return `https://api.boxjs.app/shadowrocket/install?module=${encodedResult}`
  if (target === "loon-plugin") return `https://www.nsloon.com/openloon/import?plugin=${encodedResult}`
  if (target === "stash-stoverride") return `stash://install-override?url=${encodedResult}`
  if (target === "surge-module") return `surge:///install-module?url=${encodedResult}&name=${encodedName}`
  if (target === "plain-text") return result
  return ""
}

function ActionButton(props: {
  title: string
  systemImage: string
  tint: "systemBlue" | "systemGreen" | "systemPurple" | "systemOrange"
  disabled?: boolean
  onPress: () => void | Promise<void>
}) {
  return (
    <Button
      title={props.title}
      systemImage={props.systemImage}
      buttonStyle="borderedProminent"
      controlSize="small"
      tint={props.tint}
      disabled={props.disabled}
      frame={{ maxWidth: "infinity" }}
      action={() => {
        hideKeyboard()
        HapticFeedback.mediumImpact()
        void props.onPress()
      }}
    />
  )
}

function compatibleTargets(sourceFormat: ScriptHubSourceFormat): typeof SCRIPT_HUB_TARGET_FORMATS {
  if (sourceFormat === "qx-script") {
    return SCRIPT_HUB_TARGET_FORMATS.filter((item) => item.value === "surge-module" || item.value === "surge-script")
  }
  if (sourceFormat === "rule-set") {
    return SCRIPT_HUB_TARGET_FORMATS.filter((item) => (
      item.value.endsWith("-rule-set") || item.value.includes("domain-set") || item.value === "plain-text"
    ))
  }
  if (sourceFormat === "plain-text") {
    return SCRIPT_HUB_TARGET_FORMATS.filter((item) => item.value === "plain-text")
  }
  return SCRIPT_HUB_TARGET_FORMATS.filter((item) => (
    !item.value.endsWith("-rule-set") && !item.value.includes("domain-set") && item.value !== "surge-script"
  ))
}

export function ScriptHubView(props: { onImported?: () => void; tag?: number; tabItem?: any; initialInput?: ScriptHubInitialInput }) {
  const [cfg, setCfg] = useState<AppConfig>(() => loadConfig())
  const [inputMode, setInputMode] = useState<InputMode>("remote-url")
  const [sourceURL, setSourceURL] = useState("")
  const [localText, setLocalText] = useState("")
  const [sourceFormat, setSourceFormat] = useState<ScriptHubSourceFormat>("qx-rewrite")
  const [sourceFormatAuto, setSourceFormatAuto] = useState(true)
  const [targetFormat, setTargetFormat] = useState<ScriptHubTargetFormat>("surge-module")
  const [moduleName, setModuleName] = useState("")
  const [categoryIdx, setCategoryIdx] = useState(0)
  const [customCategory, setCustomCategory] = useState("")
  const [sourceUserAgent, setSourceUserAgent] = useState("")
  const [keepOriginalLink, setKeepOriginalLink] = useState(true)
  const [removeSourceMetadata, setRemoveSourceMetadata] = useState(true)
  const [enableJQ, setEnableJQ] = useState(true)
  const [advanced, setAdvanced] = useState<ScriptHubAdvancedValues>(() => ({ ...DEFAULT_ADVANCED }))
  const [scriptingScriptName, setScriptingScriptName] = useState(loadStoredScriptName)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [detectedReason, setDetectedReason] = useState("")
  const [sourceSettingsExpanded, setSourceSettingsExpanded] = useState(true)
  const [formatExpanded, setFormatExpanded] = useState(true)
  const [outputExpanded, setOutputExpanded] = useState(true)
  const [typeGuideExpanded, setTypeGuideExpanded] = useState(false)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  const [advancedSections, setAdvancedSections] = useState({
    rewrite: false,
    script: false,
    schedule: false,
    runtime: false,
  })
  const [clientExpanded, setClientExpanded] = useState(false)

  const categories = cfg.categories ?? []
  const categoryOptions = useMemo(() => ["不设置分类", ...categories], [categories])
  const selectedCategory = customCategory.trim() || (
    categoryOptions[categoryIdx] === "不设置分类" ? "" : categoryOptions[categoryIdx] ?? ""
  )
  const targetOptions = useMemo(() => compatibleTargets(sourceFormat), [sourceFormat])
  const targetIndex = Math.max(0, targetOptions.findIndex((item) => item.value === targetFormat))
  const targetCanWriteToSurge = targetFormat === "surge-module"
  const hasSource = inputMode === "local-text" ? !!localText.trim() : !!sourceURL.trim()
  const sourceForConversion = inputMode === "local-text" ? "http://local.text" : sourceURL.trim()
  const localModuleName = inputMode === "local-text"
    ? sourceNameFromText(localText)
    : deriveModuleNameFromSource(sourceForConversion)
  const outputFilename = (advanced.filename.trim() || moduleName.trim() || localModuleName)
    .replace(/\.(?:plugin|lpx|conf|sgmodule|stoverride|module|list|txt|js)$/i, "")
    .replace(/[\\/]/g, "-")
    .trim() || "转换模块"

  useEffect(() => {
    saveStoredScriptName(scriptingScriptName)
  }, [scriptingScriptName])

  function updateAdvanced<K extends keyof ScriptHubAdvancedValues>(key: K, value: ScriptHubAdvancedValues[K]) {
    setAdvanced((previous) => ({ ...previous, [key]: value }))
  }

  function updateAdvancedSection(key: keyof typeof advancedSections, expanded: boolean) {
    setAdvancedSections((previous) => ({ ...previous, [key]: expanded }))
  }

  function advancedParams(): Record<string, string | number | boolean | undefined> {
    const params: Record<string, string | number | boolean | undefined> = {}
    const put = (key: string, value: unknown) => {
      if (typeof value === "boolean") {
        if (value) params[key] = true
        return
      }
      const text = String(value ?? "").trim()
      if (text) params[key] = text
    }
    const description = advanced.description.trim()
    const outputName = moduleName.trim()
    if (outputName || description) put("n", `${outputName}${description ? `+${description}` : ""}`)
    put("icon", advanced.icon)
    put("y", sourceFormat === "rule-set" ? advanced.keepRule : advanced.keepRewrite)
    put("x", sourceFormat === "rule-set" ? advanced.excludeRule : advanced.excludeRewrite)
    put("hnadd", advanced.headerAdd)
    put("hndel", advanced.headerDelete)
    put("hnregdel", advanced.headerRegexDelete)
    put("jsc", advanced.scriptTransformAll ? "." : advanced.scriptTransform)
    put("jsc2", advanced.scriptTransform2All ? "." : advanced.scriptTransform2)
    put("cron", advanced.cron)
    put("cronexp", advanced.cronExpression)
    put("njsname", advanced.scriptName)
    put("njsnametarget", advanced.scriptTarget)
    put("timeoutt", advanced.timeoutTarget)
    put("timeoutv", advanced.timeoutValue)
    put("enginet", advanced.engineTarget)
    put("enginev", advanced.engineValue)
    put("policy", advanced.policy)
    put("arg", advanced.arg)
    put("argv", advanced.argv)
    put("tiles", advanced.tiles)
    put("tcolor", advanced.tileColor)
    put("cachexp", advanced.cacheExpiry)
    put("nocache", advanced.noCache)
    put("nore", advanced.noResolve)
    put("synMitm", advanced.syncMitm)
    put("noNtf", advanced.noNotification)
    put("wrap_response", advanced.wrapResponse)
    put("compatibilityOnly", advanced.compatibilityOnly)
    put("evalScriptori", advanced.evalScriptOriginal)
    put("evalScriptmodi", advanced.evalScriptModified)
    put("evalUrlori", advanced.evalURLOriginal)
    put("evalUrlmodi", advanced.evalURLModified)
    put("evJsori", advanced.evalJSOriginal)
    put("evJsmodi", advanced.evalJSModified)
    put("evUrlori", advanced.evalURLJSOriginal)
    put("evUrlmodi", advanced.evalURLJSModified)
    put("prepend", advanced.prepend)
    put("keepHeader", advanced.keepHeader)
    put("jsDelivr", advanced.jsDelivr)
    put("sni", advanced.sni)
    put("pm", advanced.preMatching)
    return params
  }

  const conversionResult = useMemo(() => {
    if (!hasSource) return { url: "", error: "" }
    try {
      if (!isScriptHubSourceTargetCompatible(sourceFormat, targetFormat)) {
        throw new Error("QX 专属脚本仅支持转换为 Surge / Egern 模块或 Surge 脚本（兼容）")
      }
      const name = moduleName.trim() || localModuleName
      return {
        url: buildScriptHubConversionURL({
          sourceURL: sourceForConversion,
          localText: inputMode === "local-text" ? localText : undefined,
          sourceFormat,
          targetFormat,
          moduleName: name,
          filename: advanced.filename,
          category: selectedCategory,
          sourceUserAgent,
          headers: advanced.headers,
          removeSourceMetadata,
          enableJQ,
          extraParams: advancedParams(),
        }),
        error: "",
      }
    } catch (e: any) {
      return { url: "", error: String(e?.message ?? e) }
    }
  }, [
    hasSource,
    inputMode,
    sourceURL,
    localText,
    sourceForConversion,
    sourceFormat,
    targetFormat,
    moduleName,
    localModuleName,
    selectedCategory,
    sourceUserAgent,
    advanced,
    removeSourceMetadata,
    enableJQ,
  ])

  function setDetectedFormat(nextSource: ScriptHubSourceFormat, reason: string, suggested?: ScriptHubTargetFormat) {
    setSourceFormat(nextSource)
    setSourceFormatAuto(true)
    setDetectedReason(reason)
    const nextTarget = suggestedScriptHubTargetFormat(nextSource, suggested ?? targetFormat)
    const nextTargets = compatibleTargets(nextSource)
    if (!nextTargets.some((item) => item.value === nextTarget)) {
      setTargetFormat(nextTargets[0]?.value ?? "surge-module")
    } else {
      setTargetFormat(nextTarget)
    }
  }

  async function detectFormat() {
    hideKeyboard()
    if (!hasSource) {
      await Dialog.alert({ message: inputMode === "local-text" ? "请先填写本地文本内容" : "请先填写 HTTPS 来源链接" })
      return
    }
    setBusy(true)
    setStatus(inputMode === "local-text" ? "识别本地文本格式…" : "读取来源并识别格式…")
    try {
      if (inputMode === "local-text") {
        const detection = detectScriptHubSourceFormat("local.txt", localText)
        setDetectedFormat(detection.sourceFormat, detection.reason, detection.suggestedTargetFormat)
        if (!moduleName.trim()) setModuleName(sourceNameFromText(localText))
        setStatus(`已识别：${scriptHubSourceFormatLabel(detection.sourceFormat)}`)
        return
      }
      const raw = sourceURL.trim()
      const response = await fetchSourceText(raw, {
          userAgent: sourceUserAgent,
          maxChars: 512 * 1024,
          debugLabel: "Script-Hub 格式识别",
        })
      const detection = detectScriptHubSourceFormat(raw, response.text)
      setDetectedFormat(detection.sourceFormat, detection.reason, detection.suggestedTargetFormat)
      if (!moduleName.trim()) setModuleName(deriveModuleNameFromSource(raw))
      setStatus(`已识别：${scriptHubSourceFormatLabel(detection.sourceFormat)}`)
    } catch (e: any) {
      const fallback = detectScriptHubSourceFormat(
        inputMode === "local-text" ? "local.txt" : sourceURL,
        inputMode === "local-text" ? localText : undefined,
      )
      setDetectedFormat(fallback.sourceFormat, `${fallback.reason}（未读取内容）`, fallback.suggestedTargetFormat)
      if (!moduleName.trim()) setModuleName(inputMode === "local-text" ? sourceNameFromText(localText) : deriveModuleNameFromSource(sourceURL))
      setStatus(`已按${inputMode === "local-text" ? "文本" : "链接"}兜底：${scriptHubSourceFormatLabel(fallback.sourceFormat)}`)
      await Dialog.alert({
        title: inputMode === "local-text" ? "文本识别失败" : "在线识别失败",
        message: `${String(e?.message ?? e)}\n\n仍可按当前格式生成转换链接。`,
      })
    } finally {
      setBusy(false)
    }
  }

  async function detectInitialInput(
    mode: InputMode,
    value: string,
    userAgent: string,
    isActive: () => boolean = () => true,
  ): Promise<void> {
    const text = String(value ?? "").trim()
    if (!text || !isActive()) return
    if (mode === "local-text") {
      const detection = detectScriptHubSourceFormat("clipboard.txt", text)
      if (!isActive()) return
      setDetectedFormat(detection.sourceFormat, detection.reason, detection.suggestedTargetFormat)
      setStatus("已读取内容并识别：" + scriptHubSourceFormatLabel(detection.sourceFormat))
      return
    }

    setBusy(true)
    setStatus("已读取来源，正在识别格式…")
    try {
      const response = await fetchSourceText(text, {
        userAgent,
        maxChars: 512 * 1024,
        debugLabel: "Script-Hub 分享链接识别",
      })
      if (!isActive()) return
      const detection = detectScriptHubSourceFormat(text, response.text)
      setDetectedFormat(detection.sourceFormat, detection.reason, detection.suggestedTargetFormat)
      setStatus("已识别：" + scriptHubSourceFormatLabel(detection.sourceFormat))
    } catch (e: any) {
      if (!isActive()) return
      const fallback = detectScriptHubSourceFormat(text)
      setDetectedFormat(fallback.sourceFormat, fallback.reason + "（未读取内容）", fallback.suggestedTargetFormat)
      setStatus("在线读取失败，已按链接后缀兜底：" + scriptHubSourceFormatLabel(fallback.sourceFormat))
      console.log("[Surge模块管理][Script-Hub] initial source detection fallback: " + String(e?.message ?? e))
    } finally {
      if (isActive()) setBusy(false)
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      const provided = props.initialInput
      let mode: InputMode | null = null
      let value = ""
      if (provided?.sourceURL?.trim()) {
        mode = "remote-url"
        value = provided.sourceURL.trim()
      } else if (provided?.localText?.trim()) {
        mode = "local-text"
        value = provided.localText.trim()
      } else {
        try {
          const clipboard = (await readClipboardText()).trim()
          if (!active) return
          const url = clipboardURL(clipboard)
          if (url) {
            mode = "remote-url"
            value = url
            setStatus("已从剪贴板读取链接，正在识别格式…")
          } else if (looksLikeConvertibleText(clipboard)) {
            mode = "local-text"
            value = clipboard
            setStatus("已从剪贴板读取文本，正在识别格式…")
          }
        } catch (e: any) {
          console.log("[Surge模块管理][Script-Hub] clipboard read skipped: " + String(e?.message ?? e))
        }
      }
      if (!active || !mode || !value) return

      setInputMode(mode)
      setSourceFormatAuto(!provided?.sourceFormat)
      setDetectedReason("")
      setSourceSettingsExpanded(true)
      setFormatExpanded(true)
      hideKeyboard()
      if (mode === "remote-url") {
        setSourceURL(value)
        setLocalText("")
        if (!provided?.name && !moduleName.trim()) setModuleName(deriveModuleNameFromSource(value))
      } else {
        setLocalText(value)
        setSourceURL("")
        if (!provided?.name && !moduleName.trim()) setModuleName(sourceNameFromText(value))
      }
      if (provided?.name?.trim()) setModuleName(provided.name.trim())
      if (provided?.category?.trim()) setCustomCategory(provided.category.trim())
      if (provided?.sourceUserAgent !== undefined) setSourceUserAgent(provided.sourceUserAgent)
      if (provided?.removeSourceMetadata !== undefined) setRemoveSourceMetadata(provided.removeSourceMetadata)
      if (provided?.enableJQ !== undefined) setEnableJQ(provided.enableJQ)
      if (provided?.sourceFormat) setSourceFormat(provided.sourceFormat)
      if (provided?.targetFormat) setTargetFormat(provided.targetFormat)
      hideKeyboard()
      if (provided?.sourceFormat) {
        setDetectedReason("已使用分享参数指定来源格式")
        setStatus("已填入来源，格式由分享参数指定")
      } else {
        await detectInitialInput(mode, value, provided?.sourceUserAgent ?? sourceUserAgent, () => active)
      }
    })()
    return () => {
      active = false
    }
  }, [
    props.initialInput?.sourceURL,
    props.initialInput?.localText,
    props.initialInput?.name,
    props.initialInput?.category,
    props.initialInput?.sourceFormat,
    props.initialInput?.targetFormat,
    props.initialInput?.sourceUserAgent,
    props.initialInput?.removeSourceMetadata,
    props.initialInput?.enableJQ,
  ])

  async function copyConversionURL() {
    if (!conversionResult.url) {
      await Dialog.alert({ title: "转换链接不可用", message: conversionResult.error || "请先填写来源链接" })
      return
    }
    await copyText(conversionResult.url, "Script-Hub 转换链接已复制")
  }

  async function copySource() {
    const value = inputMode === "local-text" ? localText.trim() : sourceURL.trim()
    if (!value) {
      await Dialog.alert({ title: "原始内容不可用", message: "请先填写来源链接或本地文本内容" })
      return
    }
    await copyText(value, inputMode === "local-text" ? "本地文本已复制" : "原始来源链接已复制")
  }

  async function openResult() {
    if (!conversionResult.url) return copyConversionURL()
    if (!(await openExternalURL(conversionResult.url))) {
      await copyText(conversionResult.url, "无法直接打开，转换链接已复制")
    }
  }

  async function openPreview() {
    if (!conversionResult.url) return copyConversionURL()
    const url = previewURL(conversionResult.url)
    if (!(await openExternalURL(url))) {
      await copyText(url, "无法直接打开，预览链接已复制")
    }
  }

  async function openClientImport(client: "surge" | "scripting" | "scriptable" | "egern" | "target") {
    if (!conversionResult.url) return copyConversionURL()
    let url = ""
    if (client === "surge") url = clientImportURL("surge-module", conversionResult.url, outputFilename)
    if (client === "scriptable") {
      url = `scriptable:///run/SurgeModuleTool?url=${encodeURIComponent(conversionResult.url)}&name=${encodeURIComponent(outputFilename)}`
    }
    if (client === "egern") {
      url = `egern:///modules/new?url=${encodeURIComponent(conversionResult.url)}&name=${encodeURIComponent(outputFilename)}`
    }
    if (client === "scripting") {
      if (!scriptingScriptName.trim()) {
        await Dialog.alert({
          title: "需要填写脚本名",
          message: "请填写 Scripting 中显示的脚本名；首次使用还要在该脚本设置里选择 Surge 模块目录。",
        })
        return
      }
      url = `scripting://run_single/${encodeURIComponent(scriptingScriptName.trim())}?sh_action=import-surge-module&sh_module_url=${encodeURIComponent(conversionResult.url)}&sh_module_name=${encodeURIComponent(outputFilename)}&sh_module_category=${encodeURIComponent(selectedCategory || "Script Hub")}`
    }
    if (client === "target") url = clientImportURL(targetFormat, conversionResult.url, outputFilename)
    if (!url) return copyConversionURL()
    if (!(await openExternalURL(url))) {
      await copyText(url, "无法直接拉起客户端，导入链接已复制")
    }
  }

  async function writeToSurge() {
    if (busy) return
    if (!targetCanWriteToSurge) {
      await openClientImport("target")
      return
    }
    if (!conversionResult.url) {
      await Dialog.alert({ title: "无法写入", message: conversionResult.error || "请先填写并检查来源链接" })
      return
    }

    setBusy(true)
    setStatus("转换并写入 Surge 模块目录…")
    try {
      await ensureStorage()
      const baseDir = await getModulesDirResolved()
      if (!baseDir) throw new Error("Surge 模块目录不可用，请先在 Scripting 设置中选择书签目录")
      const current = await loadModules(baseDir)
      const name = normalizeModuleName(
        moduleName.trim() || (inputMode === "local-text" ? sourceNameFromText(localText) : ""),
        sourceForConversion,
      )
      if (current.some((item) => item.name === name)) throw new Error(`本地已存在同名模块：${name}`)
      if (current.some((item) => item.link === conversionResult.url)) throw new Error("本地已存在相同转换链接")

      const nextCfg = selectedCategory ? persistCategory(selectedCategory) : loadConfig()
      setCfg(nextCfg)
      const info: ModuleInfo = {
        name,
        link: conversionResult.url,
        sourceURL: keepOriginalLink && inputMode === "remote-url" ? sourceURL.trim() : undefined,
        category: selectedCategory || undefined,
        saveDir: baseDir,
        isLocal: false,
      }
      const result = await downloadModule(info, { mode: "direct" })
      if (!result.ok) throw new Error(result.message ?? "转换文件下载失败")
      recordRecentImport(info)
      props.onImported?.()
      setStatus(`已写入：${name}`)
      await Dialog.alert({ message: `转换模块已写入 Surge 模块目录\n${name}` })
    } catch (e: any) {
      const message = String(e?.message ?? e)
      setStatus(`写入失败：${message}`)
      await Dialog.alert({ title: "写入失败", message })
    } finally {
      setBusy(false)
    }
  }

  function resetForm() {
    hideKeyboard()
    setInputMode("remote-url")
    setSourceURL("")
    setLocalText("")
    setSourceFormat("qx-rewrite")
    setSourceFormatAuto(true)
    setTargetFormat("surge-module")
    setModuleName("")
    setCategoryIdx(0)
    setCustomCategory("")
    setSourceUserAgent("")
    setKeepOriginalLink(true)
    setRemoveSourceMetadata(true)
    setEnableJQ(true)
    setAdvanced({ ...DEFAULT_ADVANCED })
    setDetectedReason("")
    setSourceSettingsExpanded(true)
    setFormatExpanded(true)
    setOutputExpanded(true)
    setTypeGuideExpanded(false)
    setAdvancedExpanded(false)
    setAdvancedSections({ rewrite: false, script: false, schedule: false, runtime: false })
    setClientExpanded(false)
    setStatus("已重置")
  }

  return (
    <NavigationStack>
      <VStack
        navigationTitle="Script-Hub"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarTrailing: (
            <Button
              title="重置"
              action={() => {
                HapticFeedback.mediumImpact()
                resetForm()
              }}
            />
          ),
          keyboard: (
            <HStack padding={{ top: 6, bottom: 6, leading: 16, trailing: 16 }}>
              <Text font="caption" foregroundStyle="secondaryLabel">Script-Hub 转换</Text>
              <Spacer />
              <Button
                title="收起键盘"
                systemImage="keyboard.chevron.compact.down"
                buttonStyle="borderless"
                action={hideKeyboard}
              />
            </HStack>
          ),
        }}
      >
        <Form formStyle="grouped">
          <Section>
            <HStack spacing={12} padding={{ top: 6, bottom: 6 }}>
              <Image
                systemName="arrow.triangle.2.circlepath.circle.fill"
                font={30}
                foregroundStyle="systemPurple"
              />
              <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font="title3">Script-Hub 转换</Text>
                <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
                  跟随上游 Script-Hub 测试版转换核心，支持远程链接、本地文本和多端导入。
                </Text>
              </VStack>
            </HStack>
            <Text font="caption" foregroundStyle="systemOrange" lineLimit={3}>
              转换时会把你填写的来源内容、请求头和高级参数发送到 Script-Hub 测试版；不要填写敏感凭据。
            </Text>
          </Section>

          <DisclosureGroup
            title="来源"
            isExpanded={sourceSettingsExpanded}
            onChanged={(expanded: boolean) => {
              hideKeyboard()
              setSourceSettingsExpanded(expanded)
            }}
          >
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
              远程输入请填写可直接访问的 HTTPS 文件地址；本地输入适合粘贴转换后的原始文本。不要复制浏览器地址栏中未编码的转换链接。
            </Text>
            <Picker
              title="输入方式"
              pickerStyle="segmented"
              value={inputMode === "remote-url" ? 0 : 1}
              onChanged={(idx: number) => {
                hideKeyboard()
                const next: InputMode = idx === 1 ? "local-text" : "remote-url"
                setInputMode(next)
                setDetectedReason("")
                setSourceFormatAuto(true)
                if (!moduleName.trim()) {
                  setModuleName(next === "local-text" ? sourceNameFromText(localText) : deriveModuleNameFromSource(sourceURL))
                }
              }}
            >
              <Text tag={0}>来源链接</Text>
              <Text tag={1}>本地文本内容</Text>
            </Picker>
            {inputMode === "remote-url" ? (
              <TextField
                label={<Text>HTTPS 来源链接</Text>}
                value={sourceURL}
                onChanged={(value: string) => {
                  setSourceURL(value)
                  setDetectedReason("")
                  if (!moduleName.trim()) setModuleName(deriveModuleNameFromSource(value))
                  if (sourceFormatAuto) {
                    const detection = detectScriptHubSourceFormat(value)
                    setSourceFormat(detection.sourceFormat)
                    const nextTarget = suggestedScriptHubTargetFormat(detection.sourceFormat, targetFormat)
                    if (compatibleTargets(detection.sourceFormat).some((item) => item.value === nextTarget)) setTargetFormat(nextTarget)
                  }
                }}
                prompt="https://raw.githubusercontent.com/..."
                axis="vertical"
                lineLimit={{ min: 2, max: 4 }}
              />
            ) : (
              <TextField
                label={<Text>本地文本内容</Text>}
                value={localText}
                onChanged={(value: string) => {
                  setLocalText(value)
                  setDetectedReason("")
                  if (!moduleName.trim()) setModuleName(sourceNameFromText(value))
                  if (sourceFormatAuto) {
                    const detection = detectScriptHubSourceFormat("local.txt", value)
                    setSourceFormat(detection.sourceFormat)
                    const nextTarget = suggestedScriptHubTargetFormat(detection.sourceFormat, targetFormat)
                    if (compatibleTargets(detection.sourceFormat).some((item) => item.value === nextTarget)) setTargetFormat(nextTarget)
                  }
                }}
                prompt="粘贴重写、模块、插件或规则集文本"
                axis="vertical"
                lineLimit={{ min: 6, max: 14 }}
              />
            )}
            <ActionButton
              title={busy ? "处理中…" : "识别来源格式"}
              systemImage="wand.and.stars"
              tint="systemBlue"
              disabled={busy || !hasSource}
              onPress={detectFormat}
            />
            {detectedReason ? <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>{detectedReason}</Text> : null}
          </DisclosureGroup>

          <DisclosureGroup
            title="格式与目标"
            isExpanded={formatExpanded}
            onChanged={(expanded: boolean) => {
              hideKeyboard()
              setFormatExpanded(expanded)
            }}
          >
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
              来源格式决定解析方式，目标格式决定最终文件类型。自动识别失败时可以手动修正。
            </Text>
            <Picker
              title={sourceFormatAuto ? "来源格式（自动）" : "来源格式（手动）"}
              pickerStyle="menu"
              value={Math.max(0, SCRIPT_HUB_SOURCE_FORMATS.findIndex((item) => item.value === sourceFormat))}
              onChanged={(idx: number) => {
                const next = SCRIPT_HUB_SOURCE_FORMATS[idx]?.value ?? "qx-rewrite"
                setSourceFormat(next)
                setSourceFormatAuto(false)
                const options = compatibleTargets(next)
                if (!options.some((item) => item.value === targetFormat)) {
                  setTargetFormat(options[0]?.value ?? "surge-module")
                }
              }}
            >
              {SCRIPT_HUB_SOURCE_FORMATS.map((item, idx) => <Text key={item.value} tag={idx}>{item.label}</Text>)}
            </Picker>
            <HStack spacing={8}>
              <Image
                systemName={sourceFormatAuto ? "wand.and.stars" : "hand.point.up.left.fill"}
                font={14}
                foregroundStyle={sourceFormatAuto ? "systemBlue" : "systemOrange"}
              />
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
                {sourceFormatAuto ? "输入内容变化时会自动重新判断格式" : "已手动指定来源格式，不会被路径后缀覆盖"}
              </Text>
              <Spacer />
              <Button
                title="恢复自动"
                systemImage="arrow.counterclockwise"
                buttonStyle="borderless"
                tint="systemBlue"
                disabled={busy || !hasSource || sourceFormatAuto}
                action={() => { void detectFormat() }}
              />
            </HStack>
            <Text
              font="caption"
              foregroundStyle={sourceFormat === "qx-script" ? "systemBlue" : "secondaryLabel"}
              lineLimit={3}
            >
              {sourceFormat === "qx-script"
                ? "这是脚本源：默认按 Script-Hub 逻辑转换为 Surge / Egern 模块；需要独立执行时再选择 Surge 脚本。"
                : sourceFormat === "qx-rewrite"
                  ? "这是 Quantumult X 重写源，通常可直接转换为 Surge / Egern 模块。"
                  : "目标格式会决定转换结果的扩展名和客户端导入方式。"}
            </Text>
            <Picker
              title="目标格式"
              pickerStyle="menu"
              value={targetIndex}
              onChanged={(idx: number) => {
                const next = targetOptions[idx]?.value ?? "surge-module"
                setTargetFormat(next)
              }}
            >
              {targetOptions.map((item, idx) => <Text key={item.value} tag={idx}>{item.label}</Text>)}
            </Picker>
            <HStack>
              <Text>转换核心</Text>
              <Spacer />
              <Text foregroundStyle="secondaryLabel">Script-Hub 测试版</Text>
            </HStack>
            <DisclosureGroup
              title="如何选择类型"
              isExpanded={typeGuideExpanded}
              onChanged={(expanded: boolean) => setTypeGuideExpanded(expanded)}
            >
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={6}>
                来源类型按原始文件语法选择：QX 重写、Surge 模块、Loon 插件、规则集、QX 专属脚本或纯文本。目标类型按你要导入的客户端选择；普通插件或模块通常使用“Surge / Egern 模块”。
              </Text>
              <Text font="caption" foregroundStyle="systemOrange" lineLimit={4}>
                QX 专属脚本默认转换为 Surge / Egern 模块；只有需要保留独立执行语义时，才选择“Surge 脚本（兼容）”。
              </Text>
            </DisclosureGroup>
          </DisclosureGroup>

          <DisclosureGroup
            title="输出设置"
            isExpanded={outputExpanded}
            onChanged={(expanded: boolean) => {
              hideKeyboard()
              setOutputExpanded(expanded)
            }}
          >
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
              名称、文件名和分类用于生成结果及写入 Surge 时的本地模块信息。
            </Text>
            <TextField
              label={<Text>模块名称</Text>}
              value={moduleName}
              onChanged={setModuleName}
              prompt="默认从链接文件名或本地文本生成"
            />
            <TextField
              label={<Text>描述</Text>}
              value={advanced.description}
              onChanged={(value: string) => updateAdvanced("description", value)}
              prompt="可选，写入 Script-Hub n 参数"
            />
            <TextField
              label={<Text>输出文件名</Text>}
              value={advanced.filename}
              onChanged={(value: string) => updateAdvanced("filename", value)}
              prompt="可选，不含扩展名"
            />
            <Picker
              title="分类"
              pickerStyle="menu"
              value={Math.min(categoryIdx, Math.max(0, categoryOptions.length - 1))}
              onChanged={setCategoryIdx}
            >
              {categoryOptions.map((item, idx) => <Text key={`${item}-${idx}`} tag={idx}>{item}</Text>)}
            </Picker>
            <TextField
              label={<Text>自定义分类</Text>}
              value={customCategory}
              onChanged={setCustomCategory}
              prompt="可选，优先于上面的分类"
            />
            <TextField
              label={<Text>来源 User-Agent</Text>}
              value={sourceUserAgent}
              onChanged={setSourceUserAgent}
              prompt="可选，例如 Example/1.0"
            />
            <Toggle
              title="写入原始来源到模块"
              value={keepOriginalLink}
              onChanged={setKeepOriginalLink}
              disabled={inputMode !== "remote-url" || !sourceURL.trim()}
            />
            <Toggle title="移除源格式元数据" value={removeSourceMetadata} onChanged={setRemoveSourceMetadata} />
            <Toggle title="启用 jq 转换兼容" value={enableJQ} onChanged={setEnableJQ} />
          </DisclosureGroup>

          <Section header={<Text>快速操作</Text>}>
            <HStack spacing={10} padding={{ top: 4, bottom: 4 }}>
              <Image
                systemName={hasSource ? "checkmark.circle.fill" : "circle.dashed"}
                font={28}
                foregroundStyle={hasSource ? "systemGreen" : "secondaryLabel"}
              />
              <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font="headline">{hasSource ? "已准备好转换" : "等待来源内容"}</Text>
                <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
                  {hasSource
                    ? `${scriptHubSourceFormatLabel(sourceFormat)} → ${scriptHubTargetFormatLabel(targetFormat)} · ${outputFilename}`
                    : "先填写来源链接或粘贴本地文本，再选择目标格式"}
                </Text>
              </VStack>
            </HStack>
            <ActionButton
              title={busy ? "处理中…" : targetCanWriteToSurge ? "转换并写入 Surge" : "生成目标导入链接"}
              systemImage={targetCanWriteToSurge ? "arrow.down.doc.fill" : "arrow.up.forward.app"}
              tint="systemGreen"
              disabled={busy || !conversionResult.url}
              onPress={writeToSurge}
            />
            {!conversionResult.url && hasSource ? (
              <Text font="caption" foregroundStyle="systemOrange" lineLimit={3}>
                {conversionResult.error || "当前来源暂时无法生成转换链接，请检查格式和地址。"}
              </Text>
            ) : null}
          </Section>

          <DisclosureGroup
            title="高级转换参数"
            isExpanded={advancedExpanded}
            onChanged={(expanded: boolean) => {
              hideKeyboard()
              setAdvancedExpanded(expanded)
            }}
          >
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
              下面的参数与 Script-Hub 测试版保持一致；不确定时保持默认值即可。
            </Text>
            <TextField
              label={<Text>自定义请求头</Text>}
              value={advanced.headers}
              onChanged={(value: string) => updateAdvanced("headers", value)}
              prompt="每行一个 Header: value；会覆盖 User-Agent"
              axis="vertical"
              lineLimit={{ min: 2, max: 5 }}
            />
            <TextField label={<Text>图标链接</Text>} value={advanced.icon} onChanged={(value: string) => updateAdvanced("icon", value)} prompt="可选" />

            <DisclosureGroup
              title="重写与规则筛选"
              isExpanded={advancedSections.rewrite}
              onChanged={(expanded: boolean) => updateAdvancedSection("rewrite", expanded)}
            >
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
                用关键词筛选重写或规则，并按需修改请求头。
              </Text>
              <TextField label={<Text>保留重写关键词</Text>} value={advanced.keepRewrite} onChanged={(value: string) => updateAdvanced("keepRewrite", value)} prompt="多个关键词用 + 分隔" />
              <TextField label={<Text>排除重写关键词</Text>} value={advanced.excludeRewrite} onChanged={(value: string) => updateAdvanced("excludeRewrite", value)} prompt="多个关键词用 + 分隔" />
              <TextField label={<Text>保留规则关键词</Text>} value={advanced.keepRule} onChanged={(value: string) => updateAdvanced("keepRule", value)} prompt="规则集来源时生效" />
              <TextField label={<Text>排除规则关键词</Text>} value={advanced.excludeRule} onChanged={(value: string) => updateAdvanced("excludeRule", value)} prompt="规则集来源时生效" />
              <TextField label={<Text>新增请求头规则</Text>} value={advanced.headerAdd} onChanged={(value: string) => updateAdvanced("headerAdd", value)} axis="vertical" lineLimit={{ min: 2, max: 4 }} />
              <TextField label={<Text>删除请求头规则</Text>} value={advanced.headerDelete} onChanged={(value: string) => updateAdvanced("headerDelete", value)} axis="vertical" lineLimit={{ min: 2, max: 4 }} />
              <TextField label={<Text>正则删除请求头</Text>} value={advanced.headerRegexDelete} onChanged={(value: string) => updateAdvanced("headerRegexDelete", value)} axis="vertical" lineLimit={{ min: 2, max: 4 }} />
              <Toggle title="保留原始 Header" value={advanced.keepHeader} onChanged={(value: boolean) => updateAdvanced("keepHeader", value)} />
              <Toggle title="启用 jsDelivr 兼容" value={advanced.jsDelivr} onChanged={(value: boolean) => updateAdvanced("jsDelivr", value)} />
            </DisclosureGroup>

            <DisclosureGroup
              title="脚本转换与兼容"
              isExpanded={advancedSections.script}
              onChanged={(expanded: boolean) => updateAdvancedSection("script", expanded)}
            >
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
                仅在来源包含脚本时使用；目标不支持的能力不会被静默伪装。
              </Text>
              <TextField label={<Text>脚本转换 1 关键词</Text>} value={advanced.scriptTransform} onChanged={(value: string) => updateAdvanced("scriptTransform", value)} prompt="多个关键词用 + 分隔" />
              <Toggle title="脚本转换 1：全部转换" value={advanced.scriptTransformAll} onChanged={(value: boolean) => updateAdvanced("scriptTransformAll", value)} />
              <TextField label={<Text>脚本转换 2 关键词</Text>} value={advanced.scriptTransform2} onChanged={(value: string) => updateAdvanced("scriptTransform2", value)} prompt="多个关键词用 + 分隔" />
              <Toggle title="脚本转换 2：全部转换" value={advanced.scriptTransform2All} onChanged={(value: boolean) => updateAdvanced("scriptTransform2All", value)} />
              <Toggle title="仅进行兼容性转换" value={advanced.compatibilityOnly} onChanged={(value: boolean) => updateAdvanced("compatibilityOnly", value)} />
              <TextField label={<Text>脚本开头追加代码</Text>} value={advanced.prepend} onChanged={(value: string) => updateAdvanced("prepend", value)} axis="vertical" lineLimit={{ min: 3, max: 8 }} />
              <TextField label={<Text>处理原始内容（代码）</Text>} value={advanced.evalJSOriginal} onChanged={(value: string) => updateAdvanced("evalJSOriginal", value)} axis="vertical" lineLimit={{ min: 3, max: 8 }} />
              <TextField label={<Text>处理转换内容（代码）</Text>} value={advanced.evalJSModified} onChanged={(value: string) => updateAdvanced("evalJSModified", value)} axis="vertical" lineLimit={{ min: 3, max: 8 }} />
              <TextField label={<Text>处理原始内容（链接）</Text>} value={advanced.evalURLOriginal} onChanged={(value: string) => updateAdvanced("evalURLOriginal", value)} prompt="可选 URL" />
              <TextField label={<Text>处理转换内容（链接）</Text>} value={advanced.evalURLModified} onChanged={(value: string) => updateAdvanced("evalURLModified", value)} prompt="可选 URL" />
              <TextField label={<Text>脚本原始代码处理</Text>} value={advanced.evalScriptOriginal} onChanged={(value: string) => updateAdvanced("evalScriptOriginal", value)} axis="vertical" lineLimit={{ min: 3, max: 8 }} />
              <TextField label={<Text>脚本转换代码处理</Text>} value={advanced.evalScriptModified} onChanged={(value: string) => updateAdvanced("evalScriptModified", value)} axis="vertical" lineLimit={{ min: 3, max: 8 }} />
              <TextField label={<Text>脚本原始链接处理</Text>} value={advanced.evalURLJSOriginal} onChanged={(value: string) => updateAdvanced("evalURLJSOriginal", value)} prompt="可选 URL" />
              <TextField label={<Text>脚本转换链接处理</Text>} value={advanced.evalURLJSModified} onChanged={(value: string) => updateAdvanced("evalURLJSModified", value)} prompt="可选 URL" />
            </DisclosureGroup>

            <DisclosureGroup
              title="定时任务与脚本参数"
              isExpanded={advancedSections.schedule}
              onChanged={(expanded: boolean) => updateAdvancedSection("schedule", expanded)}
            >
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
                配置 cron、脚本名、超时、引擎和面板参数。
              </Text>
              <TextField label={<Text>任务类型</Text>} value={advanced.cron} onChanged={(value: string) => updateAdvanced("cron", value)} prompt="例如 cron" />
              <TextField label={<Text>定时表达式</Text>} value={advanced.cronExpression} onChanged={(value: string) => updateAdvanced("cronExpression", value)} prompt="Cron 表达式" />
              <TextField label={<Text>脚本名称关键词</Text>} value={advanced.scriptName} onChanged={(value: string) => updateAdvanced("scriptName", value)} />
              <TextField label={<Text>脚本名称转换目标</Text>} value={advanced.scriptTarget} onChanged={(value: string) => updateAdvanced("scriptTarget", value)} />
              <TextField label={<Text>超时匹配</Text>} value={advanced.timeoutTarget} onChanged={(value: string) => updateAdvanced("timeoutTarget", value)} />
              <TextField label={<Text>超时秒数</Text>} value={advanced.timeoutValue} onChanged={(value: string) => updateAdvanced("timeoutValue", value)} />
              <TextField label={<Text>脚本引擎匹配</Text>} value={advanced.engineTarget} onChanged={(value: string) => updateAdvanced("engineTarget", value)} />
              <TextField label={<Text>脚本引擎</Text>} value={advanced.engineValue} onChanged={(value: string) => updateAdvanced("engineValue", value)} />
              <TextField label={<Text>策略</Text>} value={advanced.policy} onChanged={(value: string) => updateAdvanced("policy", value)} />
              <TextField label={<Text>参数名</Text>} value={advanced.arg} onChanged={(value: string) => updateAdvanced("arg", value)} />
              <TextField label={<Text>参数值</Text>} value={advanced.argv} onChanged={(value: string) => updateAdvanced("argv", value)} />
              <TextField label={<Text>面板标题</Text>} value={advanced.tiles} onChanged={(value: string) => updateAdvanced("tiles", value)} />
              <TextField label={<Text>面板颜色</Text>} value={advanced.tileColor} onChanged={(value: string) => updateAdvanced("tileColor", value)} prompt="十六进制或颜色值" />
            </DisclosureGroup>

            <DisclosureGroup
              title="规则运行选项"
              isExpanded={advancedSections.runtime}
              onChanged={(expanded: boolean) => updateAdvancedSection("runtime", expanded)}
            >
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
                控制缓存、解析、MITM、通知和响应处理行为。
              </Text>
              <TextField label={<Text>缓存时间</Text>} value={advanced.cacheExpiry} onChanged={(value: string) => updateAdvanced("cacheExpiry", value)} prompt="cachexp" />
              <Toggle title="禁用缓存" value={advanced.noCache} onChanged={(value: boolean) => updateAdvanced("noCache", value)} />
              <Toggle title="禁用规则解析" value={advanced.noResolve} onChanged={(value: boolean) => updateAdvanced("noResolve", value)} />
              <Toggle title="同步 MITM" value={advanced.syncMitm} onChanged={(value: boolean) => updateAdvanced("syncMitm", value)} />
              <Toggle title="关闭转换通知" value={advanced.noNotification} onChanged={(value: boolean) => updateAdvanced("noNotification", value)} />
              <Toggle title="包装响应内容" value={advanced.wrapResponse} onChanged={(value: boolean) => updateAdvanced("wrapResponse", value)} />
              <TextField label={<Text>SNI</Text>} value={advanced.sni} onChanged={(value: string) => updateAdvanced("sni", value)} />
              <TextField label={<Text>预匹配</Text>} value={advanced.preMatching} onChanged={(value: string) => updateAdvanced("preMatching", value)} />
            </DisclosureGroup>
          </DisclosureGroup>

          <Section header={<Text>转换结果</Text>}>
            <HStack spacing={8}>
              <Image
                systemName={conversionResult.url ? "checkmark.circle.fill" : "info.circle"}
                font={16}
                foregroundStyle={conversionResult.url ? "systemGreen" : "secondaryLabel"}
              />
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
                {conversionResult.url ? "转换链接已根据当前选项实时生成" : "填写来源后会在这里生成转换链接"}
              </Text>
              <Spacer />
              <Text font="caption2" foregroundStyle={targetCanWriteToSurge ? "systemGreen" : "systemBlue"}>
                {targetCanWriteToSurge ? "可写入" : "可导入"}
              </Text>
            </HStack>
            <VStack
              alignment="leading"
              spacing={4}
              padding={{ top: 8, bottom: 8, leading: 10, trailing: 10 }}
            >
            {conversionResult.error ? (
              <Text foregroundStyle="systemRed" lineLimit={4}>{conversionResult.error}</Text>
            ) : (
              <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={5}>
                {conversionResult.url || "填写来源链接后生成转换链接"}
              </Text>
            )}
            </VStack>
            <Divider />
            <HStack spacing={8}>
              <ActionButton
                title="打开结果"
                systemImage="safari"
                tint="systemBlue"
                disabled={busy || !conversionResult.url}
                onPress={openResult}
              />
              <ActionButton
                title="预览结果"
                systemImage="doc.text.magnifyingglass"
                tint="systemPurple"
                disabled={busy || !conversionResult.url}
                onPress={openPreview}
              />
            </HStack>
            <HStack spacing={8}>
              <ActionButton
                title="复制转换"
                systemImage="doc.on.doc"
                tint="systemOrange"
                disabled={busy || !conversionResult.url}
                onPress={copyConversionURL}
              />
              <ActionButton
                title={targetCanWriteToSurge ? "再次写入" : "复制目标"}
                systemImage={targetCanWriteToSurge ? "arrow.down.doc.fill" : "doc.on.clipboard"}
                tint="systemGreen"
                disabled={busy || !conversionResult.url}
                onPress={writeToSurge}
              />
            </HStack>
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
              {scriptHubSourceFormatLabel(sourceFormat)} → {scriptHubTargetFormatLabel(targetFormat)}
            </Text>
            {busy ? <ProgressView progressViewStyle="circular" /> : null}
            {status ? <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>{status}</Text> : null}
            <Menu
              label={(
                <HStack spacing={6} frame={{ maxWidth: "infinity", minHeight: 38, alignment: "center" }}>
                  <Image systemName="arrow.up.forward.app" font={15} foregroundStyle="systemBlue" />
                  <Text foregroundStyle="systemBlue">更多导入与复制</Text>
                </HStack>
              )}
              disabled={busy || !conversionResult.url}
              buttonStyle="bordered"
              tint="systemBlue"
              frame={{ maxWidth: "infinity", minHeight: 40 }}
            >
              <Button title="导入 Surge（远程模块）" systemImage="arrow.down.circle" action={() => { void openClientImport("surge") }} />
              <Button title="导入 Egern" systemImage="arrow.down.circle" action={() => { void openClientImport("egern") }} />
              <Button title="导入 Scriptable" systemImage="square.and.arrow.down" action={() => { void openClientImport("scriptable") }} />
              <Button title="导入 Scripting（本地模块）" systemImage="square.and.arrow.down" disabled={!scriptingScriptName.trim()} action={() => { void openClientImport("scripting") }} />
              <Button title="复制原始来源" systemImage="doc.on.clipboard" action={() => { void copySource() }} />
              <Button title="复制转换链接" systemImage="doc.on.doc" action={() => { void copyConversionURL() }} />
            </Menu>
          </Section>

          {conversionResult.url && targetFormat === "surge-module" ? (
            <DisclosureGroup
              title="客户端导入设置"
              isExpanded={clientExpanded}
              onChanged={(expanded: boolean) => {
                hideKeyboard()
                setClientExpanded(expanded)
              }}
            >
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
                这里的按钮只负责拉起对应客户端；转换结果仍由 Script-Hub 测试版提供。Scripting 导入需要脚本名与脚本设置保持一致。
              </Text>
              <TextField label={<Text>Scripting 脚本名</Text>} value={scriptingScriptName} onChanged={setScriptingScriptName} prompt="填写 Scripting 中显示的脚本名" />
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
                首次使用 Scripting 导入前，请先在对应脚本设置里选择 Surge 模块书签目录。
              </Text>
            </DisclosureGroup>
          ) : null}

          {conversionResult.url && targetFormat !== "surge-module" ? (
            <Section header={<Text>目标客户端</Text>}>
              <ActionButton title={`打开 ${scriptHubTargetFormatLabel(targetFormat)} 导入链接`} systemImage="arrow.up.forward.app" tint="systemBlue" onPress={() => openClientImport("target")} />
            </Section>
          ) : null}
        </Form>
      </VStack>
    </NavigationStack>
  )
}
