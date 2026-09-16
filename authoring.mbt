///|
fn empty_element(uri : String, name : String) -> XmlElement {
  { uri, name, attributes: [], content: [], }
}

///|
pub fn propfind_names(
  raw_path : String,
  depth : Int,
  properties : Array[(String, String)],
  names_only? : Bool = false,
) -> Request raise DavError {
  if depth != 0 && depth != 1 {
    raise Invalid("PROPFIND depth must be 0 or 1")
  }
  if properties.length() > 256 || (names_only && !properties.is_empty()) {
    raise Invalid("invalid property selection")
  }
  let body = StringBuilder()
  let mut size = 0
  body.write_string(
    "<?xml version=\"1.0\" encoding=\"utf-8\"?><D:propfind xmlns:D=\"DAV:\">",
  )
  if names_only {
    body.write_string("<D:propname/>")
  } else if properties.is_empty() {
    body.write_string("<D:allprop/>")
  } else {
    body.write_string("<D:prop>")
    for (uri, name) in properties {
      let xml = empty_element(uri, name).to_xml()
      size += xml.length()
      if size > 1048000 {
        raise Invalid("property selection size limit")
      }
      body.write_string(xml)
    }
    body.write_string("</D:prop>")
  }
  body.write_string("</D:propfind>")
  {
    verb: "PROPFIND",
    target: path(raw_path),
    headers: {
      "Depth": depth.to_string(),
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: body.to_string(),
  }
}

///|
pub fn set_properties(
  raw_path : String,
  set : Array[XmlElement],
  remove : Array[(String, String)],
) -> Request raise DavError {
  if set.length() + remove.length() < 1 || set.length() + remove.length() > 256 {
    raise Invalid("property count 1..256")
  }
  let body = StringBuilder()
  body.write_string(
    "<?xml version=\"1.0\" encoding=\"utf-8\"?><D:propertyupdate xmlns:D=\"DAV:\">",
  )
  let mut size = 0
  if !set.is_empty() {
    body.write_string("<D:set><D:prop>")
    for item in set {
      let xml = item.to_xml()
      size += xml.length()
      if size > 1048000 {
        raise Invalid("property update size limit")
      }
      body.write_string(xml)
    }
    body.write_string("</D:prop></D:set>")
  }
  if !remove.is_empty() {
    body.write_string("<D:remove><D:prop>")
    for (uri, name) in remove {
      let xml = empty_element(uri, name).to_xml()
      size += xml.length()
      if size > 1048000 {
        raise Invalid("property update size limit")
      }
      body.write_string(xml)
    }
    body.write_string("</D:prop></D:remove>")
  }
  body.write_string("</D:propertyupdate>")
  {
    verb: "PROPPATCH",
    target: path(raw_path),
    headers: { "Content-Type": "application/xml; charset=utf-8" },
    body: body.to_string(),
  }
}

///|
fn lock_timeout(value : String) -> Unit raise DavError {
  if value == "Infinite" {
    return
  }
  if !value.has_prefix("Second-") {
    raise Invalid("lock timeout must be Infinite or Second-N")
  }
  let count = value[7:].to_owned()
  if count.is_empty() ||
    count.length() > 10 ||
    !count.iter().all(c => c >= '0' && c <= '9') {
    raise Invalid("invalid lock timeout")
  }
  ignore(
    @strconv.parse_uint(count) catch {
      _ => raise Invalid("lock timeout uint32 overflow")
    },
  )
}

///|
fn coded_url(value : String) -> Unit raise DavError {
  if value.is_empty() ||
    value.length() > 8192 ||
    !value
    .iter()
    .all(c => {
      c > ' ' && c < '\u007f' && c != '<' && c != '>' && c != '"' && c != '\\'
    }) {
    raise Invalid("invalid absolute coded URL")
  }
  let cs = value.to_array()
  if !((cs[0] >= 'a' && cs[0] <= 'z') || (cs[0] >= 'A' && cs[0] <= 'Z')) {
    raise Invalid("URI scheme required")
  }
  let mut colon = 0
  while colon < cs.length() && cs[colon] != ':' {
    let c = cs[colon]
    if !((c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c == '+' ||
      c == '-' ||
      c == '.') {
      raise Invalid("invalid URI scheme")
    }
    colon += 1
  }
  if colon == cs.length() || colon + 1 == cs.length() {
    raise Invalid("absolute URI required")
  }
}

///|
pub fn if_tokens(tokens : Array[String]) -> String raise DavError {
  if tokens.is_empty() || tokens.length() > 64 {
    raise Invalid("lock token count 1..64")
  }
  let list = []
  for token in tokens {
    coded_url(token)
    list.push("<" + token + ">")
  }
  let value = "(" + list.join(" ") + ")"
  if value.length() > 65536 {
    raise Invalid("If header size limit")
  }
  value
}

///|
/// Tagged lists: tokens within one resource list are ANDed. Resource lists are separate conditions.
pub fn if_resources(
  conditions : Array[(String, Array[String])],
) -> String raise DavError {
  if conditions.is_empty() || conditions.length() > 64 {
    raise Invalid("condition count 1..64")
  }
  let out = []
  let used : Map[String, Bool] = Map([])
  for (uri, tokens) in conditions {
    coded_url(uri)
    if used.contains(uri) {
      raise Invalid("duplicate tagged resource")
    }
    used[uri] = true
    out.push("<" + uri + "> " + if_tokens(tokens))
  }
  let value = out.join(" ")
  if value.length() > 65536 {
    raise Invalid("If header size limit")
  }
  value
}

///|
pub fn lock_request(
  raw_path : String,
  owner : String,
  depth? : String = "infinity",
  timeout? : String = "Second-3600",
  shared? : Bool = false,
) -> Request raise DavError {
  if depth != "0" && depth != "infinity" {
    raise Invalid("LOCK depth must be 0 or infinity")
  }
  lock_timeout(timeout)
  xml_text(owner)
  if owner.length() > 8192 {
    raise Invalid("lock owner size limit")
  }
  let scope = if shared { "shared" } else { "exclusive" }
  {
    verb: "LOCK",
    target: path(raw_path),
    headers: {
      "Depth": depth,
      "Timeout": timeout,
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: "<?xml version=\"1.0\" encoding=\"utf-8\"?><D:lockinfo xmlns:D=\"DAV:\"><D:lockscope><D:" +
    scope +
    "/></D:lockscope><D:locktype><D:write/></D:locktype><D:owner>" +
    escape(owner) +
    "</D:owner></D:lockinfo>",
  }
}

///|
pub fn refresh_lock(
  raw_path : String,
  token : String,
  timeout? : String = "Second-3600",
) -> Request raise DavError {
  lock_timeout(timeout)
  {
    verb: "LOCK",
    target: path(raw_path),
    headers: { "If": if_tokens([token]), "Timeout": timeout },
    body: "",
  }
}

///|
pub fn unlock_request(
  raw_path : String,
  token : String,
) -> Request raise DavError {
  coded_url(token)
  {
    verb: "UNLOCK",
    target: path(raw_path),
    headers: { "Lock-Token": "<" + token + ">" },
    body: "",
  }
}

///|
pub(all) struct LockInfo {
  token : String?
  root : String?
  owner : XmlElement?
  scope : String
  depth : String
  timeout : String?
} derive(Debug, Eq, ToJson)

///|
fn lock_info(node : XmlElement) -> LockInfo raise DavError {
  let kinds = element_children(one(node, "locktype"))
  if kinds.length() != 1 || kinds[0].uri != "DAV:" || kinds[0].name != "write" {
    raise Invalid("unsupported DAV lock type")
  }
  let scopes = element_children(one(node, "lockscope"))
  if scopes.length() != 1 ||
    scopes[0].uri != "DAV:" ||
    (scopes[0].name != "exclusive" && scopes[0].name != "shared") {
    raise Invalid("invalid DAV lock scope")
  }
  let depth = one(node, "depth").text_content().trim().to_owned()
  if depth != "0" && depth != "infinity" {
    raise Invalid("invalid lock discovery depth")
  }
  let timeout = optional_text(node, "timeout")
  if timeout is Some(value) {
    lock_timeout(value)
  }
  let token = match children(node, "locktoken") {
    [] => None
    [t] => {
      let value = one(t, "href").text_content().trim().to_owned()
      coded_url(value)
      Some(value)
    }
    _ => raise Invalid("duplicate lock token")
  }
  let root = match children(node, "lockroot") {
    [] => None
    [r] => Some(one(r, "href").text_content().trim().to_owned())
    _ => raise Invalid("duplicate lock root")
  }
  let owner = match children(node, "owner") {
    [] => None
    [o] => Some(o)
    _ => raise Invalid("duplicate lock owner")
  }
  { token, root, owner, scope: scopes[0].name, depth, timeout, }
}

///|
pub fn parse_locks(source : String) -> Array[LockInfo] raise DavError {
  let root = parse_xml(source)
  let discovery = if root.uri == "DAV:" && root.name == "prop" {
    one(root, "lockdiscovery")
  } else if root.uri == "DAV:" && root.name == "lockdiscovery" {
    root
  } else {
    raise Invalid("lockdiscovery response required")
  }
  children(discovery, "activelock").map(lock_info)
}
