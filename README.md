# Surge 模块管理（Scripting）

用于在 iPhone、iPad 上管理 Surge 本地 `.sgmodule` 模块的 Scripting 脚本。

## 导入地址

请复制下面这一行，粘贴到 Scripting 的“导入远程脚本”输入框：

```text
https://github.com/ranzhigg/Scripting-Scripts
```

不要先打开链接再复制浏览器地址栏。浏览器地址栏中的链接可能未编码，会导致导入参数异常。

源码和文档浏览地址：[GitHub 仓库](https://github.com/ranzhigg/Scripting-Scripts)

当前脚本清单位于仓库根目录，不需要进入子目录。

## 功能

- 管理、分类和搜索 Surge 本地模块
- 批量或单个更新远程模块
- 从 Script-Hub 转换结果导入本地 Surge 模块
- 从 iOS“文件”分享 `.sgmodule` 文件并直接写入 Surge 目录
- 支持子目录、模块重命名、编辑和删除
- 支持快捷指令和可选的 Surge HTTP 远程控制
- 写入后自动检查目标文件，避免导入结果不明确
- 更新前可预览远程内容变化
- 远程更新和覆盖写入自动保留备份，支持选择版本回滚
- 工具栏提供模块健康检查，可发现文件、格式和重复链接问题

## 依赖

- iOS/iPadOS 上安装 Scripting
- Surge 已开启 iCloud，并能看到本地模块书签目录
- 首次运行时在脚本设置中选择 Surge 的模块目录
- 在线转换导入需要搭配 **Script-Hub 测试版**，并启用对应模块和重写
- Script-Hub 中填写的 Scripting 脚本名必须与 Scripting 里显示的名称完全一致，默认是 `Surge模块管理`

脚本本身不需要 Scripting Pro API，也不需要 Mac Surge、Node.js 或 Scriptable。普通版 Scripting 即可运行；Scriptable 仅作为另一种可选导入方式。

## 安装

1. 打开 Scripting 的远程脚本导入功能。
2. 粘贴远程导入地址：`https://github.com/ranzhigg/Scripting-Scripts`
3. 导入后打开“Surge 模块管理”。
4. 进入设置，选择 Surge 使用的 iCloud 模块目录。
5. 在项目标题的 Intent 设置中启用 `File URLs`、`URLs` 和 `Text`。

## 使用方法

### 从 Script-Hub 导入

1. 安装并启用 Script-Hub 测试版。
2. 在 Surge 中启用 Script-Hub 模块及相关重写。
3. 在 Script-Hub 的导入设置中填写 Scripting 里实际显示的脚本名，默认填写 `Surge模块管理`。
4. 在 Script-Hub 中完成转换后，点击“导入 Surge（本地模块，需配合 Scripting）”。
5. Scripting 会通过脚本名启动本脚本，将转换结果写入已选择的 Surge 模块目录。

脚本名是深链路由的一部分。若你在 Scripting 中重命名了脚本，也必须同步修改 Script-Hub 中的脚本名；名称多一个空格、少一个字或使用旧名称，都可能只打开 Scripting 而没有执行导入。

请直接点击 Script-Hub 页面中的导入按钮，不要打开链接后复制浏览器地址栏内容。地址栏中的 URL 可能没有正确编码，复制后会导致导入参数异常。

### 从“文件”导入

1. 在“文件”中找到已经转换好的 `.sgmodule` 文件。
2. 点击分享，选择 Scripting → Surge 模块管理。
3. 脚本会把文件写入 Surge 的模块目录。

这种方式使用本地文件，不需要请求 Script-Hub。

### 管理和更新模块

- 打开脚本后可刷新模块列表。
- 远程模块可以单独更新，也可以批量更新。
- 长按远程模块选择“预览更新”，确认差异后再写入。
- 每次覆盖写入前会自动备份，长按模块选择“回滚版本”即可恢复；每个模块最多保留 8 个备份。
- 本地模块可以编辑、重命名、移动分类或删除。
- 添加模块时可直接输入自定义分类，分类会立即保存；导入模块中的 `#!category=xxx` 也会自动加入分类列表。
- 模块名称相同但来源不同的时候，脚本会提示确认，不会静默覆盖。
- 点击工具栏的盾牌图标可运行健康检查。

### 快捷指令

可以通过 Scripting 的“运行脚本”调用：

- 不传参数或传入 `all`：更新全部远程模块
- 传入分类名：只更新指定分类
- 传入 JSON：`{"category":"广告拦截","name":"模块名称"}`
- 传入多个模块名：`{"names":["模块1","模块2"]}`

## 常见问题

### Scripting 提示“没有可运行的脚本”

在项目标题 → Intent 设置中启用 `File URLs`，然后重新导入或刷新脚本。

### Scripting 打开了，但没有导入模块

检查以下项目：

1. Script-Hub 中的 Scripting 脚本名是否与 Scripting 里显示的名称完全一致。
2. 是否已经在脚本设置中选择 Surge 的 iCloud 模块目录。
3. 该目录是否仍然有访问权限。
4. Script-Hub 模块和重写是否已启用。
5. 是否直接点击了导入按钮，而不是复制未编码的浏览器地址。

脚本名只影响 Script-Hub 的 `scripting://run_single/...` 深链导入；从“文件”分享 `.sgmodule` 时，Scripting 通过 Intent 直接调用脚本，不依赖这个名称设置。

### 只想导入本地文件

直接使用“文件”分享 → Scripting → Surge 模块管理，不需要启用 Script-Hub 网络转换。

### 导入时选择分类

通过脚本内的“添加模块”导入远程链接或本地内容时，可在“自定义分类”中填写分类，保存后会立即加入分类列表。

Script-Hub 和“文件”分享属于后台 Intent 导入，不能在系统跳转过程中弹出分类选择框：优先使用链接参数中的分类，其次读取模块内容里的 `#!category=xxx`；如果都没有，导入后长按模块选择“编辑”再指定分类。

## 版本

当前版本：`3.0.22`

本仓库只维护这一个 Scripting 脚本。
