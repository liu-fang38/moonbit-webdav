///|
test "raw UTF8 path encoding" {
  assert_eq(
    @webdav.path("/笔记/a b%?.txt"),
    "/%E7%AC%94%E8%AE%B0/a%20b%25%3F.txt",
  )
}

///|
test "propfind depth and XML" {
  let r = @webdav.propfind("/notes", 1, ["displayname", "getetag"])
  assert_eq(r.verb, "PROPFIND")
  assert_eq(r.headers.get("Depth"), Some("1"))
  assert_true(r.body.contains("<D:getetag/>"))
}

///|
test "copy move controls" {
  let r = @webdav.copy_move("MOVE", "/a", "https://example.test/b", false)
  assert_eq(r.headers.get("Overwrite"), Some("F"))
  assert_true(
    try {
      ignore(@webdav.copy_move("MOVE", "/a", "https://x\r\nInjected: 1", true))
      false
    } catch {
      _ => true
    },
  )
}

///|
test "uri independent response parsing" {
  for prefix in ["d", "z"] {
    let s = "<" +
      prefix +
      ":multistatus xmlns:" +
      prefix +
      "=\"DAV:\"><" +
      prefix +
      ":response><" +
      prefix +
      ":href>/a&amp;b</" +
      prefix +
      ":href><" +
      prefix +
      ":status>HTTP/1.1 404 Not Found</" +
      prefix +
      ":status></" +
      prefix +
      ":response></" +
      prefix +
      ":multistatus>"
    let r = @webdav.parse_multistatus(s)
    assert_eq(r[0].href, "/a&b")
    assert_eq(r[0].status, Some(404))
  }
}

///|
test "mixed property status and collection" {
  let r = @webdav.parse_multistatus(
    "<multistatus xmlns=\"DAV:\"><response><href>/dir/</href><propstat><prop><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat><propstat><prop><getetag/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response></multistatus>",
  )
  assert_eq(r[0].properties[0].value, "collection")
  assert_eq(r[0].properties[1].status, 404)
}

///|
test "malformed DTD wrong uri rejected" {
  for
    s in [
      "<!DOCTYPE x><x/>", "<multistatus/>", "<d:multistatus/>", "<d:multistatus xmlns:d=\"DAV:\"></x>",
      "<d:multistatus xmlns:d=\"DAV:\">", "<multistatus xmlns=\"DAV:\"><response><href>x</href></response></multistatus>",
    ] {
    assert_true(
      try {
        ignore(@webdav.parse_multistatus(s))
        false
      } catch {
        _ => true
      },
    )
  }
}

///|
test "property injection escaped" {
  assert_eq(
    @webdav.property_xml("displayname", "<x>&"),
    "<D:displayname>&lt;x&gt;&amp;</D:displayname>",
  )
}

///|
test "escape all occurrences" {
  assert_eq(
    @webdav.property_xml("displayname", "&&<<"),
    "<D:displayname>&amp;&amp;&lt;&lt;</D:displayname>",
  )
}
