# MoonBit WebDAV 请求与响应语义库（含 Node 条件更新宿主）：当前流程与边界

本地版本0.4.1；源码中的网络、存储编排在Node宿主。先按README构建实际引擎，执行 `node examples/run-conflict-workflow.mjs`。

两个客户端读取相同初始文件/ETag。Alice写入新内容，Bob用旧ETag提交不同内容得到412；再次读取证明Alice内容未被覆盖。样例明确保留Alice内容并补Bob的备注，再用当前ETag写入；GET结果与独立服务端文件系统字节一致。

未经修改的WsgiDAV4.3.5独立服务器、临时共享目录、两个客户端，通过校验临时证书的本机HTTPS和Digest运行。输入为原创配置示例，不是企业文档平台采用或完整同步验收。

report.json包含staleWriteStatus=412、winnerPreserved=true、explicitResolutionWritten=true、filesystemBytesMatch=true和五份文件的SHA-256。

If-Match保护单个资源且依赖服务器正确处理强ETag；没有全目录事务、分布式锁服务、离线合并算法或同步调度器。示例中的内容合并是明确写出的样例决策，不会自动理解业务冲突；生产使用方和更多服务端仍未验证。


## 固定独立服务器

需要Python和 `tools/workflow-requirements.txt` 中的测试依赖。可以安装到项目外独立目录：

```sh
python -m pip install --target /path/to/dav-test-deps -r tools/workflow-requirements.txt
```

POSIX设置 `export WSGIDAV_PYTHONPATH=/path/to/dav-test-deps`；PowerShell设置 `$env:WSGIDAV_PYTHONPATH='C:/path/to/dav-test-deps'`。依赖已在当前Python环境中时可不设该变量。`PYTHON`可指定解释器。

harness要求WsgiDAV4.3.5；本轮Python3.14、cheroot11.1.2、cryptography50.0.1。`wsgidav-reference.py`生成临时共享目录和localhost证书，客户端信任该临时证书并保留主机名校验，使用Digest；独立服务端源码指纹和TLS/库版本见本轮报告。依赖代码没有修改，也不随源码归档分发。

## 冲突不是自动解决

412后必须重新读取并由应用决定如何合并。示例选择保留Alice全部字段、增加Bob备注，再以新ETag写入；这只是明确写出的样例政策，不是通用三路合并。如果另一方又写入，下一次If-Match仍可能失败，不能强行改用无条件PUT。

样例内容在每次成功编辑时变化了字节长度，避免把测试结论依赖于文件系统mtime精度；客户端的普遍正确性仍依赖服务端强ETag兑现其协议语义。当前检查不证明全目录同步、多文件事务或所有后端的ETag质量。

除新主例，本轮重跑13组authoring客户端检查和既有独立WsgiDAV流程，覆盖已有锁、HTTPS和流式行为。WsgiDAV propname行为差异仍按原报告列为限制，未通过修改请求迎合参考实现。
