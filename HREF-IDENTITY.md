# 0.4.2：WebDAV 资源路径身份

`WebDavClient.stat('/a/b')` 在旧版中会把响应 href `/a%2Fb` 解码为 `/a/b` 并匹配成功。URI 中被转义的斜杠属于一个路径段的数据，不能当成两个路径段的分隔符。`list()` 返回的路径也受同一问题影响，调用者复用该路径会访问另一个资源。

0.4.2 检查响应路径能否经过公开 raw-path 请求接口重新编码为同一 URI。比较只放宽非保留字符的转义与十六进制大小写；不折叠保留字符。无法保持身份的 href 抛出 `DavProtocolError`，不返回看似有效的路径。`propfind()` 仍保留原始 href，供需要处理这种资源的调用方自行决定。

因此，`/a%252Fb` 可以表示原始文件名 `/a%2Fb`；`/a%2Fb` 不能被当前原始路径接口表示。编码的中文、空格、问号、井号、分号、反斜杠仍可往返。服务器若直接返回未编码的保留标点，而本接口只能发出其编码形式，也会明确拒绝，避免假定服务器如何解释它。原有集合尾斜杠匹配行为保留。

协议依据：[RFC 3986 §2.2–2.4](https://www.rfc-editor.org/rfc/rfc3986#section-2.2)。没有把 URL 标准化本身宣称为项目创新。

```sh
node tools/test-href-identity.mjs --evidence evidence/href-check.json
node tools/test-authoring-client.mjs --evidence evidence/authoring-check.json
# 按 WORKFLOW.md 准备固定 WsgiDAV 依赖后：
node tools/test-wsgidav.mjs
```

本地结果见 `evidence/href-identity-20260927/`：12 组路径身份检查、13 组客户端失败语义检查、17 组未经修改的 WsgiDAV 4.3.5 互通检查通过。路径对抗输入来自本项目的受控 HTTP fixture，不能冒充独立服务器证据。WsgiDAV 中原有 Unicode/stat/list、锁、流、HTTPS 和 CLI 互通重跑通过；不代表所有服务器兼容。未修改 MoonBit 核心、浏览器引擎或公共 MoonBit API；远程 CI 未执行。
