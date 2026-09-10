# WebDAV 请求核心

MoonBit 本地候选版 0.3.0。请求构造、路径编码和 DAV multistatus XML 解析。

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

Node.js 宿主已提供 HTTP/HTTPS 与 Basic/Bearer 认证；支持 PROPFIND/COPY/MOVE 请求与有限 DAV multistatus XML；XML 只支持五种预定义实体，拒绝 DTD/注释/CDATA/数字实体，不是通用 XML 引擎。

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

支持真实 HTTP 传输；独立 WebDAV 服务器互操作尚未验证。

[可执行 API 示例](README.mbt.md)会随测试运行；[功能边界](FEATURES.md)和[测试说明](TESTING.md)用于独立审查。网页与 CLI 展示示例入口，新 API 的完整使用见可执行示例。

## 网络客户端（0.3.0）

Node.js 22+，无需安装依赖。路径使用未经百分号编码的服务器绝对路径。

```js
import { WebDavClient } from './tools/client.mjs';
const dav = new WebDavClient('https://dav.example.com', {
  username: 'user', password: process.env.DAV_PASSWORD,
});
await dav.mkdir('/documents/');
await dav.put('/documents/中文.txt', '你好', {
  headers: { 'If-None-Match': '*' },
});
const { resources } = await dav.propfind('/documents/');
const { body } = await dav.get('/documents/中文.txt');
await dav.copy('/documents/中文.txt', '/documents/copy.txt');
await dav.move('/documents/copy.txt', '/documents/moved.txt');
await dav.remove('/documents/moved.txt');
```

支持 GET/HEAD/PUT/DELETE/MKCOL/OPTIONS、PROPFIND、同服务器 COPY/MOVE。
MoonBit 构建 DAV 请求、编码路径并解析 multistatus；Node 负责 HTTP(S) 和原始二进制传输。
默认复制/移动不覆盖；可传 overwrite: true。请求可传 signal、条件请求 headers。
非 2xx 抛出 DavHttpError，response 保留状态、头与响应体；207 内的逐项错误由调用者检查。
不跟随重定向、不自动重试写入。默认总超时 10 秒、响应上限 8 MiB；PROPFIND 另受核心 XML 限制。
HTTPS 使用系统证书验证，可指定 ca；本轮未执行 TLS 专项验证。

`node tools/test-network.mjs` 验证 5 组本地 HTTP 流程：二进制文件生命周期、条件写入、复制移动、
DAV XML、认证失败、重定向不重放、超时/取消、响应上限、截断与参数拒绝。
测试发现并修复了超限响应与 end 事件竞争导致误报成功的问题。
这是真实回环 HTTP 测试，服务器是自编夹具，不等同于独立服务器兼容证明。
仍缺 Digest、锁管理、流式大文件、通用 XML 属性保真和独立服务器互操作。
