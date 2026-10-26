import {
  Button,
  Divider,
  DisclosureGroup,
  Form,
  HStack,
  Image,
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
    return SCRIPT_HUB_TARGET_FORMATS.filter((item) => item.value === "surge-script")
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

export function ScriptHubView(props: { onImported?: () => void; tag?: number; tabItem?: any }) {
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
  const [advancedExpanded, setAdvancedExpanded] = useState(false)

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
        throw new Error("QX 专属脚本只能转换为 Surge 脚本（兼容）")
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

  async function copyConversionURL() {
    if (!conversionResult.url) {
      await Dialog.alert({ title: "转换链接不可用", message: conversionResult.error || "请先填写来源链接" })
      return
    }
    await copyText(conversionResult.url, "Script-Hub 转换链接已复制")
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

          <Section header={<Text>格式</Text>}>
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
          </Section>

          <Section header={<Text>输出设置</Text>}>
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
          </Section>

          <DisclosureGroup
            title="高级转换参数"
            isExpanded={advancedExpanded}
            onChanged={(expanded: boolean) => {
              hideKeyboard()
              setAdvancedExpanded(expanded)
            }}
          >
            <TextField
              label={<Text>自定义请求头</Text>}
              value={advanced.headers}
              onChanged={(value: string) => updateAdvanced("headers", value)}
              prompt="每行一个 Header: value；会覆盖 User-Agent"
              axis="vertical"
              lineLimit={{ min: 2, max: 5 }}
            />
            <TextField label={<Text>图标链接</Text>} value={advanced.icon} onChanged={(value: string) => updateAdvanced("icon", value)} prompt="可选" />

            <DisclosureGroup title="重写与规则筛选" isExpanded={false} onChanged={() => {}}>
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

            <DisclosureGroup title="脚本转换与兼容" isExpanded={false} onChanged={() => {}}>
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

            <DisclosureGroup title="定时任务与脚本参数" isExpanded={false} onChanged={() => {}}>
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

            <DisclosureGroup title="规则运行选项" isExpanded={false} onChanged={() => {}}>
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
            {conversionResult.error ? (
              <Text foregroundStyle="systemRed" lineLimit={4}>{conversionResult.error}</Text>
            ) : (
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={5}>
                {conversionResult.url || "填写来源链接后生成转换链接"}
              </Text>
            )}
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
                title="复制转换链接"
                systemImage="doc.on.doc"
                tint="systemOrange"
                disabled={busy || !conversionResult.url}
                onPress={copyConversionURL}
              />
              <ActionButton
                title={targetCanWriteToSurge ? "转换并写入" : "复制目标链接"}
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
          </Section>

          {conversionResult.url && targetFormat === "surge-module" ? (
            <DisclosureGroup title="客户端导入" isExpanded={false} onChanged={(expanded: boolean) => { if (!expanded) hideKeyboard() }}>
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
                这些按钮只负责拉起对应客户端；转换结果仍由 Script-Hub 测试版提供。
              </Text>
              <HStack spacing={8}>
                <ActionButton title="导入 Surge" systemImage="arrow.down.circle" tint="systemBlue" onPress={() => openClientImport("surge")} />
                <ActionButton title="导入 Egern" systemImage="arrow.down.circle" tint="systemGreen" onPress={() => openClientImport("egern")} />
              </HStack>
              <HStack spacing={8}>
                <ActionButton title="导入 Scriptable" systemImage="square.and.arrow.down" tint="systemOrange" onPress={() => openClientImport("scriptable")} />
                <ActionButton title="导入 Scripting" systemImage="square.and.arrow.down" tint="systemPurple" disabled={!scriptingScriptName.trim()} onPress={() => openClientImport("scripting")} />
              </HStack>
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
