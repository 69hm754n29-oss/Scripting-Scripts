# Surge 模块管理（Scripting）

用于在 iPhone、iPad 上管理 Surge 本地 `.sgmodule` 模块的 Scripting 脚本。

## 导入地址

```text
https://github.com/ranzhigg/Scripting-Scripts
```

在 Scripting 的“导入远程脚本”中直接粘贴仓库地址即可。当前脚本清单位于仓库根目录，不需要进入子目录。

源码和文档：[GitHub 仓库](https://github.com/ranzhigg/Scripting-Scripts)

## 页面结构

脚本启动后分为两个页面：

### Scripting版

- 管理、搜索、分类 Surge 本地 `.sgmodule` 模块
- 刷新模块列表、单个或批量更新远程模块
- 添加远程模块、本地文件和剪贴板内容
- 模块重命名、编辑、移动、删除、备份、回滚和健康检查
- 支持递归子目录、分类持久化、最近导入记录
- 可选 Surge HTTP 远程控制和快捷指令更新

### Script-Hub

- 使用上游 Script-Hub 测试版作为转换核心
- 输入插件/模块 HTTPS 直链，或直接粘贴本地文本内容，自动识别常见格式
- 支持 QX 重写、Surge 模块、Loon 插件、规则集、QX 专属脚本和纯文本源格式
- 支持 Surge、Egern、Stash、Shadowrocket、Loon 等目标格式
- 可设置模块名、文件名、描述、分类、来源 User-Agent、请求头、元数据和 jq 兼容选项
- 高级参数覆盖重写/规则筛选、脚本兼容、定时任务、脚本参数和运行选项
- 支持预览、复制转换链接，以及 Surge、Egern、Scriptable、Scripting 等导入入口
- 把 Surge 模块目标直接写入已授权的 Surge 目录
- 写入成功后自动刷新 Scripting版模块列表

应用不内置在线模块市场、不维护第三方站点列表，也不会自动扫描或分发第三方内容。单个插件或模块使用 HTTPS 直链即可。

## 依赖

- iOS/iPadOS 上安装 Scripting
- Surge 已开启 iCloud，并能看到本地模块书签目录
- 首次运行后，在“设置”中选择 Surge 使用的模块目录
- Script-Hub 转换需要启用 Script-Hub 测试版对应模块和重写
- Script-Hub 的 Scripting 导入功能需要填写 Scripting 中显示的脚本名称；如果重命名脚本，必须同步修改 Script-Hub 导入设置
- 转换按钮会按你的选择把远程来源或本地文本、请求头和高级参数发送到 Script-Hub 测试版；不要填写 Cookie、Token 等敏感凭据

脚本不需要 Scripting Pro API、Mac Surge、Node.js 或 Scriptable。普通版 Scripting 即可运行。

## 安装

1. 打开 Scripting 的“导入远程脚本”。
2. 粘贴 `https://github.com/ranzhigg/Scripting-Scripts` 并导入。
3. 打开脚本，在“设置”中选择 Surge 的 iCloud 模块目录。
4. 在项目标题的 Intent 设置中启用 `File URLs`、`URLs` 和 `Text`。

## 使用 Script-Hub 页面

1. 在 Script-Hub 测试版中完成源格式和目标格式转换设置。
2. 需要手动转换时，打开本脚本的“Script-Hub”页面，粘贴插件/模块 HTTPS 直链，或切换到“本地文本内容”粘贴文本。
3. 点击“识别来源格式”，必要时在“格式”中手动修正。
4. 按需展开“高级转换参数”配置请求头、筛选、脚本兼容和运行参数。
5. 目标为“Surge / Egern 模块”时，点击“转换并写入”，文件会写入 Scripting 设置的 Surge 目录；也可以在结果页选择客户端导入。
6. 其他目标格式点击“打开目标客户端导入链接”，或复制转换链接交给对应客户端。

不要打开转换链接后复制浏览器地址栏内容。浏览器地址栏中的链接可能未正确编码，复制后会导致参数异常。

如果从 Script-Hub 页面直接点击“导入 Surge（本地模块，需配合 Scripting）”，脚本会通过 URL Scheme 和 Intent 接收转换结果，并写入已授权目录。脚本名必须与 Script-Hub 导入设置完全一致。

## 管理模块

- 打开“Scripting版”页面可刷新模块列表。
- 远程模块可以单独更新，也可以批量更新；覆盖前会自动备份。
- 长按模块可预览更新、编辑、复制链接、查看内容、回滚或删除。
- 添加模块时可以填写自定义分类，分类会立即持久化。
- `.sgmodule` 文件可通过“文件”分享 → Scripting → 本脚本直接写入。
- 模块写入后会重新读取目标文件，避免只提示成功但实际没有落盘。

## 快捷指令

可以通过 Scripting 的“运行脚本”调用：

- 不传参数或传入 `all`：更新全部远程模块
- 传入分类名：只更新指定分类
- 传入 JSON：`{"category":"广告拦截","name":"模块名称"}`
- 传入多个模块名：`{"names":["模块1","模块2"]}`

## 常见问题

### Scripting 提示“没有可运行的脚本”

在项目标题 → Intent 设置中启用 `File URLs`，然后重新导入或刷新脚本。

### 打开 Scripting 但没有导入模块

检查脚本名、Script-Hub 模块和重写是否启用，以及 Scripting 设置中的 Surge iCloud 书签目录是否仍有权限。不要复制未编码的浏览器地址栏链接。

### 转换失败或识别不准

先点击“识别来源格式”；在线读取失败时可以在“格式”中手动选择。QX 专属脚本只能转换为“Surge 脚本（兼容）”，不能伪装成 `.sgmodule` 写入 Surge 模块目录。

### 只想导入本地文件

直接使用“文件”分享 → Scripting → 本脚本，不需要经过 Script-Hub 网络转换。

## 社区贡献

本仓库只维护 Scripting 端的通用兼容层和 UI。欢迎提交 Script-Hub 格式兼容、Scripting API 适配、性能优化和文档改进 PR；请不要把单一第三方站点、账号信息、Cookie、Token 或私有地址写入默认代码。

当前版本见 [`script.json`](script.json)。
