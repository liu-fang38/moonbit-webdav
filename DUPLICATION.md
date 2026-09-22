> 2026-09-22 三份初审反馈后的当前判断：**条件复审**。没有已有企业文档平台使用方证明；条件请求不能推导全局同步冲突已经解决。 本次差异说明：moon-ical 的 CalDAV 服务端已存在；本项目是通用 WebDAV authoring 客户端，文件锁/传输工作流不同于日历服务端。不称整个 DAV 生态空白。 以下保留之前检索的固定提交与来源；此前“补足场景”不能理解为本次已解除价值异议。

# webdav 查重与定位 · 2026-09-22

[justinwongcn/moon-ical 的 CalDAV 服务端](https://github.com/justinwongcn/moon-ical)。moon-ical 的 CalDAV 服务端已存在；本项目是通用 WebDAV authoring 客户端，文件锁/传输工作流不同于日历服务端。不称整个 DAV 生态空白。

- [justinwongcn/moon-ical 固定提交](https://github.com/justinwongcn/moon-ical/tree/6d5a097701c14be1a9924949ace04de75d328081)：依据该版本的公开说明对照，不冒充本轮运行了对方全部实现。

本轮材料采用定位：**WebDAV 条件写入、锁与流式文件客户端**。

MoonBit 与宿主分工：MoonBit 处理路径、请求、XML、属性和锁信息；Node 提供 HTTP(S)、Digest、流式 I/O 和文件入口。

本轮证据：本轮回环 authoring 客户端、条件请求/锁和传输检查通过；历史 WsgiDAV 对照与本轮本机 peer 证据分开。 具体输入、脚本、已执行与历史对照分开记录在 [PROPOSAL.md](PROPOSAL.md) 和 evidence/innovation-review-20260922/。

边界：不提供完整 CalDAV/CardDAV 客户端或所有服务器扩展，兼容性以固定服务端和已测请求为限。

检索覆盖 Mooncakes 官方关键词/别名、GitHub 仓库查询、GitLink 公开索引、直接来源文档；没有完整赛事报名表、私有仓库、未公开分支或 GitHub 全代码索引。GitLink 索引也不完整。未找到同范围项目不等于生态空白；已有相关项目不自动等于无独立贡献。完整查询和固定提交快照在总交付目录 innovation-review-20260922/。

初次复核风险为“中”。本次补足差异和可复现工作流，没有自行将重叠归零，也不替评委作创新性认定。最终公开代码与表单附件须使用一致版本。
