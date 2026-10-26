import {
  Button,
  Editor,
  Form,
  Image,
  Navigation,
  NavigationStack,
  Section,
  Toggle,
  Text,
  TextField,
  VStack,
  HStack,
  Spacer,
  Picker,
  useEffect,
  useMemo,
  useState,
} from "scripting"

import { loadModules, type ModuleInfo } from "../utils/storage"
import {
  clearRecentImports,
  loadRecentImports,
  type RecentImport,
} from "../utils/recent_imports"

function QuickImportRow(props: {
  title: string
  subtitle: string
  systemImage: string
  tint: "systemBlue" | "systemGreen" | "systemPurple"
  onPress: () => void | Promise<void>
}) {
  return (
    <Button
      buttonStyle="plain"
      action={() => {
        HapticFeedback.mediumImpact()
        void props.onPress()
      }}
    >
      <HStack
        spacing={12}
        padding={{ top: 12, bottom: 12, leading: 4, trailing: 4 }}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        <Image
          systemName={props.systemImage}
          font={22}
          foregroundStyle={props.tint}
          frame={{ width: 42, height: 42 }}
          background={{
            style: "secondarySystemBackground",
            shape: { type: "rect", cornerRadius: 12 },
          }}
        />
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <Text font="headline">{props.title}</Text>
          <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>
            {props.subtitle}
          </Text>
        </VStack>
        <Image systemName="chevron.right" font={14} foregroundStyle="tertiaryLabel" />
      </HStack>
    </Button>
  )
}

function relativeImportTime(timestamp: number): string {
  if (!timestamp) return "时间未知"
  const delta = Math.max(0, Date.now() - timestamp)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < minute) return "刚刚"
  if (delta < hour) return `${Math.max(1, Math.floor(delta / minute))} 分钟前`
  if (delta < day) return `${Math.max(1, Math.floor(delta / hour))} 小时前`
  return `${Math.max(1, Math.floor(delta / day))} 天前`
}

function LocalContentEditorView(props: {
  initialContent: string
}) {
  const dismiss = Navigation.useDismiss()
  const [controller] = useState(() => new EditorController({
    content: props.initialContent,
    ext: "txt",
    readOnly: false,
  }))

  useEffect(() => {
    return () => {
      controller.dispose()
    }
  }, [controller])

  return (
    <NavigationStack>
      <VStack
        navigationTitle="编辑模块内容"
        navigationBarTitleDisplayMode="inline"
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        toolbar={{
          topBarTrailing: (
            <Button
              title="保存"
              action={() => {
                HapticFeedback.mediumImpact()
                dismiss(String(controller.content ?? ""))
              }}
            />
          ),
        }}
      >
        <Editor
          controller={controller}
          scriptName="Surge Module"
          showAccessoryView
          searchEnabled
          ignoresSafeArea={{ regions: "container", edges: "bottom" }}
        />
      </VStack>
    </NavigationStack>
  )
}

export function EditModuleView(props: {
  title: string
  categories: string[]
  initial?: ModuleInfo
  saveDirs?: string[]
}) {
  const dismiss = Navigation.useDismiss()

  const initial = props.initial
  const [name, setName] = useState<string>(initial?.name ?? "")
  const [link, setLink] = useState<string>(initial?.link ?? "")
  const [isRemote, setIsRemote] = useState<boolean>(initial ? !!initial.link : true)
  const [content, setContent] = useState<string>("")
  const [existingLinks, setExistingLinks] = useState<Set<string>>(new Set())
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  const [recentImports, setRecentImports] = useState<RecentImport[]>([])

  const categoryOptions = useMemo<string[]>(() => ["不设置分类", ...props.categories], [props.categories])
  const initialIdx = Math.max(
    0,
    categoryOptions.findIndex((c) => c === (initial?.category ?? ""))
  )
  const [categoryIdx, setCategoryIdx] = useState<number>(initialIdx >= 0 ? initialIdx : 0)
  const [customCategory, setCustomCategory] = useState<string>(() => {
    const value = String(initial?.category ?? "").trim()
    return value && !props.categories.includes(value) ? value : ""
  })
  const saveDirOptions = useMemo<string[]>(() => {
    const dirs = props.saveDirs ?? []
    if (!dirs.length) return []
    return ["根目录", ...dirs]
  }, [props.saveDirs])
  const [saveDirIdx, setSaveDirIdx] = useState<number>(0)

  useEffect(() => {
    if (initial) return
    void loadExistingLinks()
    setRecentImports(loadRecentImports())
  }, [initial])

  useEffect(() => {
    const currentDir = initial?.saveDir ?? ""
    if (!saveDirOptions.length || !currentDir) {
      setSaveDirIdx(0)
      return
    }
    const idx = saveDirOptions.findIndex((dir) => dir === currentDir)
    setSaveDirIdx(idx >= 0 ? idx : 0)
  }, [initial?.saveDir, saveDirOptions])

  useEffect(() => {
    if (!initial || initial.link || !initial.filePath) return
    const fm: any = (globalThis as any).FileManager
    if (!fm?.readAsString) return
    void (async () => {
      try {
        const text = await fm.readAsString(initial.filePath)
        setContent(String(text ?? ""))
      } catch {}
    })()
  }, [initial])

  async function loadExistingLinks() {
    try {
      const list = await loadModules()
      setExistingLinks(new Set(list.map((m) => m.link).filter(Boolean)))
      setExistingNames(new Set(list.map((m) => m.name).filter(Boolean)))
    } catch {
      setExistingLinks(new Set())
      setExistingNames(new Set())
    }
  }

  async function onSave() {
    const trimmedName = name.trim()
    const trimmedLink = link.trim()
    const localContent = String(content ?? "")
    const trimmedContent = localContent.trim()
    const selectedCategory = categoryOptions[categoryIdx] === "不设置分类"
      ? ""
      : categoryOptions[categoryIdx]
    const cat = customCategory.trim() || selectedCategory || undefined
    const saveDir =
      saveDirOptions.length && saveDirIdx > 0 ? saveDirOptions[saveDirIdx] : undefined

    if (!trimmedName || !trimmedLink) {
      if (!trimmedName) {
        await Dialog.alert({ message: "名称不能为空" })
        return
      }
      if (isRemote) {
        await Dialog.alert({ message: "链接不能为空" })
        return
      }
      if (!trimmedContent) {
        await Dialog.alert({ message: "模块内容不能为空" })
        return
      }
    } else if (!isRemote && !trimmedContent) {
      await Dialog.alert({ message: "模块内容不能为空" })
      return
    }

    if (!initial) {
      let names = existingNames
      let links = existingLinks
      if (!names.size && !links.size) {
        try {
          const list = await loadModules()
          names = new Set(list.map((m) => m.name).filter(Boolean))
          links = new Set(list.map((m) => m.link).filter(Boolean))
          setExistingNames(names)
          setExistingLinks(links)
        } catch {}
      }

      if (names.has(trimmedName)) {
        await Dialog.alert({
          title: "模块已存在",
          message: `已存在同名模块：${trimmedName}`,
        })
        return
      }
      if (isRemote && links.has(trimmedLink)) {
        await Dialog.alert({
          title: "模块已存在",
          message: "已存在相同下载链接的模块",
        })
        return
      }
    }

    const result: ModuleInfo = {
      name: trimmedName,
      link: isRemote ? trimmedLink : "",
      isLocal: !isRemote,
      content: isRemote ? undefined : localContent,
      category: cat,
      saveDir,
    }
    dismiss(result)
  }

  async function openLocalContentEditor() {
    const next = await Navigation.present<string | null>({
      element: <LocalContentEditorView initialContent={content} />,
      modalPresentationStyle: "pageSheet",
    })
    if (next == null) return
    setContent(next)
  }

  function deriveNameFromURL(rawURL: string): string {
    try {
      const parsed = new URL(rawURL)
      const last = parsed.pathname.split("/").filter(Boolean).pop() ?? ""
      const value = decodeURIComponent(last).replace(/\.(?:sgmodule|plugin|conf)$/i, "").trim()
      return value || "远程模块"
    } catch {
      return "远程模块"
    }
  }

  function deriveNameFromContent(rawContent: string): string {
    const tagged = String(rawContent ?? "").match(/^\s*(?:#!|#)name\s*=\s*(.+?)\s*$/im)?.[1]
    return String(tagged ?? "").trim() || "本地模块"
  }

  function setRemoteSource(rawURL: string) {
    const value = String(rawURL ?? "").trim()
    if (!value) return
    setIsRemote(true)
    setLink(value)
    setContent("")
    if (!name.trim()) setName(deriveNameFromURL(value))
  }

  async function openRemoteLinkInput() {
    const input = await Dialog.prompt({
      title: "远程链接",
      message: "粘贴 HTTPS 模块链接或 Script-Hub 转换结果",
      defaultValue: link,
      placeholder: "https://",
    })
    if (input == null) return
    setRemoteSource(input)
  }

  async function openLocalFilePicker() {
    try {
      const picker: any = (globalThis as any).DocumentPicker
      if (typeof picker?.pickFiles !== "function") {
        await Dialog.alert({ message: "DocumentPicker.pickFiles 不可用，请使用文件分享导入" })
        return
      }
      const files = await picker.pickFiles({
        types: ["public.data", "public.text", "public.plain-text"],
        allowsMultipleSelection: false,
        shouldShowFileExtensions: true,
      })
      const filePath = Array.isArray(files) ? files[0] : undefined
      if (!filePath) return
      const fm: any = (globalThis as any).FileManager
      if (typeof fm?.readAsString !== "function") throw new Error("FileManager.readAsString 不可用")
      const path = String(filePath)
      const text = String(await fm.readAsString(path) ?? "")
      if (!text.trim()) throw new Error("所选文件没有可导入的内容")
      setIsRemote(false)
      setLink("")
      setContent(text)
      if (!name.trim()) {
        const filename = path.split("/").pop() ?? ""
        setName(filename.replace(/\.(?:sgmodule|plugin|conf|txt)$/i, "") || deriveNameFromContent(text))
      }
    } catch (e: any) {
      await Dialog.alert({ title: "读取文件失败", message: String(e?.message ?? e) })
    }
  }

  async function openClipboardImport() {
    try {
      const pasteboard: any = (globalThis as any).Pasteboard
      let raw = ""
      if (typeof pasteboard?.getString === "function") raw = String(await pasteboard.getString() ?? "")
      else if (typeof pasteboard?.string === "function") raw = String(await pasteboard.string() ?? "")
      else if (typeof pasteboard?.string === "string") raw = pasteboard.string

      if (!raw.trim()) {
        raw = String(await Dialog.prompt({
          title: "剪贴板导入",
          message: "请粘贴模块链接或模块内容",
          placeholder: "https:// 或 [Rule] / [Script]",
        }) ?? "")
      }
      const value = raw.trim()
      if (!value) return
      if (/^https?:\/\//i.test(value)) setRemoteSource(value)
      else {
        setIsRemote(false)
        setLink("")
        setContent(value)
        if (!name.trim()) setName(deriveNameFromContent(value))
      }
    } catch (e: any) {
      await Dialog.alert({ title: "读取剪贴板失败", message: String(e?.message ?? e) })
    }
  }

  function restoreRecentImport(item: RecentImport) {
    if (!item.link) return
    setRemoteSource(item.link)
    setName(item.name)
    if (item.category) setCustomCategory(item.category)
  }

  return (
    <NavigationStack>
      <VStack
        navigationTitle={props.title}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarTrailing: (
            <Button
              title="保存"
              action={() => {
                HapticFeedback.mediumImpact()
                void onSave()
              }}
            />
          ),
        }}
      >
        <Form formStyle="grouped">
          <Section header={<Text>模块信息</Text>}>
            <TextField
              label={<Text>名称</Text>}
              value={name}
              onChanged={(v: string) => setName(v)}
              prompt="模块名称"
            />
            <Toggle
              title="远程模块"
              value={isRemote}
              onChanged={(value: boolean) => {
                HapticFeedback.heavyImpact()
                setIsRemote(value)
              }}
            />
            {isRemote ? (
              <TextField
                label={<Text>链接</Text>}
                value={link}
                onChanged={(v: string) => setLink(v)}
                prompt="https://"
              />
            ) : (
              <VStack
                spacing={8}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
              >
                <Text foregroundStyle="secondaryLabel">模块内容（点击编辑）</Text>
                <Button
                  buttonStyle="plain"
                  action={() => {
                    HapticFeedback.mediumImpact()
                    void openLocalContentEditor()
                  }}
                >
                  <VStack
                    spacing={8}
                    padding={{ top: 12, bottom: 12, leading: 12, trailing: 12 }}
                    frame={{ maxWidth: "infinity", minHeight: 120, alignment: "topLeading" }}
                    background={{
                      style: "secondarySystemBackground",
                      shape: { type: "rect", cornerRadius: 14 },
                    }}
                  >
                    <Text
                      font="caption"
                      foregroundStyle={content.trim() ? "secondaryLabel" : "tertiaryLabel"}
                      lineLimit={5}
                      frame={{ maxWidth: "infinity", alignment: "leading" }}
                    >
                      {content.trim() || "暂无内容，点击进入 Editor 编辑"}
                    </Text>
                  </VStack>
                </Button>
              </VStack>
            )}
          </Section>

          <Section header={<Text>分类</Text>}>
            <Picker
              title={"模块分类"}
              pickerStyle="menu"
              value={categoryIdx}
                onChanged={(idx: number) => {
                  HapticFeedback.heavyImpact()
                  setCategoryIdx(idx)
                }}
              >
              {categoryOptions.map((c, idx) => (
                <Text key={`${c}-${idx}`} tag={idx}>
                  {c}
                </Text>
              ))}
            </Picker>
            <TextField
              label={<Text>自定义分类</Text>}
              value={customCategory}
              onChanged={(value: string) => setCustomCategory(value)}
              prompt="输入后会自动加入分类列表"
              textFieldStyle="roundedBorder"
            />
          </Section>

          {saveDirOptions.length ? (
            <Section header={<Text>保存路径</Text>}>
              <Picker
                title={"保存路径"}
                pickerStyle="menu"
                value={saveDirIdx}
                onChanged={(idx: number) => {
                  HapticFeedback.heavyImpact()
                  setSaveDirIdx(idx)
                }}
              >
                {saveDirOptions.map((p, idx) => {
                  const label = idx === 0 ? "根目录" : (String(p).split("/").pop() ?? p)
                  return (
                    <Text key={`${p}-${idx}`} tag={idx}>
                      {label}
                    </Text>
                  )
                })}
              </Picker>
            </Section>
          ) : null}

          {!initial ? (
            <>
              <Section header={<Text>快捷导入</Text>}>
                <QuickImportRow
                  title="远程链接"
                  subtitle="支持 HTTPS 模块链接或 Script-Hub 转换结果"
                  systemImage="link"
                  tint="systemBlue"
                  onPress={openRemoteLinkInput}
                />
                <QuickImportRow
                  title="本地文件"
                  subtitle="从设备中选择 .sgmodule、.plugin 或文本文件"
                  systemImage="doc"
                  tint="systemPurple"
                  onPress={openLocalFilePicker}
                />
                <QuickImportRow
                  title="剪贴板"
                  subtitle="识别剪贴板中的模块链接或模块内容"
                  systemImage="doc.on.clipboard"
                  tint="systemGreen"
                  onPress={openClipboardImport}
                />
              </Section>

              <Section
                header={(
                  <HStack>
                    <Text>最近导入</Text>
                    <Spacer />
                    {recentImports.length ? (
                      <Button
                        title="清空"
                        action={() => {
                          HapticFeedback.mediumImpact()
                          clearRecentImports()
                          setRecentImports([])
                        }}
                      />
                    ) : null}
                  </HStack>
                )}
              >
                {recentImports.length ? recentImports.slice(0, 3).map((item) => (
                  <HStack key={`${item.link || item.name}-${item.importedAt}`} padding={{ top: 8, bottom: 8 }}>
                    <Image
                      systemName={item.link ? "arrow.down.circle.fill" : "doc.fill"}
                      font={18}
                      foregroundStyle={item.link ? "systemBlue" : "secondaryLabel"}
                    />
                    <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                      <Text lineLimit={1}>{item.name}</Text>
                      <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
                        {item.category ? `分类：${item.category} · ` : ""}{relativeImportTime(item.importedAt)}
                      </Text>
                    </VStack>
                    {item.link ? (
                      <Button
                        title="重新导入"
                        buttonStyle="borderedProminent"
                        tint="systemGreen"
                        action={() => restoreRecentImport(item)}
                      />
                    ) : (
                      <Text font="caption" foregroundStyle="secondaryLabel">本地模块</Text>
                    )}
                  </HStack>
                )) : (
                  <Text foregroundStyle="secondaryLabel">完成一次导入后，会在这里显示最近使用的模块。</Text>
                )}
              </Section>

              <Section header={<Text>自定义来源</Text>}>
                <Text foregroundStyle="secondaryLabel" lineLimit={4}>
                  不内置第三方在线库。需要使用自定义来源时，请回到主页底部“来源”，填写直链并通过 Script-Hub 转换后添加。
                </Text>
              </Section>
            </>
          ) : null}
        </Form>
      </VStack>
    </NavigationStack>
  )
}
