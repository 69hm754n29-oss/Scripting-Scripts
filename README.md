# Surge 模块管理（Scripting）

这是一个独立维护的 Scripting 脚本，仅用于管理 Surge 本地 `.sgmodule` 模块。

## 功能

- 通过书签目录管理 Surge 本地模块，支持子目录、分类、本地模块和链接格式识别。
- 批量或单个下载、更新远程模块。
- 通过 Script-Hub 的 Scripting 导入链接，将转换后的模块下载并写入选定的 Surge 目录。
- 从 iOS“文件”分享已经转换好的 `.sgmodule`，直接写入选定的 Surge 目录，保留文件内容。
- 写入后回读校验，避免 iCloud 文件提供器未提交时误报成功。
- 支持快捷指令和远程 HTTP 控制。

## 运行依赖与前置条件

本仓库不使用 npm/Node.js 依赖；运行时依赖由 iOS Scripting 和 Surge 提供。

必须具备：

1. iOS/iPadOS 上安装支持 Intent 的 Scripting，并从本仓库根地址导入项目：`https://github.com/ranzhigg/Scripting-Scripts`。
2. 项目目录包含 `index.tsx` 和 `intent.tsx`，`script.json` 的 `intentInputTypes` 至少包含 `File URLs`；从 Script-Hub 深链调用时还需要 `URLs`。
3. 在 Scripting 项目设置中选择 Surge 的本地模块书签目录，并保持该目录授权有效。目录通常位于 Surge 的 iCloud 文件提供器中。
4. 使用 Script-Hub 导入链接时，Surge 的 Script-Hub 模块和相关重写脚本必须启用，使 `http://script.hub` 本地转换地址可由 Scripting 访问。

不需要：Mac Surge、Surge HTTP API、Scriptable，或在设备上安装 Node.js。Files 分享导入是本地文件路径写入，不经过 `script.hub` 网络请求。

## Script-Hub 导入

在 Script-Hub 中选择 `Scripting 导入`，脚本会将模块写入设置中选定的 Surge 书签目录。

当前推荐的深链形式是：

```text
scripting://run_single/<脚本名>?sh_action=import-surge-module&sh_module_url=<转换结果>&sh_module_name=<文件名>&sh_module_category=Script%20Hub
```

Script-Hub 页面中的脚本名由用户配置，不应在转换器代码中写死。`run_single` 会启动一个新的脚本实例；`index.tsx` 先处理深链参数，再下载、写入、回读校验，最后调用 `Script.exit()`。

Scriptable 的实现方式是接收 `url/name` URL 参数，用 iOS 网络请求获取转换结果后写入 iCloud；本脚本兼容 Script-Hub 的同类参数，并额外支持从 Files 分享本地 `.sgmodule`。本地文件导入不经过 `script.hub` 网络请求，也不依赖 Mac Surge。

Script-Hub 的 `http://script.hub/file/...` 是由 Surge 的 Script-Hub 模块和脚本处理的本地转换地址，不是普通公网下载地址。因此需要同时满足：

1. Scripting 的网络请求经过 Surge；
2. Surge 的 Script-Hub 模块已启用；
3. Script-Hub 的重写脚本已启用；
4. Scripting 设置中选择的目录是 Surge 实际使用的 iCloud 模块目录。

如果已经在 Files 中保存了转换结果，可直接在 Files 里选择 `.sgmodule` → 分享 → Scripting → Surge 模块管理。首次使用前，在脚本设置中选择 Surge 的本地模块书签目录；脚本会读取文件并直接写入该目录。Scripting 不同版本可能把分享文件暴露为 `fileURLsParameter` 或 `filesParameter`，脚本均已兼容。

Files 分享入口依赖 Scripting 的 Intent 注册。若分享后显示“没有可运行的脚本”，不是写入失败，而是当前 Scripting 项目没有启用 `File URLs`，或手机上的旧项目清单尚未刷新；请在项目标题 → Intent 设置中勾选 `File URLs`，必要时重新导入最新 `.scripting` 包。

脚本会对书签访问、网络下载和文件写入设置超时，并在计时器建立后才启动这些操作。深链导入采用单次、无界面执行，先于首页组件加载处理参数，完成或失败后立即通过 `Script.exit` 释放脚本实例，不会等待不可见的前台弹窗或无限驻留后台。Scripting 的 URL Scheme 仍需指向当前脚本，但导入失败时应优先检查运行日志中的输入参数、书签目标目录和 `script.hub` 网络请求阶段，而不是依赖名称猜测原因。

## 已验证的重点事项

- 通过 Script-Hub 转换结果触发 Scripting 深链，模块能够写入 Surge 书签目录。
- 通过 Files 分享本地 `.sgmodule`，模块能够直接写入同一目录。
- 写入后会回读文件内容并校验，避免 iCloud/File Provider 尚未提交时误报成功。
- 书签目录解析失败、网络下载失败、响应为空或写入失败都会返回明确错误，并结束脚本实例。
- 同名模块的覆盖和来源校验仍由现有模块写入逻辑控制；不要绕过脚本直接修改 Surge 的 iCloud 目录。

## 安装

在 Scripting 中直接导入本仓库根地址 `https://github.com/ranzhigg/Scripting-Scripts`。脚本清单 `script.json` 位于仓库根目录，首次运行后在设置页选择 Surge 的本地模块目录。

不要再使用旧的 `.../tree/main/Surge-Module-Manager` 子目录地址；当前仓库只有一个脚本，已调整为根目录可直接远程导入。

导入后建议立即检查：项目标题 → Intent 设置 → `File URLs`、`URLs`、`Text`；然后用一个小型 `.sgmodule` 做一次 Files 分享冒烟。远程更新仓库文件不会替代手机端的 Intent 设置检查。

## 维护

本仓库独立维护，不跟随其他 Scripting 脚本集合，也不要求兼容其目录结构。
