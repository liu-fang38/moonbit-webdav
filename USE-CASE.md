# WebDAV 条件写入与冲突处理客户端的可运行任务

两个客户端编辑同一个远程配置文件时，用强ETag的If-Match条件拒绝过期写入，保留已写入版本；调用方明确解决冲突后，再针对当前ETag提交。

先按 [README](README.md) 构建并准备依赖，再运行 `node examples/run-conflict-workflow.mjs`，或使用已更新的通用入口 `node examples/run-use-case.mjs`。后者只负责保存stdout和回执，不将运行器本身计为协议贡献。

两个客户端读取相同初始文件/ETag。Alice写入新内容，Bob用旧ETag提交不同内容得到412；再次读取证明Alice内容未被覆盖。样例明确保留Alice内容并补Bob的备注，再用当前ETag写入；GET结果与独立服务端文件系统字节一致。

report.json包含staleWriteStatus=412、winnerPreserved=true、explicitResolutionWritten=true、filesystemBytesMatch=true和五份文件的SHA-256。

未经修改的WsgiDAV4.3.5独立服务器、临时共享目录、两个客户端，通过校验临时证书的本机HTTPS和Digest运行。输入为原创配置示例，不是企业文档平台采用或完整同步验收。

If-Match保护单个资源且依赖服务器正确处理强ETag；没有全目录事务、分布式锁服务、离线合并算法或同步调度器。示例中的内容合并是明确写出的样例决策，不会自动理解业务冲突；生产使用方和更多服务端仍未验证。

完整参数、环境、失败语义及参考实现差异见 [WORKFLOW](WORKFLOW.md)。旧离线报文仍留作解析器小例子，不再作为主任务完成的唯一证据。
