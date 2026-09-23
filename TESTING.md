# 当前验证范围 · 0.4.1 / 2026-09-23

JS/Wasm-GC各23项核心测试、13组authoring/Digest/stream检查、既有独立WsgiDAV对照、引擎与CLI通过；新主例保存初始、被拒绝、冲突后及显式解决后的文件和哈希。旧对照中的WsgiDAV propname限制仍保留，不冒充所有WebDAV扩展兼容。

本轮 [LOCAL-CHECKS](evidence/workflow-20260923/LOCAL-CHECKS.json)列出工具版本、命令、退出码及关键源码SHA-256；相同目录的reports保存此次实际执行的结构化报告。既有evidence原位置保留历史内容，不将历史统计当作本轮全量验证。

主任务复现与参考依赖见 [WORKFLOW](WORKFLOW.md)。核心仍可执行：

```sh
moon fmt
moon info
moon check --target js
moon test --target js
moon test --target wasm-gc
moon build --target js
node -e "require('node:fs').copyFileSync('_build/js/debug/build/cmd/web/web.js','web/engine.mjs')"
node examples/run-conflict-workflow.mjs
```

未经修改的WsgiDAV4.3.5独立服务器、临时共享目录、两个客户端，通过校验临时证书的本机HTTPS和Digest运行。输入为原创配置示例，不是企业文档平台采用或完整同步验收。

If-Match保护单个资源且依赖服务器正确处理强ETag；没有全目录事务、分布式锁服务、离线合并算法或同步调度器。示例中的内容合并是明确写出的样例决策，不会自动理解业务冲突；生产使用方和更多服务端仍未验证。

专项脚本按LOCAL-CHECKS所列运行。未重新执行全部历史对照、全覆盖率/基准或远程CI；此前版本的完整运行说明见 [历史TESTING](docs/before-workflow/TESTING.md)。源码ZIP需保留产物字节，邮件.eml不参与换行转换；交付另核对Git blob、引擎及新解包入口。
