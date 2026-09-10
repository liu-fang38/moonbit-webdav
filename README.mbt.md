# 可执行 API 示例

增加 PROPPATCH 请求构建，属性内容 XML 转义。这些例子调用公开 API，并随 `moon test` 执行。

```mbt check
///|
test "PROPPATCH escaping and method" {
  let r = @webdav.proppatch("/a b", [("displayname", "A&B<C")])
  assert_eq(r.verb, "PROPPATCH")
  assert_eq(r.target, "/a%20b")
  assert_true(r.body.contains("A&amp;B&lt;C"))
  assert_true(
    try {
      ignore(@webdav.proppatch("/", []))
      false
    } catch {
      _ => true
    },
  )
}
```

限制：只构建/解析协议；没有 HTTP/TLS/认证传输与真实服务器互操作。
