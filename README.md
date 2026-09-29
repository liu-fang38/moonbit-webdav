# MoonBit WebDAV 请求与响应语义库（含 Node 条件更新宿主）

**本项目仓库：[https://github.com/liu-fang38/moonbit-webdav](https://github.com/liu-fang38/moonbit-webdav)**

模块 `liu-fang38/webdav`，本地 **0.4.2**，MIT。本轮为预防性整改；审核结果未知，没有把本地修订写成已通过。Mooncakes 已出现 0.4.2 版号；本次文档和表单状态仍须核对。

## 具体任务

两个客户端编辑同一个远程配置文件时，用强ETag的If-Match条件拒绝过期写入，保留已写入版本；调用方明确解决冲突后，再针对当前ETag提交。

MoonBit处理路径、请求、XML、属性和锁；Node提供HTTP(S)、Digest和文件/流式I/O。0.4.1主例组合已有公开WebDavClient API，加入两个独立客户端的真实条件写入流程，没有宣称新的并发控制算法。

## 可运行主例

需Python及固定WsgiDAV/cheroot/cryptography测试依赖，隔离安装和WSGIDAV_PYTHONPATH见下文。

```sh
moon build --target js
node -e "require('node:fs').copyFileSync('_build/js/debug/build/cmd/web/web.js','web/engine.mjs')"
node examples/run-conflict-workflow.mjs
```

两个客户端读取相同初始文件/ETag。Alice写入新内容，Bob用旧ETag提交不同内容得到412；再次读取证明Alice内容未被覆盖。样例明确保留Alice内容并补Bob的备注，再用当前ETag写入；GET结果与独立服务端文件系统字节一致。

未经修改的WsgiDAV4.3.5独立服务器、临时共享目录、两个客户端，通过校验临时证书的本机HTTPS和Digest运行。输入为原创配置示例，不是企业文档平台采用或完整同步验收。

运行成功会打印新的系统临时目录。report.json包含staleWriteStatus=412、winnerPreserved=true、explicitResolutionWritten=true、filesystemBytesMatch=true和五份文件的SHA-256。 输出位置每次不同，不要求运行标识完全确定。[保存的本轮产物](evidence/workflow-20260923/example-output/report.json)与[全部本轮检查](evidence/workflow-20260923/LOCAL-CHECKS.json)可直接核对。

## 验证与交付边界

JS/Wasm-GC各23项核心测试、13组authoring/Digest/stream检查、既有独立WsgiDAV对照、引擎与CLI通过；新主例保存初始、被拒绝、冲突后及显式解决后的文件和哈希。旧对照中的WsgiDAV propname限制仍保留，不冒充所有WebDAV扩展兼容。

If-Match保护单个资源且依赖服务器正确处理强ETag；没有全目录事务、分布式锁服务、离线合并算法或同步调度器。示例中的内容合并是明确写出的样例决策，不会自动理解业务冲突；生产使用方和更多服务端仍未验证。

已有核心API见 [pkg.generated.mbti](pkg.generated.mbti)；完整宿主接口仍见 [先前使用说明](README-BEFORE-VALUE-REWORK.md)。本轮主例/依赖/失败语义见 [WORKFLOW](WORKFLOW.md)。新主例已接入CI配置，但本任务没有运行远程CI。

## 与已有生态关系

已有moon-ical的CalDAV服务端，通用WebDAV客户端和HTTP条件请求也不是新概念。本项目交付范围是MoonBit请求/XML核心及Node文件authoring宿主，区分日历服务与通用文件访问；不把整个DAV生态说成空白，也未声称基于moon-ical扩展。

[DUPLICATION](DUPLICATION.md)保留固定来源及检索范围。没有查到相同关键词不构成生态空白证明，也没有编造使用方或上游认可。当前 [申报草稿](PROPOSAL.md)与 [复核说明](REVIEW-RESPONSE.md)对齐实际流程；[此前材料](docs/before-workflow/README.md)仅为历史。

CI固定的编译器与标准库版本见 [TOOLCHAIN.md](TOOLCHAIN.md)；升级时需同时核对生成产物。

2026-09-27：[重新审视](REASSESSMENT.md)将主贡献明确为DAV语义核心；源码和原验证指纹相符，保留0.4.1，无额外运行时改动。仅一个独立服务器的互通证据，不扩张成熟度。

0.4.2 修复 Node 宿主 `stat/list` 对编码路径分隔符的错误识别；12 组身份检查、13 组客户端检查及17组独立 WsgiDAV 互通检查通过。协议范围、拒绝行为及本轮证据见 [HREF-IDENTITY](HREF-IDENTITY.md)。

## 本地验收与公开交付（2026-09-28）

核心实现使用 MoonBit；[固定编译器](.moonbit-version)为 `moonc 0.10.14+7d59c7ec9`。先按本文安装宿主依赖、运行 `moon update`，再从仓库根目录执行以下与 [CI](.github/workflows/ci.yml) 对齐的检查；可运行任务和适用边界见本文前面的示例与说明。

```sh
moon check --deny-warn
moon test --target wasm-gc --deny-warn
moon test --target js --deny-warn
moon build --target js --deny-warn
moon package
```

跨平台复核（2026-09-28，本地 Ubuntu-D 26.04 WSL2）：从当时的源码归档全新解包，固定 `moonc 0.10.14+7d59c7ec9` 下通过 `moon update`、`moon fmt --check`、`moon info`、严格检查、JS/Wasm-GC 测试及 JS release 构建；Node 24.21.0 跑通本仓一条宿主入口。本次补记仅修改文档，代码与 CI 未变；复核日志在本地交接包中，公开提交后的 GitHub Actions 仍须单独核对。

专项复核：WsgiDAV 4.3.5 的环回 HTTPS/Digest 服务返回过期写入 412，原赢家字节保留；显式解决后的内容与服务器文件逐字节一致。

本地核验：JS/Wasm-GC 测试、150 个 XML 向量和冲突更新工作流通过。 `moon package` 已完成离线打包预检，它不等于已发布到 Mooncakes。


**公开状态（2026-09-29 核对）**：GitHub [公开仓库](https://github.com/liu-fang38/moonbit-webdav)、[Mooncakes 0.4.2](https://mooncakes.io/docs/liu-fang38/webdav@0.4.2) 已可访问；[CI 成功记录](https://github.com/liu-fang38/moonbit-webdav/actions/runs/36436287134) 对应 `573f982bb621`。本次材料更新尚未推送；该远端 CI 对应所列公开提交。报名表一致性及赛事审核结果尚未核实。
