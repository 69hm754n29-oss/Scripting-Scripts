# Surge 模块管理（Scripting）

这是一个独立维护的 Scripting 脚本，仅用于管理 Surge 本地 `.sgmodule` 模块。

## 功能

- 通过书签目录管理 Surge 本地模块，支持子目录、分类、本地模块和链接格式识别。
- 批量或单个下载、更新远程模块。
- 通过 Script-Hub 的 Scripting 导入链接，将转换后的模块下载并写入选定的 Surge 目录。
- 写入后回读校验，避免 iCloud 文件提供器未提交时误报成功。
- 支持快捷指令和远程 HTTP 控制。

## Script-Hub 导入

在 Script-Hub 中选择 `Scripting 导入`，脚本会将模块写入设置中选定的 Surge 书签目录。

Script-Hub 的 `http://script.hub/file/...` 是由 Surge 的 Script-Hub 模块和脚本处理的本地转换地址，不是普通公网下载地址。因此需要同时满足：

1. Scripting 的网络请求经过 Surge；
2. Surge 的 Script-Hub 模块已启用；
3. Script-Hub 的重写脚本已启用；
4. Scripting 设置中选择的目录是 Surge 实际使用的 iCloud 模块目录。

脚本会对书签访问、网络下载和文件写入设置超时。深链导入采用单次、无交互执行，完成或失败后立即释放脚本实例，不会等待不可见的前台弹窗或无限驻留后台。

## 安装

在 Scripting 中导入 `Surge-Module-Manager` 脚本目录，首次运行后在设置页选择 Surge 的本地模块目录。

## 维护

本仓库独立维护，不跟随其他 Scripting 脚本集合，也不要求兼容其目录结构。
