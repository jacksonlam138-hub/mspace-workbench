# 公开发布审查

2026-10-25。范围：release 发布快照；目标：jacksonlam138-hub/mspace-workbench，Public。沿用用户明确的公开发布授权。

## 结果

- 已配置凭证精确匹配扫描：源码、文档、截图二进制和构建输出无命中；不输出凭证值。
- 常见真实密钥格式扫描：无命中。示例仅为空值或环境变量占位符；测试使用明显的虚构凭证。
- 私人绝对路径扫描：无命中。
- `.env` 不在快照；`.env*` 默认忽略，仅允许 `.env.example`。
- node_modules、dist、浏览器缓存、测试输出不发布。
- 保留 localhost 地址用于本机启动和契约测试，不是私网生产端点。
- 当前截图为公开门店、营养或时间查询，没有个人账户数据或凭证。
- 根目录五项赛事文件齐备；CONTEST_DECLARATION.md 与获取的官方模板逐字一致。
- MCP 配置使用 `${MCD_MCP_TOKEN}`，不含真实值。
- WorkBuddy 摘录明确标记其实际工作和 Codex 接手部分，不伪造完整对话。

## 验证与发布方式

发布快照 frozen-lockfile 安装后，59 项领域测试、42 项服务端测试、类型检查与构建通过。独立干净目录再次 frozen-lockfile 安装及 verify 通过：59 项领域、42 项服务端、类型与构建。

公开仓库使用独立初始历史与 GitHub noreply 身份；本地开发历史保留，不公开其中的本机路径。发布前扫描公开 Git 对象；推送后回读可见性、main 分支、提交 SHA 和根目录文件。

外部模型尚未配置或实测，用户选择先发布当前版本。正式参赛 Issue 尚未提交。

## 传输调整

Git HTTPS 上传在服务端确认阶段两次超时，改用 gh 调用官方 Git Data API，上传同一快照并按 Git blob SHA 逐文件比较。API 初始化的默认作者元数据改为明确的 GitHub noreply 身份，最终 main 使用独立完整快照历史。

## 发布完成

- 仓库：https://github.com/jacksonlam138-hub/mspace-workbench
- 可见性：Public；默认分支：main。
- 完整源码提交：`7e3d063cc6440be2eb1831aebb5644923f8f81f9`。
- GitHub 回读 95 个文件与本地逐项 SHA 一致，五个赛事根文件齐全。
- 作者与提交者使用 GitHub noreply 身份。
- 本文件的后续文档提交不改变上述已测试源码。
