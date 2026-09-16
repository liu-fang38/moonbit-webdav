# 可执行 API 示例

这些例子调用公开 MoonBit API，并随 `moon test` 执行。HTTP(S) 传输由 Node 宿主提供，使用方式见 README。

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

```mbt check
///|
test "mixed XML properties and lock request" {
  let value = @webdav.parse_xml(
    "<x:note xmlns:x='urn:example' xml:lang='zh'>前<x:b>中</x:b>后</x:note>",
  )
  assert_eq(value.text_content(), "前中后")
  assert_eq(@webdav.parse_xml(value.to_xml()), value)
  let patch = @webdav.set_properties("/文档", [value], [
    ("urn:example", "old"),
  ])
  assert_eq(patch.verb, "PROPPATCH")
  assert_true(patch.body.contains("D:remove"))
  let lock = @webdav.lock_request("/文档", "owner", depth="0")
  assert_eq(lock.verb, "LOCK")
  let refresh = @webdav.refresh_lock("/文档", "urn:uuid:test")
  assert_eq(refresh.headers.get("If"), Some("(<urn:uuid:test>)"))
}
```

XML 保留展开名称、属性和混合内容；不保留原前缀、注释或 PI。拒绝 DTD/外部实体。网络与独立服务器复现见 TESTING.md。
