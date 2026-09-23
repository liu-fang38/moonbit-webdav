# 既有生态关系与本轮范围 · 2026-09-23

已有moon-ical的CalDAV服务端，通用WebDAV客户端和HTTP条件请求也不是新概念。本项目交付范围是MoonBit请求/XML核心及Node文件authoring宿主，区分日历服务与通用文件访问；不把整个DAV生态说成空白，也未声称基于moon-ical扩展。

MoonBit处理路径、请求、XML、属性和锁；Node提供HTTP(S)、Digest和文件/流式I/O。0.4.1主例组合已有公开WebDavClient API，加入两个独立客户端的真实条件写入流程，没有宣称新的并发控制算法。

未经修改的WsgiDAV4.3.5独立服务器、临时共享目录、两个客户端，通过校验临时证书的本机HTTPS和Digest运行。输入为原创配置示例，不是企业文档平台采用或完整同步验收。

If-Match保护单个资源且依赖服务器正确处理强ETag；没有全目录事务、分布式锁服务、离线合并算法或同步调度器。示例中的内容合并是明确写出的样例决策，不会自动理解业务冲突；生产使用方和更多服务端仍未验证。

旧定位和固定来源保留于 [历史检索](docs/before-workflow/DUPLICATION.md)。本轮实施前读取对应原文/API与既有代码；注册表20组检索在总交付台账。公开索引不包括全部报名表、私有仓库或未公开分支，不支持“没有对应库”的断言。

测试服务器一手来源：[WsgiDAV](https://wsgidav.readthedocs.io/en/latest/)。本轮固定4.3.5实跑，不把文档latest版本自动当成实测版本。
