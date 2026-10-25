## v3.0.11
- 修复 Script-Hub 深链启动后脚本驻留：导入结果不再等待没有展示根视图的前台弹窗，完成或失败后直接通过 `Script.exit` 释放实例。
- `run_single` 冷启动先处理参数，再注册普通 `run` 的恢复监听；同时增加单次执行保护，避免同一导入并发启动两份下载任务。

## v3.0.10
- 修复 Script-Hub 导入在后台无限等待的问题：书签解析、目标读取、网络下载和文件写入均增加超时。
- 导入时只检查选定目录中的目标文件，不再递归扫描整个 iCloud 目录，避免文件提供器扫描导致脚本卡住。
- 下载完成后继续回读校验，并在超时时返回明确的阶段和原因。

## v3.0.9
- Script-Hub 深链导入成功或失败时在 Scripting 前台显示明确结果，避免只看到 App 被打开而无法判断脚本是否执行。
- 模块写入后增加回读校验，并返回实际写入路径；书签目录不可写或文件提供器未提交时直接报错。

## v3.0.8
- 恢复原有脚本名 `Surge模块管理`，兼容旧版已安装脚本及 Script-Hub 默认深链；Scripting 会在脚本执行前严格按名称路由。

## v3.0.7
- 修正 Scripting 的 URL Intent 输入类型为 `URLs`，让 Script-Hub 的 `scripting://run_single` 深链能够匹配并执行本脚本。
- 远程更新地址切换到 `ranzhigg/Scripting-Scripts`，后续直接从你的仓库更新。

## v3.0.6
- 兼容 Script-Hub 当前 `http://script.hub` 结果地址，仅允许该精确入口，其他普通 HTTP 地址仍拒绝。
- 内置识别 Scriptable 使用的 `#SUBSCRIBED` 源地址标记，兼容已有 Scriptable 本地模块。
- 写回 `#SUBSCRIBED` 时保留空格格式，避免被 Scriptable 的更新逻辑漏识别。

## v3.0.5
- 兼容 Script-Hub 通过 URL、Intent 和恢复事件传入的导入参数，避免深链启动后误走“更新全部模块”。
- 修复从外部链接启动时未读取 `Intent.urlsParameter` / `textsParameter` 的问题。
- 为脚本声明 URL 输入类型，避免 Scripting 将外部链接识别为分享输入时显示“没有可运行的脚本”。

## v3.0.4
- 将 Script-Hub 深链载荷迁移为 `sh_*` 参数，避免 Scripting 将通用 `url` 参数误判为分享输入而进入“处理文件”。

## v3.0.3
- Script-Hub 深链改用通用 `scripting://run/` 入口，并为已打开的脚本注册恢复处理，确保冷启动和前台恢复都会接收导入参数。

## v3.0.2
- 将对外可调用的脚本名称统一为 `Surge 模块管理`，与 Scripting 中显示的已安装脚本名称精确一致，供 Script-Hub 深链调用。

## v3.0.1
- 支持 Script-Hub 的 `import-surge-module` 深链：将转换结果安全下载为书签目录下的本地 Surge 模块。
- 深链导入仅允许 HTTPS 来源；同名但来源不同的模块不会被静默覆盖。
- 下载/更新会拒绝空内容、过大内容和不能识别为 Surge 模块的响应，避免将登录页或错误页写入 `.sgmodule`。

## v3.0.0
- 远程资源链接调整，不再使用release链接，直接使用仓库文件夹链接，请手动更换

## v2.14.3
- Editor移除底部安全区域，修正安全区参数，防止搜索框不随键盘抬高。

## 更早
- 更新说明页面适配低版本系统
- 增加搜索按钮，可搜索模块名称及内容
- 状态显示卡片默认隐藏，当有状态时显示
- Editor去除safety area
