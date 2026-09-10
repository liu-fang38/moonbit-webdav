///|
pub suberror DavError {
  Invalid(String)
} derive(Debug)

///|
pub(all) struct Request {
  verb : String
  target : String
  headers : Map[String, String]
  body : String
} derive(Debug, Eq, ToJson)

///|
pub(all) struct Property {
  uri : String
  name : String
  value : String
  status : Int
} derive(Debug, Eq, ToJson)

///|
pub(all) struct Resource {
  href : String
  status : Int?
  properties : Array[Property]
} derive(Debug, Eq, ToJson)

///|
fn escape(s : String) -> String {
  s
  .replace_all(old="&", new="&amp;")
  .replace_all(old="<", new="&lt;")
  .replace_all(old=">", new="&gt;")
  .replace_all(old="\"", new="&quot;")
  .replace_all(old="'", new="&apos;")
}

///|
pub fn path(raw : String) -> String raise DavError {
  if !raw.has_prefix("/") || raw.length() > 8192 {
    raise Invalid("absolute raw path required")
  }
  let hex = "0123456789ABCDEF".to_array()
  let mut out = ""
  for b in @utf8.encode(raw) {
    let n = b.to_int()
    if (n >= 65 && n <= 90) ||
      (n >= 97 && n <= 122) ||
      (n >= 48 && n <= 57) ||
      n == 45 ||
      n == 46 ||
      n == 95 ||
      n == 126 ||
      n == 47 {
      out += n.unsafe_to_char().to_string()
    } else {
      out += "%" + hex[n / 16].to_string() + hex[n % 16].to_string()
    }
  }
  out
}

///|
pub fn propfind(
  raw_path : String,
  depth : Int,
  properties : Array[String],
) -> Request raise DavError {
  if depth != 0 && depth != 1 {
    raise Invalid("depth must be 0 or 1")
  }
  let mut body = "<?xml version=\"1.0\" encoding=\"utf-8\"?><D:propfind xmlns:D=\"DAV:\">"
  if properties.is_empty() {
    body += "<D:allprop/>"
  } else {
    body += "<D:prop>"
    for p in properties {
      if p.is_empty() ||
        !p
        .to_array()
        .iter()
        .all(c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '-') {
        raise Invalid("DAV property name")
      }
      body += "<D:" + p + "/>"
    }
    body += "</D:prop>"
  }
  body += "</D:propfind>"
  {
    verb: "PROPFIND",
    target: path(raw_path),
    headers: {
      "Depth": depth.to_string(),
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
  }
}

///|
pub fn copy_move(
  verb : String,
  raw_path : String,
  destination : String,
  overwrite : Bool,
) -> Request raise DavError {
  if verb != "COPY" && verb != "MOVE" {
    raise Invalid("COPY/MOVE required")
  }
  if (!destination.has_prefix("http://") && !destination.has_prefix("https://")) ||
    destination.contains("\r") ||
    destination.contains("\n") ||
    destination.contains(" ") {
    raise Invalid("absolute destination URI required")
  }
  {
    verb,
    target: path(raw_path),
    headers: {
      "Destination": destination,
      "Overwrite": if overwrite {
        "T"
      } else {
        "F"
      },
    },
    body: "",
  }
}

///|
priv struct Xml {
  cs : Array[Char]
  mut i : Int
  mut nodes : Int
}

///|
priv struct Node {
  ns : String
  name : String
  text : String
  children : Array[Node]
}

///|
fn Xml::space(self : Xml) -> Unit {
  while self.i < self.cs.length() &&
        (
          self.cs[self.i] == ' ' ||
          self.cs[self.i] == '\n' ||
          self.cs[self.i] == '\r' ||
          self.cs[self.i] == '\t'
        ) {
    self.i += 1
  }
}

///|
fn Xml::need(self : Xml, c : Char) -> Unit raise DavError {
  if self.i >= self.cs.length() || self.cs[self.i] != c {
    raise Invalid("malformed XML")
  }
  self.i += 1
}

///|
fn Xml::name(self : Xml) -> String raise DavError {
  let mut s = ""
  while self.i < self.cs.length() {
    let c = self.cs[self.i]
    if (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c == ':' ||
      c == '_' ||
      c == '-' ||
      c == '.' {
      s += c.to_string()
      self.i += 1
    } else {
      break
    }
  }
  if s.is_empty() {
    raise Invalid("XML name")
  }
  s
}

///|
fn entity(s : String) -> String raise DavError {
  let cs = s.to_array()
  let mut out = ""
  let mut i = 0
  while i < cs.length() {
    if cs[i] != '&' {
      out += cs[i].to_string()
      i += 1
      continue
    }
    i += 1
    let mut name = ""
    while i < cs.length() && cs[i] != ';' {
      name += cs[i].to_string()
      i += 1
    }
    if i >= cs.length() {
      raise Invalid("entity terminator")
    }
    i += 1
    out += match name {
      "amp" => "&"
      "lt" => "<"
      "gt" => ">"
      "quot" => "\""
      "apos" => "'"
      _ => raise Invalid("unsupported entity")
    }
  }
  out
}

///|
fn Xml::element(
  self : Xml,
  inherited : Map[String, String],
  depth : Int,
) -> Node raise DavError {
  self.nodes += 1
  if depth > 32 || self.nodes > 10000 {
    raise Invalid("XML resource limit")
  }
  self.need('<')
  let qname = self.name()
  let ns = inherited.copy()
  while true {
    self.space()
    if self.i >= self.cs.length() {
      raise Invalid("truncated tag")
    }
    if self.cs[self.i] == '/' || self.cs[self.i] == '>' {
      break
    }
    let key = self.name()
    self.space()
    self.need('=')
    self.space()
    if self.i >= self.cs.length() {
      raise Invalid("attribute")
    }
    let quote = self.cs[self.i]
    if quote != '\'' && quote != '"' {
      raise Invalid("attribute quote")
    }
    self.i += 1
    let mut v = ""
    while self.i < self.cs.length() && self.cs[self.i] != quote {
      v += self.cs[self.i].to_string()
      self.i += 1
    }
    self.need(quote)
    if key == "xmlns" {
      ns[""] = entity(v)
    } else if key.has_prefix("xmlns:") {
      let a = key.to_array()
      ns[String::from_array(a[6:])] = entity(v)
    }
  }
  let parts = qname.split(":").collect()
  if parts.length() > 2 {
    raise Invalid("QName")
  }
  let prefix = if parts.length() == 2 { parts[0].to_owned() } else { "" }
  let local_name = parts[parts.length() - 1].to_owned()
  let uri = match ns.get(prefix) {
    Some(v) => v
    None => if prefix.is_empty() { "" } else { raise Invalid("undeclared uri") }
  }
  let children : Array[Node] = []
  let mut content = ""
  if self.cs[self.i] == '/' {
    self.i += 1
    self.need('>')
    return { ns: uri, name: local_name, text: "", children, }
  }
  self.need('>')
  while true {
    if self.i >= self.cs.length() {
      raise Invalid("unclosed element")
    }
    if self.cs[self.i] == '<' {
      if self.i + 1 < self.cs.length() && self.cs[self.i + 1] == '/' {
        self.i += 2
        let close = self.name()
        if close != qname {
          raise Invalid("mismatched tag")
        }
        self.space()
        self.need('>')
        break
      }
      children.push(self.element(ns, depth + 1))
    } else {
      let mut chunk = ""
      while self.i < self.cs.length() && self.cs[self.i] != '<' {
        chunk += self.cs[self.i].to_string()
        self.i += 1
      }
      content += entity(chunk)
    }
  }
  { ns: uri, name: local_name, text: content, children, }
}

///|
fn children(n : Node, name : String) -> Array[Node] {
  n.children.filter(c => c.ns == "DAV:" && c.name == name)
}

///|
fn one(n : Node, name : String) -> Node raise DavError {
  let xs = children(n, name)
  if xs.length() != 1 {
    raise Invalid("expected one DAV:" + name)
  }
  xs[0]
}

///|
fn status(s : String) -> Int raise DavError {
  let pieces = s
    .trim()
    .to_owned()
    .split(" ")
    .filter(x => !x.is_empty())
    .collect()
  if pieces.length() < 2 || (pieces[0] != "HTTP/1.1" && pieces[0] != "HTTP/1.0") {
    raise Invalid("status line")
  }
  let n = @strconv.parse_int(pieces[1].to_owned()) catch {
    _ => raise Invalid("status code")
  }
  if n < 100 || n > 599 {
    raise Invalid("status code")
  }
  n
}

///|
pub fn parse_multistatus(source : String) -> Array[Resource] raise DavError {
  if source.length() > 1048576 || source.contains("<!") {
    raise Invalid("XML limit or unsupported DTD/comment/CDATA")
  }
  let x = Xml::{ cs: source.to_array(), i: 0, nodes: 0, }
  x.space()
  if source.trim_start().has_prefix("<?xml") {
    while x.i + 1 < x.cs.length() && !(x.cs[x.i] == '?' && x.cs[x.i + 1] == '>') {
      x.i += 1
    }
    x.i += 2
    x.space()
  }
  let root = x.element(Map([]), 0)
  x.space()
  if x.i != x.cs.length() || root.ns != "DAV:" || root.name != "multistatus" {
    raise Invalid("DAV multistatus root")
  }
  let out : Array[Resource] = []
  for r in children(root, "response") {
    let href = one(r, "href").text
    let properties : Array[Property] = []
    let statuses = children(r, "status")
    if statuses.length() > 1 {
      raise Invalid("duplicate status")
    }
    let response_status = if statuses.is_empty() {
      None
    } else {
      Some(status(statuses[0].text))
    }
    for ps in children(r, "propstat") {
      let code = status(one(ps, "status").text)
      for p in one(ps, "prop").children {
        let value = if p.name == "resourcetype" &&
          !children(p, "collection").is_empty() {
          "collection"
        } else {
          p.text
        }
        properties.push({ uri: p.ns, name: p.name, value, status: code, })
      }
    }
    if response_status == None && properties.is_empty() {
      raise Invalid("response without status/properties")
    }
    out.push({ href, status: response_status, properties, })
  }
  out
}

///|
pub fn property_xml(name : String, value : String) -> String raise DavError {
  if name.is_empty() ||
    !name.to_array().iter().all(c => (c >= 'a' && c <= 'z') || c == '-') {
    raise Invalid("property name")
  }
  "<D:" + name + ">" + escape(value) + "</D:" + name + ">"
}
