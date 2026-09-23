## 0.4.1

- 用可运行的WebDAV 条件写入与冲突处理客户端主例替换离线片段入口，保存实际输出。
- 重跑相关验证，区分独立服务器、自编故障端、历史记录和未验证范围。
- 申报承诺与宿主分工对齐；核心协议接口未扩大，未声称真实用户。

# Changelog

## 0.4.0 — 2026-09-17

- Added namespace-aware XML properties, attributes, mixed content, numeric entities, CDATA and XML serialization. Enforced XML character, namespace, depth, node and size bounds; DTD and external entities remain unsupported.
- Added rich Multi-Status responses, custom property selection and set/remove updates, LOCK/refresh/UNLOCK and tagged/untagged positive token conditions.
- Added Digest MD5/SHA-256/SHA-512-256, session variants, nonce counts, stale retries and optional server response proof checks. Added streamed download/upload, metadata helpers and a real network CLI.
- Added independent WsgiDAV HTTP/TLS integration, Python ElementTree/hashlib vectors and failure fixtures. Older self-authored HTTP fixtures remain distinct from independent evidence.
- Preserved the legacy flattened Resource view. New rich Node responses expose nullable scalar status/location/description; lock results expose scalar token/root/timeout.
- Remaining compatibility, XML and operational limits are tracked in FEATURES.md. This is a local candidate, not a full WebDAV compliance or upstream-parity claim.
