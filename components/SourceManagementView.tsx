import {
  Button,
  Form,
  HStack,
  Image,
  NavigationStack,
  Picker,
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

import {
  buildScriptHubConversionURL,
  deriveModuleNameFromSource,
  normalizeModuleName,
  normalizeSourceURL,
} from "../utils/script_hub_adapter"
import {
  createSourceConfig,
  loadSourceConfigs,
  removeSourceConfig,
  saveSourceConfig,
  type SourceConfig,
  type SourceImportRequest,
} from "../utils/source_adapters"

function SourceActionButton(props: {
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
      tint={props.tint}
      disabled={props.disabled}
      action={() => {
        HapticFeedback.mediumImpact()
        void props.onPress()
      }}
    />
  )
}

function sourceSubtitle(source: SourceConfig): string {
  const category = source.defaultCategory ? `分类：${source.defaultCategory}` : "未设置默认分类"
  return `${category} · ${source.enabled ? "已启用" : "已停用"}`
}

export function SourceManagementView(props: {
  categories: string[]
  saveDirs: string[]
  onImport: (request: SourceImportRequest) => Promise<{ ok: boolean; message?: string }>
}) {
  const [sources, setSources] = useState<SourceConfig[]>(() => loadSourceConfigs())
  const [selectedId, setSelectedId] = useState("")
  const [name, setName] = useState("")
  const [sourceURL, setSourceURL] = useState("")
  const [moduleName, setModuleName] = useState("")
  const [sourceUserAgent, setSourceUserAgent] = useState("")
  const [categoryIdx, setCategoryIdx] = useState(0)
  const [customCategory, setCustomCategory] = useState("")
  const [saveDirIdx, setSaveDirIdx] = useState(0)
  const [autoImport, setAutoImport] = useState(true)
  const [keepOriginalLink, setKeepOriginalLink] = useState(true)
  const [removeSourceMetadata, setRemoveSourceMetadata] = useState(true)
  const [enableJQ, setEnableJQ] = useState(true)
  const [busy, setBusy] = useState(false)

  const categoryOptions = useMemo(() => ["不设置分类", ...props.categories], [props.categories])
  const saveDirOptions = useMemo(() => ["根目录", ...props.saveDirs], [props.saveDirs])
  const selectedCategory = customCategory.trim() || (
    categoryOptions[categoryIdx] === "不设置分类" ? "" : categoryOptions[categoryIdx]
  )
  const selectedSaveDir = saveDirIdx > 0 ? props.saveDirs[saveDirIdx - 1] : undefined

  const conversionResult = useMemo(() => {
    const raw = sourceURL.trim()
    if (!raw) return { url: "", error: "" }
    try {
      const normalized = normalizeSourceURL(raw)
      return {
        url: buildScriptHubConversionURL({
          sourceURL: normalized,
          moduleName: moduleName.trim() || deriveModuleNameFromSource(normalized),
          category: selectedCategory,
          sourceUserAgent,
          removeSourceMetadata,
          enableJQ,
        }),
        error: "",
      }
    } catch (e: any) {
      return { url: "", error: String(e?.message ?? e) }
    }
  }, [sourceURL, moduleName, selectedCategory, sourceUserAgent, removeSourceMetadata, enableJQ])

  useEffect(() => {
    if (!selectedId) return
    const source = sources.find((item) => item.id === selectedId)
    if (!source) return
    setName(source.name)
    setSourceURL(source.sourceURL)
    setModuleName(source.moduleName || deriveModuleNameFromSource(source.sourceURL))
    setSourceUserAgent(source.sourceUserAgent ?? "")
    const category = source.defaultCategory ?? ""
    const idx = categoryOptions.findIndex((item) => item === category)
    setCategoryIdx(idx >= 0 ? idx : 0)
    setCustomCategory(idx >= 0 ? "" : category)
    const dirIdx = source.saveDir ? props.saveDirs.findIndex((dir) => dir === source.saveDir) : -1
    setSaveDirIdx(dirIdx >= 0 ? dirIdx + 1 : 0)
    setAutoImport(source.autoImport)
    setKeepOriginalLink(source.keepOriginalLink)
    setRemoveSourceMetadata(source.removeSourceMetadata)
    setEnableJQ(source.enableJQ)
  }, [selectedId, sources, categoryOptions, props.saveDirs])

  function resetForm() {
    setSelectedId("")
    setName("")
    setSourceURL("")
    setModuleName("")
    setSourceUserAgent("")
    setCategoryIdx(0)
    setCustomCategory("")
    setSaveDirIdx(0)
    setAutoImport(true)
    setKeepOriginalLink(true)
    setRemoveSourceMetadata(true)
    setEnableJQ(true)
  }

  function saveCurrentSource(): SourceConfig | null {
    const trimmedName = name.trim()
    const trimmedURL = sourceURL.trim()
    if (!trimmedName || !trimmedURL) {
      void Dialog.alert({ message: "请填写来源名称和 HTTPS 直链" })
      return null
    }
    if (!conversionResult.url) {
      void Dialog.alert({ message: conversionResult.error || "来源直链无效" })
      return null
    }

    const normalizedURL = normalizeSourceURL(trimmedURL)
    const normalizedName = normalizeModuleName(moduleName.trim(), normalizedURL)
    const current = selectedId ? sources.find((item) => item.id === selectedId) : undefined
    const next = current
      ? {
          ...current,
          name: trimmedName,
          sourceURL: normalizedURL,
          moduleName: normalizedName,
          sourceUserAgent: sourceUserAgent.trim() || undefined,
          defaultCategory: selectedCategory || undefined,
          saveDir: selectedSaveDir,
          autoImport,
          keepOriginalLink,
          removeSourceMetadata,
          enableJQ,
          updatedAt: Date.now(),
        }
      : createSourceConfig({
          name: trimmedName,
          sourceURL: normalizedURL,
          moduleName: normalizedName,
          sourceUserAgent: sourceUserAgent.trim() || undefined,
          defaultCategory: selectedCategory,
          saveDir: selectedSaveDir,
          autoImport,
          keepOriginalLink,
          removeSourceMetadata,
          enableJQ,
        })
    const saved = saveSourceConfig(next)
    setSources(loadSourceConfigs())
    setSelectedId(saved.id)
    return saved
  }

  async function saveSource() {
    try {
      if (saveCurrentSource()) await Dialog.alert({ message: "来源设置已保存" })
    } catch (e: any) {
      await Dialog.alert({ title: "保存来源失败", message: String(e?.message ?? e) })
    }
  }

  async function copyValue(value: string, title: string) {
    if (!value) {
      await Dialog.alert({ message: "请先填写并检查来源直链" })
      return
    }
    try {
      await Pasteboard.setString(value)
      await Dialog.alert({ message: `${title}已复制` })
    } catch (e: any) {
      await Dialog.alert({ title: "复制失败", message: String(e?.message ?? e) })
    }
  }

  async function importCurrent() {
    if (busy) return
    const source = saveCurrentSource()
    if (!source) return
    if (!source.enabled) {
      await Dialog.alert({ message: "该来源已停用，请先打开来源开关" })
      return
    }
    if (!conversionResult.url) {
      await Dialog.alert({ message: conversionResult.error || "无法生成转换链接" })
      return
    }

    if (!source.autoImport) {
      await copyValue(conversionResult.url, "转换链接")
      await Dialog.alert({ message: "已保存来源并复制转换链接；当前设置不会自动写入模块目录。" })
      return
    }

    setBusy(true)
    try {
      const result = await props.onImport({
        source,
        moduleName: normalizeModuleName(source.moduleName, source.sourceURL),
        sourceURL: source.sourceURL,
        convertedURL: conversionResult.url,
        category: selectedCategory || undefined,
        saveDir: selectedSaveDir,
        keepOriginalLink: source.keepOriginalLink,
      })
      if (!result.ok) {
        await Dialog.alert({ title: "导入失败", message: result.message ?? "转换模块未写入" })
        return
      }
      await Dialog.alert({ message: "转换模块已写入 Surge 模块目录" })
    } catch (e: any) {
      await Dialog.alert({ title: "导入失败", message: String(e?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  async function deleteSource(source: SourceConfig) {
    const confirmed = await Dialog.confirm({
      title: "删除来源",
      message: `确定删除“${source.name}”的保存设置？不会删除已导入模块。`,
    })
    if (!confirmed) return
    removeSourceConfig(source.id)
    const next = loadSourceConfigs()
    setSources(next)
    if (selectedId === source.id) resetForm()
  }

  return (
    <NavigationStack>
      <VStack
        navigationTitle="自定义来源"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarLeading: (
            <Button
              title="新增"
              action={() => {
                HapticFeedback.mediumImpact()
                resetForm()
              }}
            />
          ),
          topBarTrailing: (
            <Button
              title="保存"
              action={() => {
                HapticFeedback.mediumImpact()
                void saveSource()
              }}
            />
          ),
        }}
      >
        <Form formStyle="grouped">
          <Section>
            <Text foregroundStyle="secondaryLabel" lineLimit={4}>
              只处理你主动填写的第三方直链，不会自动抓取或预置来源。需要来源本身提供可访问的 HTTPS Loon 插件文件。
            </Text>
          </Section>

          {sources.length ? (
            <Section header={<Text>已保存来源</Text>}>
              {sources.map((source) => (
                <HStack key={source.id} spacing={10} padding={{ top: 6, bottom: 6 }}>
                  <Image
                    systemName="square.stack.3d.up"
                    font={20}
                    foregroundStyle={source.enabled ? "systemBlue" : "secondaryLabel"}
                  />
                  <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <Text font="headline" lineLimit={1}>{source.name}</Text>
                    <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{sourceSubtitle(source)}</Text>
                  </VStack>
                  <Toggle
                    title=""
                    value={source.enabled}
                    toggleStyle="switch"
                    onChanged={(value: boolean) => {
                      try {
                        const saved = saveSourceConfig({ ...source, enabled: value })
                        setSources(loadSourceConfigs())
                        if (selectedId === source.id) setSelectedId(saved.id)
                      } catch {}
                    }}
                  />
                  <Button
                    title="使用"
                    buttonStyle="bordered"
                    action={() => {
                      HapticFeedback.mediumImpact()
                      setSelectedId(source.id)
                    }}
                  />
                  <Button
                    title="删除"
                    role="destructive"
                    action={() => void deleteSource(source)}
                  />
                </HStack>
              ))}
            </Section>
          ) : null}

          <Section header={<Text>来源设置</Text>}>
            <TextField
              label={<Text>来源名称</Text>}
              value={name}
              onChanged={(value: string) => setName(value)}
              prompt="例如：我的第三方来源"
            />
            <TextField
              label={<Text>HTTPS 直链</Text>}
              value={sourceURL}
              onChanged={(value: string) => {
                setSourceURL(value)
                if (!moduleName.trim()) setModuleName(deriveModuleNameFromSource(value))
              }}
              prompt="https://.../example.plugin"
            />
            <TextField
              label={<Text>模块名称</Text>}
              value={moduleName}
              onChanged={(value: string) => setModuleName(value)}
              prompt="默认从直链文件名生成"
            />
            <TextField
              label={<Text>来源 User-Agent（可选）</Text>}
              value={sourceUserAgent}
              onChanged={(value: string) => setSourceUserAgent(value)}
              prompt="例如：Example/1.0"
            />
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
              仅当来源按客户端识别请求时填写；只会作为 User-Agent 传递，不支持任意请求头。
            </Text>
          </Section>

          <Section header={<Text>转换设置</Text>}>
            <HStack>
              <Text>来源格式</Text>
              <Spacer />
              <Text foregroundStyle="secondaryLabel">Loon 插件</Text>
            </HStack>
            <HStack>
              <Text>目标格式</Text>
              <Spacer />
              <Text foregroundStyle="secondaryLabel">Surge 模块</Text>
            </HStack>
            <HStack>
              <Text>转换器</Text>
              <Spacer />
              <Text foregroundStyle="secondaryLabel">Script-Hub 测试版</Text>
            </HStack>
            <Picker
              title="默认分类"
              pickerStyle="menu"
              value={categoryIdx}
              onChanged={(idx: number) => setCategoryIdx(idx)}
            >
              {categoryOptions.map((item, idx) => <Text key={`${item}-${idx}`} tag={idx}>{item}</Text>)}
            </Picker>
            <TextField
              label={<Text>自定义分类</Text>}
              value={customCategory}
              onChanged={(value: string) => setCustomCategory(value)}
              prompt="可选，优先于默认分类"
            />
            <Picker
              title="保存路径"
              pickerStyle="menu"
              value={saveDirIdx}
              onChanged={(idx: number) => setSaveDirIdx(idx)}
            >
              {saveDirOptions.map((item, idx) => <Text key={`${item}-${idx}`} tag={idx}>{idx === 0 ? "根目录" : item.split("/").pop() ?? item}</Text>)}
            </Picker>
            <Toggle title="转换后自动添加" value={autoImport} onChanged={setAutoImport} />
            <Toggle
              title="写入原始来源到模块"
              value={keepOriginalLink}
              onChanged={setKeepOriginalLink}
            />
            <Toggle title="移除源格式元数据" value={removeSourceMetadata} onChanged={setRemoveSourceMetadata} />
            <Toggle title="启用 jq 转换兼容" value={enableJQ} onChanged={setEnableJQ} />
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
              模块实际更新使用转换链接；开启后，原始直链会写入模块的来源元数据，来源设置始终保存原始直链。
            </Text>
          </Section>

          <Section header={<Text>链接操作</Text>}>
            {conversionResult.error ? (
              <Text foregroundStyle="systemRed">{conversionResult.error}</Text>
            ) : (
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={4}>
                {conversionResult.url || "填写 HTTPS 直链后，这里会生成 Script-Hub 转换链接。"}
              </Text>
            )}
            <HStack spacing={8}>
              <SourceActionButton
                title="复制原始链接"
                systemImage="doc.on.doc"
                tint="systemBlue"
                disabled={!sourceURL.trim()}
                onPress={() => copyValue(sourceURL.trim(), "原始链接")}
              />
              <SourceActionButton
                title="复制转换链接"
                systemImage="arrow.triangle.2.circlepath"
                tint="systemPurple"
                disabled={!conversionResult.url}
                onPress={() => copyValue(conversionResult.url, "转换链接")}
              />
            </HStack>
            <SourceActionButton
              title={autoImport ? "一键转换并添加" : "生成并复制转换链接"}
              systemImage={autoImport ? "plus.circle.fill" : "doc.on.clipboard"}
              tint="systemGreen"
              disabled={busy || !conversionResult.url}
              onPress={importCurrent}
            />
          </Section>
        </Form>
      </VStack>
    </NavigationStack>
  )
}
