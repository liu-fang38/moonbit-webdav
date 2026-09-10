# WebDAV 请求核心

MoonBit 本地候选版 0.2.0。请求构造、路径编码和 DAV multistatus XML 解析。

## 快速试用

已附真实 MoonBit 编译的浏览器引擎。需要 Python 3：

```powershell
./start-review.ps1
```

浏览器打开 http://127.0.0.1:8796/web/ 。也可以从第二批合集审查页直接运行。

## 构建与测试

MoonBit 工具链与 Node.js 安装好后，在此目录运行：

```powershell
./verify.ps1
# 或指定编译器
./verify.ps1 -MoonPath C:/path/to/moon/bin/moon.exe
```

脚本检查源码、在 Wasm-GC 和 JS 跑测试、构建浏览器引擎并运行示例。直接执行命令行示例：`moon run cmd/main`。`pkg.generated.mbti` 是生成的公共 API。

## 已实现范围

请求构造、路径编码和 DAV multistatus XML 解析。示例输入与调用逻辑见 `cmd/main/main.mbt`；网页允许修改输入并执行实际编译代码。

## 当前边界

无 HTTP/TLS 传输和认证；支持 PROPFIND/COPY/MOVE 请求与有限 DAV multistatus XML；XML 只支持五种预定义实体，拒绝 DTD/注释/CDATA/数字实体，不是通用 XML 引擎。

## 来源与许可证

按[公开规格/参考项目](https://www.rfc-editor.org/rfc/rfc4918)重新实现，没有复制上游代码或大规模词库。源码采用 MIT；原始测试输入为本地新编写。

[查重](DUPLICATION.md)只描述本轮检索证据。`localreview` 是本地命名空间，正式发布前需替换为申请人的命名空间。

## 下一步

保留候选：先补边界和上游兼容范围，再决定是否申报。

所有文件仅在本地，未创建远程仓库、上传、发布包或提交比赛。

## 独立仓库工作流

本目录是该项目后续开发的唯一主仓库，旧批次目录及 ZIP 为历史审查快照。没有 Git remote，没有共享构建目录，没有上级 moon.work。

真实 CLI 支持输入参数、文件和标准输入：

```powershell
node tools/cli.mjs --help
node tools/cli.mjs --file sample.txt --json
```

需要安装 MoonBit 后传 `-MoonPath` 或将 moon 加入 PATH；不依赖工作区之外的私有脚本。详见 [TESTING.md](TESTING.md) 和 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 本轮功能升级

增加 PROPPATCH 请求构建，属性内容 XML 转义。

只构建/解析协议；没有 HTTP/TLS/认证传输与真实服务器互操作。

[可执行 API 示例](README.mbt.md)会随测试运行；[功能边界](FEATURES.md)和[测试说明](TESTING.md)用于独立审查。网页与 CLI 展示示例入口，新 API 的完整使用见可执行示例。
