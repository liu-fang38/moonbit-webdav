# 功能与兼容性边界

## 新增能力

增加 PROPPATCH 请求构建，属性内容 XML 转义。

## 尚未达到上游的部分

已有 Node HTTP(S)/Basic/Bearer 与文件操作；尚缺独立服务器互操作、Digest、锁和流式大文件。已有基础能力参见 README 与生成的 `pkg.generated.mbti`。

## 工程交付范围

独立 Git 仓库、独立构建目录、可执行文档、Wasm-GC/JS 测试、真实编译的浏览器与 CLI、边界输入检查、样例基准、CI 配置均随仓库交付。运行记录见 evidence；配置 CI 不代表远端 CI 已运行。没有公开发布或比赛验收结论。
