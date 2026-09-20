# WebDAV 客户端与协议核心

> 2026-09-21 本地构建修复：命令包 import 已同步到当前 moon.mod 模块名；moon info/check、JS 构建、MoonBit 示例和 Node 引擎示例通过。算法未改，本轮未重跑历史全部行为/性能套件。当前提交指纹见 evidence/module-import-fix.json。

本地候选版 **0.4.0**。MoonBit 负责路径、请求、XML、属性和锁信息；Node.js 22+ 提供 HTTP(S)、认证、流式传输及命令行入口。已与未经修改的 WsgiDAV 4.3.5 / Cheroot 11.1.2 完成真实回环互操作和 TLS 验证，具体范围见 [TESTING.md](TESTING.md)。

## 使用客户端

不需要安装 npm 依赖，已附 MoonBit 编译的 `web/engine.mjs`。origin 只接受服务器根地址；方法参数是未经百分号编码的绝对路径。

```js
import { WebDavClient } from './tools/client.mjs';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

const dav = new WebDavClient('https://dav.example.com', {
  username: 'user', password: process.env.DAV_PASSWORD, auth: 'digest',
});
await dav.mkdirAll('/documents/2026/');
await dav.put('/documents/2026/中文.txt', '你好', {
  headers: { 'If-None-Match': '*' },
});
const info = await dav.stat('/documents/2026/中文.txt'); // size: BigInt | undefined
const entries = await dav.list('/documents/2026/');
await dav.proppatch('/documents/2026/中文.txt', {
  set: [
    { uri: 'urn:example', name: 'color', value: 'blue & green' },
    { xml: '<x:note xmlns:x="urn:example" xml:lang="zh">前<x:b>中</x:b>后</x:note>' },
  ],
  remove: [{ uri: 'urn:example', name: 'old' }],
});
const properties = await dav.propfind('/documents/2026/中文.txt', {
  depth: 0, properties: [{ uri: 'urn:example', name: 'note' }],
}); // responses preserves XML structure and each property's status

const lock = await dav.lock('/documents/2026/中文.txt', { depth: 0, owner: 'my app' });
try {
  await dav.put('/documents/2026/中文.txt', '更新', { lockTokens: [lock.token] });
  await dav.refreshLock('/documents/2026/中文.txt', lock.token);
} finally {
  await dav.unlock('/documents/2026/中文.txt', lock.token);
}

const local = './large.bin';
await dav.putStream('/documents/large.bin', () => createReadStream(local), {
  length: (await stat(local)).size,
});
const download = await dav.getStream('/documents/large.bin');
await pipeline(download.body, createWriteStream('./download.bin'));
await download.completed;
```

还支持 GET/HEAD/PUT/DELETE/MKCOL/OPTIONS、COPY/MOVE、`propfind({namesOnly:true})`。复制/移动默认不覆盖；可传 `overwrite:true`。下载可通过 `headers:{Range:'bytes=100-999'}` 获取范围响应。带源、目标锁的复制/移动可传 `lockConditions:[{path:'/source',tokens:[token1]},{path:'/destination',tokens:[token2]}]`；不能同时传 `lockTokens`。

## 认证、流与错误

`auth` 可选 `none`、`basic`、`bearer`、`digest`、`auto`。为兼容 0.3，API 提供用户名时默认 Basic；网络 CLI 默认 Digest。建议显式指定并使用 HTTPS。Digest 支持 MD5/SHA-256/SHA-512-256 及各自 sess 变体；支持 auth、缓冲体 auth-int、无 qop、UTF-8/userhash、nonce 计数和可选 rspauth 校验。auto 优先可用 Digest，已用 Digest 后不降级 Basic。普通网络故障不自动重放；认证挑战至多总计三次请求，共用总超时。

默认总超时 10 秒、缓冲响应上限 8 MiB，可配置 `timeout`、`maxResponseBytes`；HTTPS 验证证书及主机名，可提供 `ca`。不跟随重定向。请求可传 `signal`，自定义头不能覆盖 Host/Authorization/Content-Length 等受管字段。

流式上传要求准确的非负安全整数 `length`，检查过短/过长并遵守传输背压。Digest/auto 上传必须传可重复调用、每次返回新 Readable 的工厂；工厂负责提供相同内容。流式 auth-int、未知长度/chunked 上传暂不支持。`getStream` 的 `completed` 在整个响应消费完成后兑现；应消费或销毁 `body` 并等待完成。流不受缓冲响应 8 MiB 上限限制，仍受超时/取消控制。

- 非 2xx：`DavHttpError`，`response` 保存状态、头和有界响应体。
- 非法 XML、错误 Multi-Status 状态或锁令牌不匹配：`DavProtocolError`。
- PROPPATCH、COPY/MOVE、DELETE 的 207 中存在失败项：`DavMultiStatusError`，保留逐项结果。
- PROPFIND 返回 `resources`（旧的扁平视图）与 `responses`（XML 属性/混合内容的丰富视图）；调用者检查各属性状态。

MoonBit 的旧 `Resource` 和既有 `resources` JSON 编码保持兼容；旧 JSON 的可选值沿用编译器编码。新 `responses` 与锁对象的可选字段采用普通值或 `null`。

## 网络命令行

```powershell
$env:DAV_ORIGIN='https://dav.example.com'
$env:DAV_USERNAME='user'
$env:DAV_PASSWORD='your-password'
node tools/dav.mjs --help
node tools/dav.mjs mkdir /documents/2026/
node tools/dav.mjs put /documents/large.bin C:/files/large.bin
node tools/dav.mjs stat /documents/large.bin
node tools/dav.mjs lock /documents/large.bin
```

`get PATH` 将二进制写到 stdout；其余命令输出 JSON，size 是十进制字符串。CLI 还支持 ls/copy/move/rm/props/refresh/unlock；失败退出码为 1。`DAV_LOCK_TOKEN` 为写操作附加一个令牌；其余认证、CA 和超时环境变量见 `--help`。原 `tools/cli.mjs` 仍是 XML 解析入口。

## 构建、验证与本地审查

```powershell
./verify.ps1 -MoonPath C:/path/to/moon/bin/moon.exe
./start-review.ps1
```

浏览器审查页为 `http://127.0.0.1:8796/web/`，运行实际编译的 MoonBit XML 核心。验证脚本运行 Wasm-GC/JS、独立静态向量、故障夹具、网页核心、CLI、边界输入与示例基准。[可执行文档](README.mbt.md)随 MoonBit 测试运行；独立服务器单独复现，避免默认检查隐式安装依赖。

XML 是有界 UTF-8/ASCII 声明的 XML 1.0 子集：保留展开名称、属性及混合文本，支持数字引用与 CDATA；注释/PI 接受但不保留，序列化不保留原前缀。DTD/外部实体、其它编码和完整 XML 符合性不在范围内。更多认证、代理、重定向、未知长度传输和多服务器/生产负载验证仍见 [FEATURES.md](FEATURES.md)。当前不能判定与成熟参考库完全追平。

按 [RFC 4918](https://www.rfc-editor.org/rfc/rfc4918) 和 [RFC 7616](https://www.rfc-editor.org/rfc/rfc7616) 独立实现，源码 MIT。参考功能范围为 [gowebdav](https://github.com/studio-b12/gowebdav)。未复制上游实现；Python 参考依赖不包含在仓库。`localreview` 是本地命名空间，发布前需替换。仓库独立构建、无 Git remote；未上传、发布或提交比赛。旧 ZIP/bundle 是历史快照。
