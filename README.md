# WebDAV 条件写入、锁与流式文件客户端

**本项目仓库：[https://github.com/liu-fang38/moonbit-webdav](https://github.com/liu-fang38/moonbit-webdav)**

模块 `liu-fang38/webdav`，本地版本 **0.4.0**，MIT。当前评审状态：**条件复审**。本文件是当前入口，旧轮次说明与详细用法保存在 [历史/完整使用说明](README-BEFORE-VALUE-REWORK.md)。

## 解决什么任务

将通用远程文件操作接入应用，支持条件请求、锁刷新和流式传输，减少覆盖并发更新或一次性载入大文件的风险。

需要互通通用 DAV 文件端点、条件写入与锁时评估；与日历 CalDAV 服务端不同，但协议版本完整性有限。

## 直接复现

安装 MoonBit 和 Node.js 24，在本仓库根目录运行：

```sh
moon build --target js
node -e "require('node:fs').copyFileSync('_build/js/debug/build/cmd/web/web.js','web/engine.mjs')"
node examples/run-use-case.mjs
```

流程：**读取远端资源的条件写入元数据**。运行器创建新的系统临时目录，保留每一步的 stdout/stderr、产物及 `report.json`，打印实际目录；重复运行不会覆盖之前产物。它只执行仓库内的本地样例，不连接公网或发送消息。`report.json` 的 `expected` 是应观察的结果，实际结果在各步输出中；成功退出不替代内容核对。

输入性质：离线合成 PROPFIND 响应；实际锁/流式上传的回环验证另列，本例不发网络请求。

应观察：解析 href、42 字节长度、ETag v1；不把属性响应当作成功完成条件写入的证明。

具体命令和输入路径见 [使用任务](USE-CASE.md) 与 [机器可读流程](examples/use-case.json)。只把这个脚本当复现入口，不把通用运行器计作核心技术贡献。

## 实现与已有项目的关系

MoonBit 处理路径、请求、XML、属性和锁信息；Node 提供 HTTP(S)、Digest、流式 I/O 和文件入口。

moon-ical 的 CalDAV 服务端已存在；本项目是通用 WebDAV authoring 客户端，文件锁/传输工作流不同于日历服务端。不称整个 DAV 生态空白。

同类项目和检索边界见 [DUPLICATION](DUPLICATION.md)。查重用于避免错误的首创表述；关键词零结果不能证明生态空白，Node 宿主能力也不计为 MoonBit 原生 I/O。

库使用从 [公共 API](pkg.generated.mbti) 和根包源码开始；可在本 checkout 的消费包中导入 `"liu-fang38/webdav"`。源码中的网络/文件宿主入口及完整参数仍见 [完整使用说明](README-BEFORE-VALUE-REWORK.md)。是否已发布到 Mooncakes 需另核实，本文不把 `moon add` 的下载成功作为已完成事项。

## 验证与边界

前一轮工程验证回环 authoring 客户端、条件请求/锁和传输检查通过；历史 WsgiDAV 对照与前一轮工程验证本机 peer 证据分开。

[上一轮工程验证](evidence/innovation-review-20260922/results.json) 与 [本轮最小任务回执](evidence/value-rework-20260922/use-case.json) 分开。历史参考版本、golden 重放、本机 peer、真实第三方服务端和本次样例是不同证据，不能合并成“全部生产验证”。

常规核心检查可运行 `moon check --target js`、`moon test --target js`、`moon test --target wasm-gc`。专项命令：

```sh
node tools/test-authoring-client.mjs
```

专项所需的参考环境和历史版本见原使用说明及 TESTING 文档；本轮回执只记录实际执行项，不声称上面所有参考服务在任意环境即装即跑。

不提供完整 CalDAV/CardDAV 客户端或所有服务器扩展，兼容性以固定服务端和已测请求为限。

## 复审材料状态

没有已有企业文档平台使用方证明；条件请求不能推导全局同步冲突已经解决。

2026-09-22 匿名新克隆成功；默认分支 `main`，核验公开提交 `6a780dd19fbda252342cb8773caa88bf57a3023a`。本轮源码修订仅在本地，尚未推送；此记录不证明当时报名表中的地址正确，也不证明新修订已上线。

[申报草稿](PROPOSAL.md) 已压缩为 30 行以内，并单独标明本项目仓库；[复核说明](REVIEW-RESPONSE.md) 区分材料错误、功能变化及尚未解决的问题。没有编造用户、设备接入、生产部署或评审认可。
