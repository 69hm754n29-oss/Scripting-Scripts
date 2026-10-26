import {
  Button,
  Form,
  Navigation,
  NavigationStack,
  Section,
  Text,
  TextField,
  VStack,
  useState,
} from "scripting"

import type { ModuleInfo } from "../utils/storage"
import type { ModuleMetadata } from "../utils/module_metadata"

export function ModuleDetailsView(props: {
  module: ModuleInfo
  metadata: ModuleMetadata
  remoteReady: boolean
  remoteAvailable: boolean
  enabled: boolean
}) {
  const dismiss = Navigation.useDismiss()
  const [metadata, setMetadata] = useState<ModuleMetadata>(props.metadata)
  const [tagsText, setTagsText] = useState(props.metadata.tags.join(", "))

  function save() {
    const next: ModuleMetadata = {
      ...metadata,
      category: metadata.category.trim(),
      description: metadata.description.trim(),
      author: metadata.author.trim(),
      homepage: metadata.homepage.trim(),
      notes: metadata.notes.trim(),
      tags: Array.from(new Set(tagsText.split(",").map((tag) => tag.trim()).filter(Boolean))),
    }
    dismiss(next)
  }

  const origin = props.module.isRemoteOnly
    ? "Surge HTTP API 模块"
    : props.module.link
      ? "本地远程源模块"
      : "本地模块"
  const remoteState = !props.remoteReady
    ? "Surge API 未连接"
    : !props.remoteAvailable
      ? "Surge 当前未提供此模块"
      : props.enabled
        ? "Surge 已启用"
        : "Surge 已停用"

  return (
    <NavigationStack>
      <VStack
        navigationTitle="模块详情"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarTrailing: (
            <Button title="保存" action={() => {
              HapticFeedback.mediumImpact()
              save()
            }} />
          ),
        }}
      >
        <Form formStyle="grouped">
          <Section header={<Text>状态</Text>}>
            <Text>{props.module.name}</Text>
            <Text foregroundStyle="secondaryLabel">{origin}</Text>
            <Text foregroundStyle={props.remoteAvailable ? "systemGreen" : "secondaryLabel"}>{remoteState}</Text>
            {props.module.filePath ? <Text foregroundStyle="secondaryLabel">{props.module.filePath}</Text> : null}
            {props.module.link ? <Text foregroundStyle="secondaryLabel">来源：{props.module.link}</Text> : null}
          </Section>

          <Section header={<Text>介绍</Text>}>
            <TextField
              label={<Text>分类</Text>}
              value={metadata.category}
              onChanged={(value: string) => setMetadata((current) => ({ ...current, category: value }))}
              prompt="广告、隐私、工具"
            />
            <TextField
              label={<Text>简介</Text>}
              value={metadata.description}
              onChanged={(value: string) => setMetadata((current) => ({ ...current, description: value }))}
              prompt="这个模块做什么"
            />
            <TextField
              label={<Text>作者</Text>}
              value={metadata.author}
              onChanged={(value: string) => setMetadata((current) => ({ ...current, author: value }))}
              prompt="作者或维护者"
            />
            <TextField
              label={<Text>主页</Text>}
              value={metadata.homepage}
              onChanged={(value: string) => setMetadata((current) => ({ ...current, homepage: value }))}
              prompt="https://"
              keyboardType="URL"
            />
            <TextField
              label={<Text>标签</Text>}
              value={tagsText}
              onChanged={setTagsText}
              prompt="广告、脚本、隐私"
            />
            <TextField
              label={<Text>备注</Text>}
              value={metadata.notes}
              onChanged={(value: string) => setMetadata((current) => ({ ...current, notes: value }))}
              prompt="仅保存在本脚本中"
            />
          </Section>

          <Section>
            <Text font="caption" foregroundStyle="secondaryLabel">
              API-only 模块的介绍、分类和备注只保存在本脚本中；Surge HTTP API 不会返回模块正文、源链接或作者信息。
            </Text>
          </Section>
        </Form>
      </VStack>
    </NavigationStack>
  )
}
