# WebDAV 请求核心

MoonBit 本地候选版 0.1.0。请求构造、路径编码和 DAV multistatus XML 解析。

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

按[公开规格/参考项目](https://www.rfc-editor.org/rfc/rfc4918)重新实现，没有复制上游代码或大规模词库。源码采用 MIT；原始测试输入为本地新编写。Tcl 的独立对照测试由系统 Tcl 8.6.15 计算结果，测试不依赖 Tcl 运行时。

[查重](DUPLICATION.md)只描述本轮检索证据。`localreview` 是本地命名空间，正式发布前需替换为申请人的命名空间。

## 下一步

保留候选：先补边界和上游兼容范围，再决定是否申报。

所有文件仅在本地，未创建远程仓库、上传、发布包或提交比赛。
