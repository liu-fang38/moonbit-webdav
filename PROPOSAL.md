# MoonBit WebDAV 请求与响应语义库（含 Node 条件更新宿主） · 修订申报草稿

本项目仓库：https://github.com/liu-fang38/moonbit-webdav
模块 / 本地版本：`liu-fang38/webdav` / `0.4.2`；MIT。
状态：审核结果未知，本轮预防性本地整改；Mooncakes 已出现 0.4.2 版号，本次文档与表单状态仍须核对。

## 任务与实现
两个客户端编辑同一个远程配置文件时，用强ETag的If-Match条件拒绝过期写入，保留已写入版本；调用方明确解决冲突后，再针对当前ETag提交。
MoonBit处理路径、请求、XML、属性和锁；Node提供HTTP(S)、Digest和文件/流式I/O。0.4.1主例组合已有公开WebDavClient API，加入两个独立客户端的真实条件写入流程，没有宣称新的并发控制算法。
两个客户端读取相同初始文件/ETag。Alice写入新内容，Bob用旧ETag提交不同内容得到412；再次读取证明Alice内容未被覆盖。样例明确保留Alice内容并补Bob的备注，再用当前ETag写入；GET结果与独立服务端文件系统字节一致。

## 已有生态与扩展范围
已有moon-ical的CalDAV服务端，通用WebDAV客户端和HTTP条件请求也不是新概念。本项目交付范围是MoonBit请求/XML核心及Node文件authoring宿主，区分日历服务与通用文件访问；不把整个DAV生态说成空白，也未声称基于moon-ical扩展。
固定来源与检索边界见DUPLICATION.md；没有声称生态空白、真实用户、上游认可或协议算法首创。

## 可复现证据
准备README/WORKFLOW中的依赖，构建后运行node examples/run-conflict-workflow.mjs。
未经修改的WsgiDAV4.3.5独立服务器、临时共享目录、两个客户端，通过校验临时证书的本机HTTPS和Digest运行。输入为原创配置示例，不是企业文档平台采用或完整同步验收。
JS/Wasm-GC各23项核心测试、13组authoring/Digest/stream检查、既有独立WsgiDAV对照、引擎与CLI通过；新主例保存初始、被拒绝、冲突后及显式解决后的文件和哈希。旧对照中的WsgiDAV propname限制仍保留，不冒充所有WebDAV扩展兼容。
report.json包含staleWriteStatus=412、winnerPreserved=true、explicitResolutionWritten=true、filesystemBytesMatch=true和五份文件的SHA-256；隔离 Linux 上真实 WsgiDAV 4.3.5 的 HTTPS/Digest 路径再次核对上述状态与文件字节。

## 边界和交付
If-Match保护单个资源且依赖服务器正确处理强ETag；没有全目录事务、分布式锁服务、离线合并算法或同步调度器。示例中的内容合并是明确写出的样例决策，不会自动理解业务冲突；生产使用方和更多服务端仍未验证。
交付MoonBit核心、Node宿主、可运行任务及原始证据；功能不等于业务采用，测试通过不代表初审通过。
由申报人将公开源码、报名表正文和附件同步为同一版本，避免沿用超过实现范围的旧承诺。

0.4.2 修复 Node 宿主 `stat/list` 对编码路径分隔符的错误识别；12 组身份检查、13 组客户端检查及17组独立 WsgiDAV 互通检查通过。协议范围、拒绝行为及本轮证据见 [HREF-IDENTITY](HREF-IDENTITY.md)。

**公开状态（2026-09-29 核对）**：GitHub [公开仓库](https://github.com/liu-fang38/moonbit-webdav)、[Mooncakes 0.4.2](https://mooncakes.io/docs/liu-fang38/webdav@0.4.2) 已可访问；[CI 成功记录](https://github.com/liu-fang38/moonbit-webdav/actions/runs/36436287134) 对应 `573f982bb621`。本次材料更新尚未推送；该远端 CI 对应所列公开提交。报名表一致性及赛事审核结果尚未核实。
