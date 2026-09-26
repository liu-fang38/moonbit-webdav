# 2026-09-27重新审视结论

建议保留为MoonBit协议语义库；不把HTTP 412或ETag当新并发算法。公共核心提供带命名空间的DAV XML、逐资源/逐属性状态、路径及锁请求/解析，Node承担HTTP(S)、Digest、文件与流。基础库的可复用作用不以虚构客户或协议原创证明。

本次没有改运行时代码。当前核心与完成工作流的d182215提交一致；当前engine/client/示例/harness/独立服务器调用器的5个指纹与0.4.1回执匹配，5份冲突文件原始长度/hash也匹配。核验清单在evidence/scope-20260927/REVIEW.json。既有23项/后端、13组宿主和17组WsgiDAV检查是原版本实跑，本轮只核对证据对应关系，没有重复运行或冒称第二服务器验收。

已有实现关系：WsgiDAV是独立服务端对照；moon-ical是相邻CalDAV服务；成熟TypeScript webdav-client是通用客户端。Mooncakes Eric-Song-Nop/opendal@0.2.0公开能力表将WebDAV列为未编译服务，该包也不等于本库DAV XML/锁接口。这个有限比较不能证明全生态不存在竞争者。

范围只覆盖保存证据中的WsgiDAV4.3.5/Cheroot11.1.2，propname已知偏差明确记录；其他服务器、生产客户、全目录同步/事务、自动合并仍未验证。只要维持这条有限声明，无需为了数量扩展成云盘或同步器。后续若要宣称跨服务器兼容，必须补第二独立实现的原始请求/响应证据。

一手比较入口：https://github.com/perry-mitchell/webdav-client 、https://mooncakes.io/docs/Eric-Song-Nop/opendal@0.2.0 、https://www.rfc-editor.org/rfc/rfc4918.html 。具体2026-09-27检索记录见总审查research/remaining-four.md。
