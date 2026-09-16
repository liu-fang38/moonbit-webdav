# 功能与兼容性边界 — 0.4.0

| 能力 | 当前实现与验证 |
|---|---|
| HTTP(S)/认证 | Node 原生 HTTP(S)，Basic/Bearer；Digest/auto，MD5/SHA-256/SHA-512-256、sess、auth/缓冲 auth-int/无 qop、UTF-8/userhash、计数/可选 rspauth；2 条 RFC 向量、18 条 Python hashlib 向量及真实 WsgiDAV Digest |
| 文件与目录 | GET/HEAD/PUT/DELETE/MKCOL/OPTIONS、COPY/MOVE、stat/list/mkdirAll；中文路径、ETag 条件、递归目录生命周期、网络 CLI |
| 属性与 XML | 命名空间选择、propname、原子 set/remove、丰富 Multi-Status；展开名称/属性/混合文本、实体/数字引用/CDATA、序列化；150 条 ElementTree 语义/非法输入对照 |
| 锁 | exclusive/shared、depth 0/infinity、创建空资源锁、刷新/解锁、正向 tagged/untagged If；真实写入冲突和多资源 COPY；未实现租期自动续约 |
| 流与错误 | 有长度 PUT 工厂重放、GET 流/Range、背压、全程超时/取消、精确长度、207 失败项；12 MiB 实机字节校验及故障夹具 |
| TLS | 可信 CA 成功、不可信证书失败、主机名不匹配失败；没有关闭证书验证的选项 |

## 资源与互操作边界

- XML 输入上限 1,048,576 个宿主字符串长度单位（不是字节上限）；元素深度 0..32、10,000 元素、单元素最多 256 个原始属性。序列化另有树/字符串预算和最终 1,048,576 长度上限，预算可能更早拒绝接近上限的树。
- 只接受 XML 1.0、UTF-8/US-ASCII 声明；JS HTTP 解码使用严格 UTF-8。拒绝 DTD/自定义与外部实体、其它编码；注释/PI 被丢弃，不保留原前缀或 CDATA 形式。不是通用 XML 符合性声明。
- 属性请求最多 256 项；锁令牌/资源条件最多各 64 项、If 最长 65,536 字符。If 辅助函数只产生一个正向 AND 列表，不提供完整 Not/ETag/OR 条件表达式。
- API 默认 Basic 是既有行为；CLI 默认 Digest。Digest 支持 NFC UTF-8 或 Latin-1 凭据；不做完整国际化用户名/口令策略。Basic/Bearer 不构成传输加密。
- Buffered 默认 8 MiB；流式需要已知上传长度与可重建源，不提供未知长度/chunked PUT、流式 auth-int、断点续传、自动重连或分块提交。HEAD/GET 等失败仍保留有界响应。
- WsgiDAV 4.3.5 返回不带尖括号的 Lock-Token；客户端接受单个合法绝对 URI，但仍要求与 XML 中的 token 一致，发出请求时使用标准尖括号。
- WsgiDAV 4.3.5 将 propname 识别为非标准 DAV:name；标准 DAV:propname 会收到 href-only 207，客户端拒绝。标准路径另由夹具覆盖，没有将错误响应视为成功。
- WsgiDAV/Cheroot 的首次 HEAD 认证 401 携带不合法 body，Node 拒绝其 HTTP framing；独立认证用 GET，已认证 HEAD 已测。标准 HEAD challenge 在夹具通过。
- 两个同用户共享锁的 WsgiDAV 写入场景提交全部有效 token；未证明跨用户共享锁策略的全面兼容。

## 尚未追平的部分

NTLM/Negotiate/MSPASS 等认证、代理与可配置重定向/连接池策略、更多跨服务器兼容、完整 XML/If 条件语法、未知长度和 auth-int 流、自动续锁/恢复、生产规模吞吐/内存/并发/长期验证尚缺。只有一个独立服务器版本的集成证据；没有 Apache/mod_dav、IIS、Nextcloud 或 litmus 全套结果。不得据测试数量宣称 RFC 全符合或成熟库全追平。

## 工程交付范围

独立 Git/构建、公共 API、可执行文档、编译网页/CLI、JS/Wasm-GC、静态参考向量、网络故障夹具和 CI 配置均在仓库。CI 未远端执行；历史 coverage/ZIP/bundle 不是 0.4 的当前结果。验证记录与源码指纹见 evidence。
