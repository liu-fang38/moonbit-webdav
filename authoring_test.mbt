///|
test "XML preserves expanded names attributes mixed content numeric references CDATA and text order" {
  let e = @webdav.parse_xml(
    "<?xml version='1.0'?><!--before--><a:r xmlns:a='urn:x' xmlns='urn:y' xml:lang='zh' b='&#9;'>before&#x1F600;<b><![CDATA[<&]]></b>after<!--ignored--><?work done?></a:r>",
  )
  assert_eq(e.uri, "urn:x")
  assert_eq(e.attributes[1].value, "\t")
  assert_eq(e.text_content(), "before😀<&after")
  assert_eq(@webdav.parse_xml(e.to_xml()), e)
}

///|
test "XML namespace shadowing and unqualified attributes" {
  let e = @webdav.parse_xml(
    "<r xmlns='u' xmlns:p='v'><p:x a='1' p:b='2' xmlns:p='w'/><z xmlns=''/></r>",
  )
  guard e.content is [@webdav.Element(child), @webdav.Element(empty)] else {
    fail("children")
  }
  assert_eq(child.uri, "w")
  assert_eq(child.attributes[0].uri, "")
  assert_eq(child.attributes[1].uri, "w")
  assert_eq(empty.uri, "")
}

///|
test "XML rejects malformed namespaces entities names declarations and duplicate attributes" {
  for
    source in [
      "<!DOCTYPE r><r/>", "<r>&x;</r>", "<r>&#0;</r>", "<r>&#xD800;</r>", "<r>&#x110000;</r>",
      "<r>&#;</r>", "<1r/>", "<r:a:b/>", "<r a='1'a='2'/>", "<r a='1' a='2'/>", "<r xmlns:p='u' xmlns:q='u' p:a='1' q:a='2'/>",
      "<r p:a='1'/>", "<r xmlns:xml='wrong'/>", "<r xmlns:p='http://www.w3.org/XML/1998/namespace'/>",
      "<r xmlns:xmlns='x'/>", "<r xmlns:p=''/>", "<r a='<'/>", "<r>]]></r>", "<r><!--a--b--></r>",
      "<r/><r/>", "<?xml version='1.1'?><r/>", " <?xml version='1.0'?><r/>", "<?xml version='1.0' version='1.0'?><r/>",
      "<r>\u0001</r>",
    ] {
    assert_true(
      try {
        ignore(@webdav.parse_xml(source))
        false
      } catch {
        _ => true
      },
    )
  }
}

///|
test "XML newline normalization preserves explicit references in attributes" {
  let e = @webdav.parse_xml("<r a='x\r\ny\tz&#13;&#10;' >a\r\nb\rc</r>")
  assert_eq(e.attributes[0].value, "x y z\r\n")
  assert_eq(e.text_content(), "a\nb\nc")
  assert_eq(@webdav.parse_xml(e.to_xml()), e)
}

///|
test "rich multistatus preserves per-property failures nested values and redirects" {
  let r = @webdav.parse_responses(
    "<D:multistatus xmlns:D='DAV:'><D:response><D:href>/a</D:href><D:propstat><D:prop><x:p xmlns:x='urn:custom'>before<x:b k='v'/>after</x:p></D:prop><D:status>HTTP/1.1 403 Forbidden</D:status><D:error><D:cannot-modify-protected-property/></D:error></D:propstat><D:responsedescription>no</D:responsedescription></D:response><D:response><D:href>/b</D:href><D:href>/c</D:href><D:status>HTTP/1.1 301 Moved</D:status><D:location><D:href>/new</D:href></D:location></D:response></D:multistatus>",
  )
  assert_eq(r[0].properties[0].status, 403)
  assert_eq(r[0].properties[0].element.text_content(), "beforeafter")
  assert_eq(r[0].errors[0].name, "cannot-modify-protected-property")
  assert_eq(r[1].hrefs, ["/b", "/c"])
  assert_eq(r[1].location, Some("/new"))
}

///|
test "empty propstat is valid and non-DAV resourcetype is not a collection shortcut" {
  let r = @webdav.parse_multistatus(
    "<multistatus xmlns='DAV:'><response><href>/a</href><propstat><prop/><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>",
  )
  assert_eq(r[0].properties, [])
  let custom = @webdav.parse_multistatus(
    "<multistatus xmlns='DAV:'><response><href>/a</href><propstat><prop><x:resourcetype xmlns:x='u'><collection/></x:resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>",
  )
  assert_eq(custom[0].properties[0].value, "")
}

///|
test "namespace aware property selection and atomic set remove requests" {
  let find = @webdav.propfind_names("/a b", 0, [("urn:x", "color")])
  assert_eq(find.target, "/a%20b")
  assert_true(find.body.contains("urn:x"))
  let patch = @webdav.set_properties(
    "/a",
    [@webdav.parse_xml("<x:p xmlns:x='urn:x'>mixed<b/>text</x:p>")],
    [("urn:x", "old")],
  )
  assert_eq(patch.verb, "PROPPATCH")
  assert_true(patch.body.contains("D:remove"))
  ignore(@webdav.parse_xml(patch.body))
}

///|
test "LOCK refresh and UNLOCK put tokens in correct headers" {
  let token = "urn:uuid:123"
  let lock = @webdav.lock_request(
    "/中文",
    "A<&",
    depth="0",
    timeout="Second-90",
  )
  assert_eq(lock.headers.get("Depth"), Some("0"))
  assert_true(lock.body.contains("A&lt;&amp;"))
  let refresh = @webdav.refresh_lock("/a", token)
  assert_eq(refresh.body, "")
  assert_eq(refresh.headers.get("If"), Some("(<urn:uuid:123>)"))
  assert_eq(refresh.headers.get("Lock-Token"), None)
  assert_eq(
    @webdav.unlock_request("/a", token).headers.get("Lock-Token"),
    Some("<urn:uuid:123>"),
  )
}

///|
test "tagged If lists prevent header injection and ambiguous duplicate resources" {
  assert_eq(
    @webdav.if_resources([
      ("https://example.test/a", ["urn:uuid:a", "urn:uuid:b"]),
    ]),
    "<https://example.test/a> (<urn:uuid:a> <urn:uuid:b>)",
  )
  for token in ["urn:x>\r\nInjected: yes", "<urn:x>", "relative", "urn: space"] {
    assert_true(
      try {
        ignore(@webdav.if_tokens([token]))
        false
      } catch {
        _ => true
      },
    )
  }
  assert_true(
    try {
      ignore(
        @webdav.if_resources([
          ("https://x/a", ["urn:a"]),
          ("https://x/a", ["urn:b"]),
        ]),
      )
      false
    } catch {
      _ => true
    },
  )
}

///|
test "lock discovery extracts owner root token and timeout" {
  let locks = @webdav.parse_locks(
    "<D:prop xmlns:D='DAV:'><D:lockdiscovery><D:activelock><D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:depth>infinity</D:depth><D:owner><D:href>mailto:test@example.test</D:href></D:owner><D:timeout>Second-90</D:timeout><D:locktoken><D:href>urn:uuid:a</D:href></D:locktoken><D:lockroot><D:href>/folder/</D:href></D:lockroot></D:activelock></D:lockdiscovery></D:prop>",
  )
  assert_eq(locks[0].token, Some("urn:uuid:a"))
  assert_eq(locks[0].root, Some("/folder/"))
  assert_eq(locks[0].owner.unwrap().text_content(), "mailto:test@example.test")
}

///|
test "XML declaration references and input output complexity limits reject" {
  for
    source in [
      "<?xml version='&#49;.0'?><r/>",
      "<r>".repeat(34) + "</r>".repeat(34),
      "<r>" + "<a/>".repeat(10001) + "</r>",
      "<r>" + "x".repeat(1048576) + "</r>",
    ] {
    assert_true(
      try {
        ignore(@webdav.parse_xml(source))
        false
      } catch {
        _ => true
      },
    )
  }
  let root : @webdav.XmlElement = {
    uri: "",
    name: "r",
    attributes: [],
    content: [@webdav.Text("x".repeat(1048577))],
  }
  assert_true(
    try {
      ignore(root.to_xml())
      false
    } catch {
      _ => true
    },
  )
}

///|
test "invalid multistatus structures and response status values reject" {
  for
    inner in [
      "<href>/a</href>", "<href>/a</href><status>HTTP/1.1 700 Bad</status>", "<href>/a</href><status>HTTP/1.1 200 OK</status><propstat><prop/><status>HTTP/1.1 200 OK</status></propstat>",
      "<href>/a</href><href>/b</href><propstat><prop/><status>HTTP/1.1 200 OK</status></propstat>",
    ] {
    assert_true(
      try {
        ignore(
          @webdav.parse_responses(
            "<multistatus xmlns='DAV:'><response>" +
            inner +
            "</response></multistatus>",
          ),
        )
        false
      } catch {
        _ => true
      },
    )
  }
}

///|
test "lock timeout supports RFC uint32 range including zero and validates limits" {
  for timeout in ["Infinite", "Second-0", "Second-4294967295"] {
    ignore(@webdav.lock_request("/a", "", timeout~))
  }
  for timeout in ["Second--1", "Second-4294967296", "Second-", "second-10"] {
    assert_true(
      try {
        ignore(@webdav.lock_request("/a", "", timeout~))
        false
      } catch {
        _ => true
      },
    )
  }
  assert_true(
    try {
      ignore(@webdav.if_tokens(Array::make(64, "urn:" + "x".repeat(2000))))
      false
    } catch {
      _ => true
    },
  )
}
