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
  inferScriptHubSourceFormat,
  normalizeModuleName,
  normalizeSourceURL,
  SCRIPT_HUB_SOURCE_FORMATS,
  SCRIPT_HUB_TARGET_FORMATS,
  scriptHubSourceFormatLabel,
  scriptHubTargetFormatLabel,
  type ScriptHubSourceFormat,
  type ScriptHubTargetFormat,
} from "../utils/script_hub_adapter"
import {
  catalogItemModuleName,
  listGitHubRepositoryDirectory,
  parentRepositoryPath,
  type GitHubCatalogItem,
} from "../utils/github_repository_catalog"
import {
  createSourceConfig,
  loadSourceConfigs,
  removeSourceConfig,
  saveSourceConfig,
  type SourceConfig,
  type SourceImportRequest,
  type SourceMode,
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
  const mode = source.mode === "marketplace" ? "市场目录" : "单个直链"
  const category = source.defaultCategory ? `分类：${source.defaultCategory}` : "未设置默认分类"
  return `${mode} · ${scriptHubTargetFormatLabel(source.target)} · ${category} · ${source.enabled ? "已启用" : "已停用"}`
}

function sourceFormatForItem(item: GitHubCatalogItem): ScriptHubSourceFormat {
  return inferScriptHubSourceFormat(item.sourceURL ?? item.name)
}

export function SourceManagementView(props: {
  categories: string[]
  saveDirs: string[]
  onImport: (request: SourceImportRequest) => Promise<{ ok: boolean; message?: string }>
}) {
  const [sources, setSources] = useState<SourceConfig[]>(() => loadSourceConfigs())
  const [selectedId, setSelectedId] = useState("")
  const [mode, setMode] = useState<SourceMode>("direct")
  const [name, setName] = useState("")
  const [sourceURL, setSourceURL] = useState("")
  const [repositoryURL, setRepositoryURL] = useState("")
  const [repositoryBranch, setRepositoryBranch] = useState("main")
  const [repositoryPath, setRepositoryPath] = useState("")
  const [catalogItems, setCatalogItems] = useState<GitHubCatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState("")
  const [moduleName, setModuleName] = useState("")
  const [sourceUserAgent, setSourceUserAgent] = useState("")
  const [sourceFormat, setSourceFormat] = useState<ScriptHubSourceFormat>("loon-plugin")
  const [targetFormat, setTargetFormat] = useState<ScriptHubTargetFormat>("surge-module")
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
  const targetCanWriteToSurge = targetFormat === "surge-module"

  const conversionResult = useMemo(() => {
    const raw = sourceURL.trim()
    if (!raw) {
      return {
        url: "",
        error: mode === "marketplace" ? "请先加载市场目录并选择一个插件或模块" : "",
      }
    }
    try {
      const normalized = normalizeSourceURL(raw)
      return {
        url: buildScriptHubConversionURL({
          sourceURL: normalized,
          sourceFormat,
          targetFormat,
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
  }, [mode, sourceURL, sourceFormat, targetFormat, moduleName, selectedCategory, sourceUserAgent, removeSourceMetadata, enableJQ])

  async function loadMarketplace(path = repositoryPath) {
    const rawRepositoryURL = repositoryURL.trim()
    if (!rawRepositoryURL) {
      await Dialog.alert({ message: "请先填写 GitHub 市场仓库地址" })
      return
    }
    setCatalogLoading(true)
    setCatalogError("")
    try {
      const result = await listGitHubRepositoryDirectory(rawRepositoryURL, repositoryBranch.trim(), path)
      setRepositoryBranch(result.ref.branch)
      setRepositoryPath(result.ref.path)
      setCatalogItems(result.items)
      if (!name.trim()) setName(result.ref.repository)
    } catch (e: any) {
      const message = String(e?.message ?? e)
      setCatalogItems([])
      setCatalogError(message)
      await Dialog.alert({ title: "加载市场失败", message })
    } finally {
      setCatalogLoading(false)
    }
  }

  function selectCatalogItem(item: GitHubCatalogItem) {
    if (item.kind === "directory") {
      void loadMarketplace(item.path)
      return
    }
    if (!item.sourceURL) return
    setSourceURL(item.sourceURL)
    setModuleName(catalogItemModuleName(item))
    setSourceFormat(sourceFormatForItem(item))
  }

  useEffect(() => {
    if (!selectedId) return
    const source = sources.find((item) => item.id === selectedId)
    if (!source) return
    const isMarketplace = source.mode === "marketplace"
    setMode(source.mode)
    setName(source.name)
    setRepositoryURL(source.repositoryURL ?? (isMarketplace ? source.sourceURL : ""))
    setRepositoryBranch(source.repositoryBranch ?? "main")
    setRepositoryPath(source.repositoryPath ?? "")
    const selectedURL = isMarketplace && source.repositoryURL === source.sourceURL ? "" : source.sourceURL
    setSourceURL(selectedURL)
    setModuleName(selectedURL ? (source.moduleName || deriveModuleNameFromSource(selectedURL)) : "")
    setSourceUserAgent(source.sourceUserAgent ?? "")
    setSourceFormat(source.sourceKind)
    setTargetFormat(source.target)
    const category = source.defaultCategory ?? ""
    const idx = categoryOptions.findIndex((item) => item === category)
    setCategoryIdx(idx >= 0 ? idx : 0)
    setCustomCategory(idx >= 0 ? "" : category)
    const dirIdx = source.saveDir ? props.saveDirs.findIndex((dir) => dir === source.saveDir) : -1
    setSaveDirIdx(dirIdx >= 0 ? dirIdx + 1 : 0)
    setAutoImport(source.autoImport && source.target === "surge-module")
    setKeepOriginalLink(source.keepOriginalLink)
    setRemoveSourceMetadata(source.removeSourceMetadata)
    setEnableJQ(source.enableJQ)
    setCatalogItems([])
    setCatalogError("")
  }, [selectedId, sources, categoryOptions, props.saveDirs])

  function resetForm() {
    setSelectedId("")
    setMode("direct")
    setName("")
    setSourceURL("")
    setRepositoryURL("")
    setRepositoryBranch("main")
    setRepositoryPath("")
    setCatalogItems([])
    setCatalogError("")
    setModuleName("")
    setSourceUserAgent("")
    setSourceFormat("loon-plugin")
    setTargetFormat("surge-module")
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
    const trimmedRepositoryURL = repositoryURL.trim()
    const trimmedURL = sourceURL.trim()
    if (!trimmedName) {
      void Dialog.alert({ message: "请填写来源名称" })
      return null
    }
    if (mode === "marketplace" && !trimmedRepositoryURL) {
      void Dialog.alert({ message: "请填写 GitHub 市场仓库地址" })
      return null
    }
    if (mode === "direct" && !trimmedURL) {
      void Dialog.alert({ message: "请填写插件或模块 HTTPS 直链" })
      return null
    }

    const normalizedRepositoryURL = mode === "marketplace"
      ? normalizeSourceURL(trimmedRepositoryURL)
      : undefined
    const normalizedURL = normalizeSourceURL(trimmedURL || normalizedRepositoryURL)
    const normalizedName = normalizeModuleName(moduleName.trim(), normalizedURL)
    const current = selectedId ? sources.find((item) => item.id === selectedId) : undefined
    const next = current
      ? {
          ...current,
          name: trimmedName,
          mode,
          sourceURL: normalizedURL,
          repositoryURL: normalizedRepositoryURL,
          repositoryBranch: mode === "marketplace" ? repositoryBranch.trim() || "main" : undefined,
          repositoryPath: mode === "marketplace" ? repositoryPath.trim() || undefined : undefined,
          moduleName: normalizedName,
          sourceUserAgent: sourceUserAgent.trim() || undefined,
          sourceKind: sourceFormat,
          target: targetFormat,
          defaultCategory: selectedCategory || undefined,
          saveDir: selectedSaveDir,
          autoImport: targetCanWriteToSurge && autoImport,
          keepOriginalLink,
          removeSourceMetadata,
          enableJQ,
          updatedAt: Date.now(),
        }
      : createSourceConfig({
          name: trimmedName,
          mode,
          sourceURL: normalizedURL,
          repositoryURL: normalizedRepositoryURL,
          repositoryBranch: mode === "marketplace" ? repositoryBranch.trim() || "main" : undefined,
          repositoryPath: mode === "marketplace" ? repositoryPath.trim() || undefined : undefined,
          moduleName: normalizedName,
          sourceUserAgent: sourceUserAgent.trim() || undefined,
          sourceKind: sourceFormat,
          target: targetFormat,
          defaultCategory: selectedCategory,
          saveDir: selectedSaveDir,
          autoImport: targetCanWriteToSurge && autoImport,
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
      await Dialog.alert({ message: "请先填写并检查来源地址" })
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
    if (!sourceURL.trim() || !conversionResult.url) {
      await Dialog.alert({ message: conversionResult.error || "请先从市场目录选择一个插件或模块" })
      return
    }

    if (!targetCanWriteToSurge || !source.autoImport) {
      await copyValue(conversionResult.url, "转换链接")
      await Dialog.alert({
        message: targetCanWriteToSurge
          ? "已保存来源并复制转换链接；当前设置不会自动写入模块目录。"
          : "已复制目标格式转换链接。当前脚本只负责写入 Surge 模块，其他客户端请使用对应应用导入。",
      })
      return
    }

    setBusy(true)
    try {
      const result = await props.onImport({
        source,
        moduleName: normalizeModuleName(source.moduleName, sourceURL),
        sourceURL,
        convertedURL: conversionResult.url,
        sourceFormat,
        targetFormat,
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
            <Text foregroundStyle="secondaryLabel" lineLimit={5}>
              这里适配的是你主动提供的插件/模块市场目录，不内置站点、不分发站点内容，也不会递归扫描。单个插件或模块请直接在“添加模块”中填写直链；市场来源只在你点击“加载当前目录”或打开目录时请求。
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
            <Picker
              title="来源类型"
              pickerStyle="menu"
              value={mode === "marketplace" ? 1 : 0}
              onChanged={(idx: number) => {
                const nextMode: SourceMode = idx === 1 ? "marketplace" : "direct"
                setMode(nextMode)
                setCatalogItems([])
                setCatalogError("")
                if (nextMode === "direct") setRepositoryPath("")
              }}
            >
              <Text tag={0}>单个插件 / 模块直链</Text>
              <Text tag={1}>插件 / 模块市场目录</Text>
            </Picker>
            <TextField
              label={<Text>来源名称</Text>}
              value={name}
              onChanged={(value: string) => setName(value)}
              prompt="例如：我的第三方市场"
            />
            {mode === "marketplace" ? (
              <>
                <TextField
                  label={<Text>GitHub 市场仓库</Text>}
                  value={repositoryURL}
                  onChanged={(value: string) => {
                    setRepositoryURL(value)
                    setCatalogItems([])
                    setRepositoryPath("")
                  }}
                  prompt="https://github.com/owner/repository"
                />
                <TextField
                  label={<Text>分支</Text>}
                  value={repositoryBranch}
                  onChanged={(value: string) => setRepositoryBranch(value)}
                  prompt="main"
                />
                <HStack spacing={8}>
                  <SourceActionButton
                    title={catalogLoading ? "加载中…" : "加载当前目录"}
                    systemImage="arrow.down.circle"
                    tint="systemBlue"
                    disabled={catalogLoading || !repositoryURL.trim()}
                    onPress={() => loadMarketplace(repositoryPath)}
                  />
                  <SourceActionButton
                    title="上一级"
                    systemImage="arrow.up"
                    tint="systemPurple"
                    disabled={catalogLoading || !repositoryPath}
                    onPress={() => loadMarketplace(parentRepositoryPath(repositoryPath))}
                  />
                </HStack>
                <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
                  当前目录：/{repositoryPath || "根目录"}。仅打开当前目录时请求，列表最多显示 1000 项。
                </Text>
                {catalogLoading ? <Text foregroundStyle="secondaryLabel">正在加载当前目录…</Text> : null}
                {catalogError ? <Text foregroundStyle="systemRed">{catalogError}</Text> : null}
                {catalogItems.map((item) => (
                  <Button key={item.id} action={() => selectCatalogItem(item)} buttonStyle="plain">
                    <HStack spacing={10} padding={{ top: 7, bottom: 7 }}>
                      <Image
                        systemName={item.kind === "directory" ? "folder" : "doc.text"}
                        font={18}
                        foregroundStyle={item.kind === "directory" ? "systemBlue" : "systemGreen"}
                      />
                      <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                        <Text lineLimit={1}>{item.name}</Text>
                        <Text font="caption" foregroundStyle="secondaryLabel">
                          {item.kind === "directory" ? "打开目录" : "选择并转换"}
                        </Text>
                      </VStack>
                      <Image systemName="chevron.right" font={12} foregroundStyle="secondaryLabel" />
                    </HStack>
                  </Button>
                ))}
                <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
                  选择文件后才会生成转换链接；这里不内置任何市场地址，也不会自动抓取其它目录。
                </Text>
              </>
            ) : (
              <TextField
                label={<Text>插件 / 模块 HTTPS 直链</Text>}
                value={sourceURL}
                onChanged={(value: string) => {
                  setSourceURL(value)
                  if (!moduleName.trim()) setModuleName(deriveModuleNameFromSource(value))
                }}
                prompt="https://.../example.plugin"
              />
            )}
            {mode === "marketplace" ? (
              <TextField
                label={<Text>已选条目直链</Text>}
                value={sourceURL}
                onChanged={(value: string) => setSourceURL(value)}
                prompt="先从上面的目录选择文件"
              />
            ) : null}
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
            <Picker
              title="来源格式"
              pickerStyle="menu"
              value={Math.max(0, SCRIPT_HUB_SOURCE_FORMATS.findIndex((item) => item.value === sourceFormat))}
              onChanged={(idx: number) => setSourceFormat(SCRIPT_HUB_SOURCE_FORMATS[idx]?.value ?? "loon-plugin")}
            >
              {SCRIPT_HUB_SOURCE_FORMATS.map((item, idx) => <Text key={item.value} tag={idx}>{item.label}</Text>)}
            </Picker>
            <Picker
              title="目标格式"
              pickerStyle="menu"
              value={Math.max(0, SCRIPT_HUB_TARGET_FORMATS.findIndex((item) => item.value === targetFormat))}
              onChanged={(idx: number) => {
                const next = SCRIPT_HUB_TARGET_FORMATS[idx]?.value ?? "surge-module"
                setTargetFormat(next)
                if (next !== "surge-module") setAutoImport(false)
              }}
            >
              {SCRIPT_HUB_TARGET_FORMATS.map((item, idx) => <Text key={item.value} tag={idx}>{item.label}</Text>)}
            </Picker>
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
            <Toggle
              title={targetCanWriteToSurge ? "转换后自动添加到 Surge" : "自动添加（仅 Surge 模块可用）"}
              value={autoImport}
              onChanged={setAutoImport}
              disabled={!targetCanWriteToSurge}
            />
            <Toggle
              title="写入原始来源到模块"
              value={keepOriginalLink}
              onChanged={setKeepOriginalLink}
              disabled={!targetCanWriteToSurge}
            />
            <Toggle title="移除源格式元数据" value={removeSourceMetadata} onChanged={setRemoveSourceMetadata} />
            <Toggle title="启用 jq 转换兼容" value={enableJQ} onChanged={setEnableJQ} />
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={4}>
              {targetCanWriteToSurge
                ? "Surge 模块目标可以写入已授权的 Surge 目录；其它目标只生成并复制转换链接。"
                : "当前目标是其它客户端格式。脚本会生成 Script-Hub 转换链接，但不会把非 Surge 文件伪装成 .sgmodule 写入本地目录。"}
            </Text>
          </Section>

          <Section header={<Text>链接操作</Text>}>
            {conversionResult.error ? (
              <Text foregroundStyle={mode === "marketplace" && !sourceURL ? "secondaryLabel" : "systemRed"}>
                {conversionResult.error}
              </Text>
            ) : (
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={4}>
                {conversionResult.url || "填写地址或从市场目录选择条目后，这里会生成 Script-Hub 转换链接。"}
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
              title={targetCanWriteToSurge && autoImport ? "一键转换并添加" : "生成并复制转换链接"}
              systemImage={targetCanWriteToSurge && autoImport ? "plus.circle.fill" : "doc.on.clipboard"}
              tint="systemGreen"
              disabled={busy || !conversionResult.url}
              onPress={importCurrent}
            />
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>
              当前：{scriptHubSourceFormatLabel(sourceFormat)} → {scriptHubTargetFormatLabel(targetFormat)}
            </Text>
          </Section>
        </Form>
      </VStack>
    </NavigationStack>
  )
}
