# WebDAV 条件写入、锁与流式文件客户端

本地申报候选材料，2026-09-22；模块 `liu-fang38/webdav`，版本 `0.4.0`。团队的公开仓库可能还是先前提交，本次没有推送；最终表单必须指向团队实际上传版本。

## 要解决的任务

将通用远程文件操作接入应用，支持条件请求、锁刷新和流式传输，减少覆盖并发更新或一次性载入大文件的风险。

以下是目标任务和可复现工程证据，不虚构客户、存量部署或采用人数。

## 现有工作与新增贡献

[justinwongcn/moon-ical 的 CalDAV 服务端](https://github.com/justinwongcn/moon-ical)。moon-ical 的 CalDAV 服务端已存在；本项目是通用 WebDAV authoring 客户端，文件锁/传输工作流不同于日历服务端。不称整个 DAV 生态空白。

MoonBit 处理路径、请求、XML、属性和锁信息；Node 提供 HTTP(S)、Digest、流式 I/O 和文件入口。

- [justinwongcn/moon-ical 固定提交](https://github.com/justinwongcn/moon-ical/tree/6d5a097701c14be1a9924949ace04de75d328081)：依据该版本的公开说明对照，不冒充本轮运行了对方全部实现。

## 可复现路径

仓库附编译引擎；修改源码后先构建。参考工具的额外依赖与环境变量见 TESTING.md；测试创建的网络服务仅在本机。

```sh
node tools/test-authoring-client.mjs
```

本轮回环 authoring 客户端、条件请求/锁和传输检查通过；历史 WsgiDAV 对照与本轮本机 peer 证据分开。 本轮 JS/WasmGC 核心测试及 JS 构建通过，原始日志见 [本轮验证](evidence/innovation-review-20260922/results.json)。测试数量证明所列范围，不能代替创新性论证或推断正式审核通过。

## 边界与来源

不提供完整 CalDAV/CardDAV 客户端或所有服务器扩展，兼容性以固定服务端和已测请求为限。

许可证与来源沿用仓库现有 LICENSE/第三方说明，不将标准、算法、词库或参考软件写成本项目发明。查重不是对全生态不存在的证明，日期、相邻项与未覆盖范围见 [DUPLICATION.md](DUPLICATION.md)。
