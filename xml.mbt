///|
pub(all) struct XmlAttribute {
  uri : String
  name : String
  value : String
} derive(Debug, Eq, ToJson)

///|
pub(all) struct XmlElement {
  uri : String
  name : String
  attributes : Array[XmlAttribute]
  content : Array[XmlContent]
} derive(Debug, Eq, ToJson)

///|
pub(all) enum XmlContent {
  Text(String)
  Element(XmlElement)
} derive(Debug, Eq, ToJson)

///|
priv struct XmlReader {
  cs : Array[Char]
  mut i : Int
  mut nodes : Int
}

///|
fn xml_char(n : Int) -> Bool {
  n == 9 ||
  n == 10 ||
  n == 13 ||
  (n >= 32 && n <= 55295) ||
  (n >= 57344 && n <= 65533) ||
  (n >= 65536 && n <= 1114111)
}

///|
fn xml_text(s : String) -> Unit raise DavError {
  if !s.iter().all(c => xml_char(c.to_int())) {
    raise Invalid("invalid XML character")
  }
}

///|
fn name_start(c : Char) -> Bool {
  let n = c.to_int()
  c == '_' ||
  (c >= 'A' && c <= 'Z') ||
  (c >= 'a' && c <= 'z') ||
  (n >= 192 && n <= 214) ||
  (n >= 216 && n <= 246) ||
  (n >= 248 && n <= 767) ||
  (n >= 880 && n <= 893) ||
  (n >= 895 && n <= 8191) ||
  (n >= 8204 && n <= 8205) ||
  (n >= 8304 && n <= 8591) ||
  (n >= 11264 && n <= 12271) ||
  (n >= 12289 && n <= 55295) ||
  (n >= 63744 && n <= 64975) ||
  (n >= 65008 && n <= 65533) ||
  (n >= 65536 && n <= 983039)
}

///|
fn name_char(c : Char) -> Bool {
  let n = c.to_int()
  name_start(c) ||
  c == '-' ||
  c == '.' ||
  (c >= '0' && c <= '9') ||
  n == 183 ||
  (n >= 768 && n <= 879) ||
  (n >= 8255 && n <= 8256)
}

///|
fn ncname(s : String) -> Unit raise DavError {
  let cs = s.to_array()
  if cs.is_empty() || !name_start(cs[0]) || !cs.iter().all(name_char) {
    raise Invalid("invalid XML local name")
  }
}

///|
fn XmlReader::starts(self : XmlReader, text : String) -> Bool {
  let cs = text.to_array()
  if self.i + cs.length() > self.cs.length() {
    return false
  }
  for j, c in cs {
    if self.cs[self.i + j] != c {
      return false
    }
  }
  true
}

///|
fn XmlReader::space(self : XmlReader) -> Bool {
  let start = self.i
  while self.i < self.cs.length() &&
        (
          self.cs[self.i] == ' ' ||
          self.cs[self.i] == '\n' ||
          self.cs[self.i] == '\r' ||
          self.cs[self.i] == '\t'
        ) {
    self.i += 1
  }
  self.i != start
}

///|
fn XmlReader::need(self : XmlReader, text : String) -> Unit raise DavError {
  if !self.starts(text) {
    raise Invalid("malformed XML near offset " + self.i.to_string())
  }
  self.i += text.length()
}

///|
fn XmlReader::name(self : XmlReader) -> String raise DavError {
  let out = StringBuilder()
  if self.i >= self.cs.length() ||
    !(name_start(self.cs[self.i]) || self.cs[self.i] == ':') {
    raise Invalid("XML name")
  }
  while self.i < self.cs.length() &&
        (name_char(self.cs[self.i]) || self.cs[self.i] == ':') {
    out.write_char(self.cs[self.i])
    self.i += 1
  }
  out.to_string()
}

///|
fn split_name(s : String) -> (String, String) raise DavError {
  let parts = s.split(":").collect()
  if parts.length() == 1 {
    ncname(s)
    return ("", s)
  }
  if parts.length() != 2 {
    raise Invalid("invalid XML QName")
  }
  let prefix = parts[0].to_owned()
  let local_name = parts[1].to_owned()
  ncname(prefix)
  ncname(local_name)
  (prefix, local_name)
}

///|
fn XmlReader::until(self : XmlReader, stop : String) -> String raise DavError {
  let out = StringBuilder()
  while !self.starts(stop) {
    if self.i >= self.cs.length() {
      raise Invalid("unterminated XML construct")
    }
    out.write_char(self.cs[self.i])
    self.i += 1
  }
  self.need(stop)
  out.to_string()
}

///|
fn XmlReader::reference(self : XmlReader) -> Char raise DavError {
  self.need("&")
  let out = StringBuilder()
  let mut count = 0
  while !self.starts(";") {
    if self.i >= self.cs.length() || count >= 16 {
      raise Invalid("invalid XML entity")
    }
    out.write_char(self.cs[self.i])
    self.i += 1
    count += 1
  }
  self.need(";")
  let value = out.to_string()
  match value {
    "amp" => '&'
    "lt" => '<'
    "gt" => '>'
    "quot" => '"'
    "apos" => '\''
    _ => {
      let cs = value.to_array()
      if cs.length() < 2 || cs[0] != '#' {
        raise Invalid("unknown XML entity")
      }
      let hex = cs[1] == 'x'
      let start = if hex { 2 } else { 1 }
      if start >= cs.length() {
        raise Invalid("empty character reference")
      }
      let base = if hex { 16 } else { 10 }
      let mut number = 0
      for i in start..<cs.length() {
        let c = cs[i]
        let digit = if c >= '0' && c <= '9' {
          c.to_int() - 48
        } else if hex && c >= 'A' && c <= 'F' {
          c.to_int() - 55
        } else if hex && c >= 'a' && c <= 'f' {
          c.to_int() - 87
        } else {
          -1
        }
        if digit < 0 || digit >= base || number > (1114111 - digit) / base {
          raise Invalid("invalid character reference")
        }
        number = number * base + digit
      }
      if !xml_char(number) {
        raise Invalid("forbidden XML character reference")
      }
      number.unsafe_to_char()
    }
  }
}

///|
fn XmlReader::attribute_value(
  self : XmlReader,
  declaration? : Bool = false,
) -> String raise DavError {
  if self.i >= self.cs.length() {
    raise Invalid("missing XML attribute value")
  }
  let quote = self.cs[self.i]
  if quote != '"' && quote != '\'' {
    raise Invalid("XML attribute quote")
  }
  self.i += 1
  let out = StringBuilder()
  while self.i < self.cs.length() && self.cs[self.i] != quote {
    let c = self.cs[self.i]
    if c == '<' || (declaration && c == '&') {
      raise Invalid("invalid attribute or declaration value")
    }
    if c == '&' {
      out.write_char(self.reference())
    } else {
      out.write_char(if c == '\t' || c == '\n' || c == '\r' { ' ' } else { c })
      self.i += 1
    }
  }
  self.need(quote.to_string())
  out.to_string()
}

///|
fn XmlReader::comment(self : XmlReader) -> Unit raise DavError {
  self.need("<!--")
  let text = self.until("-->")
  if text.contains("--") || text.has_suffix("-") {
    raise Invalid("invalid XML comment")
  }
}

///|
fn XmlReader::instruction(self : XmlReader) -> Unit raise DavError {
  self.need("<?")
  let target = self.name()
  if target.to_lower() == "xml" {
    raise Invalid("reserved XML instruction")
  }
  if !self.starts("?>") && !self.space() {
    raise Invalid("invalid XML instruction")
  }
  ignore(self.until("?>"))
}

///|
fn XmlReader::misc(self : XmlReader) -> Unit raise DavError {
  while true {
    ignore(self.space())
    if self.starts("<!--") {
      self.comment()
    } else if self.starts("<?") {
      self.instruction()
    } else {
      break
    }
  }
}

///|
fn XmlReader::declaration(self : XmlReader) -> Unit raise DavError {
  self.need("<?xml")
  let attrs : Array[(String, String)] = []
  while true {
    let separated = self.space()
    if self.starts("?>") {
      self.need("?>")
      break
    }
    if !separated {
      raise Invalid("XML declaration needs whitespace")
    }
    let key = self.name()
    ignore(self.space())
    self.need("=")
    ignore(self.space())
    attrs.push((key, self.attribute_value(declaration=true)))
  }
  if attrs.is_empty() || attrs[0] != ("version", "1.0") || attrs.length() > 3 {
    raise Invalid("XML 1.0 declaration required")
  }
  let mut position = 1
  if attrs.length() > position && attrs[position].0 == "encoding" {
    let value = attrs[position].1.to_lower()
    if value != "utf-8" && value != "us-ascii" {
      raise Invalid("only UTF-8 XML transport supported")
    }
    position += 1
  }
  if attrs.length() > position &&
    attrs[position].0 == "standalone" &&
    (attrs[position].1 == "yes" || attrs[position].1 == "no") {
    position += 1
  }
  if position != attrs.length() {
    raise Invalid("invalid XML declaration")
  }
}

///|
fn XmlReader::element(
  self : XmlReader,
  inherited : Map[String, String],
  depth : Int,
) -> XmlElement raise DavError {
  self.nodes += 1
  if depth > 32 || self.nodes > 10000 {
    raise Invalid("XML resource limit")
  }
  self.need("<")
  let qname = self.name()
  let (prefix, local_name) = split_name(qname)
  if prefix == "xmlns" {
    raise Invalid("reserved element prefix")
  }
  let ns = inherited.copy()
  let raw_attrs : Array[(String, String)] = []
  let used : Map[String, Bool] = Map([])
  while true {
    let separated = self.space()
    if self.starts("/") || self.starts(">") {
      break
    }
    if !separated {
      raise Invalid("attribute requires whitespace")
    }
    let key = self.name()
    ignore(split_name(key))
    if used.contains(key) || raw_attrs.length() >= 256 {
      raise Invalid("duplicate or excessive attributes")
    }
    used[key] = true
    ignore(self.space())
    self.need("=")
    ignore(self.space())
    let value = self.attribute_value()
    raw_attrs.push((key, value))
    if key == "xmlns" {
      if value == "http://www.w3.org/2000/xmlns/" ||
        value == "http://www.w3.org/XML/1998/namespace" {
        raise Invalid("reserved namespace URI")
      }
      ns[""] = value
    } else if key.has_prefix("xmlns:") {
      let p = key[6:].to_owned()
      if p == "xmlns" ||
        value.is_empty() ||
        value == "http://www.w3.org/2000/xmlns/" ||
        (p == "xml") != (value == "http://www.w3.org/XML/1998/namespace") {
        raise Invalid("invalid namespace binding")
      }
      ns[p] = value
    }
  }
  let uri = ns
    .get(prefix)
    .unwrap_or_else(() => {
      if prefix.is_empty() {
        ""
      } else {
        raise Invalid("undeclared element namespace")
      }
    })
  let attributes : Array[XmlAttribute] = []
  for (key, value) in raw_attrs {
    if key == "xmlns" || key.has_prefix("xmlns:") {
      continue
    }
    let (p, name) = split_name(key)
    let uri = if p.is_empty() {
      ""
    } else {
      ns
      .get(p)
      .unwrap_or_else(() => raise Invalid("undeclared attribute namespace"))
    }
    if attributes.any(a => a.uri == uri && a.name == name) {
      raise Invalid("duplicate expanded attribute name")
    }
    attributes.push({ uri, name, value, })
  }
  let content : Array[XmlContent] = []
  if self.starts("/>") {
    self.need("/>")
    return { uri, name: local_name, attributes, content, }
  }
  self.need(">")
  let text = StringBuilder()
  while true {
    if self.i >= self.cs.length() {
      raise Invalid("unclosed element")
    }
    if self.starts("</") {
      self.need("</")
      if self.name() != qname {
        raise Invalid("mismatched tag")
      }
      ignore(self.space())
      self.need(">")
      if text.to_string() != "" {
        content.push(Text(text.to_string()))
      }
      break
    } else if self.starts("<!--") {
      self.comment()
    } else if self.starts("<?") {
      self.instruction()
    } else if self.starts("<![CDATA[") {
      self.need("<![CDATA[")
      text.write_string(self.until("]]>"))
    } else if self.starts("<!") {
      raise Invalid("DTD and declarations are not supported")
    } else if self.starts("<") {
      if text.to_string() != "" {
        content.push(Text(text.to_string()))
        text.reset()
      }
      content.push(Element(self.element(ns, depth + 1)))
    } else if self.starts("&") {
      text.write_char(self.reference())
    } else {
      if self.starts("]]>") {
        raise Invalid("CDATA terminator outside CDATA")
      }
      text.write_char(self.cs[self.i])
      self.i += 1
    }
  }
  { uri, name: local_name, attributes, content, }
}

///|
/// Bounded XML 1.0 UTF-8 infoset parser. DTD/external entities are deliberately rejected.
pub fn parse_xml(source : String) -> XmlElement raise DavError {
  if source.length() > 1048576 {
    raise Invalid("XML size limit")
  }
  xml_text(source)
  let normalized = source
    .replace_all(old="\r\n", new="\n")
    .replace_all(old="\r", new="\n")
  let x : XmlReader = { cs: normalized.to_array(), i: 0, nodes: 0, }
  if x.starts("\uFEFF") {
    x.i += 1
  }
  if x.starts("<?xml ") || x.starts("<?xml\t") || x.starts("<?xml\n") {
    x.declaration()
  }
  x.misc()
  let root = x.element({ "xml": "http://www.w3.org/XML/1998/namespace" }, 0)
  x.misc()
  if x.i != x.cs.length() {
    raise Invalid("content after XML root")
  }
  root
}

///|
pub fn XmlElement::text_content(self : XmlElement) -> String {
  let out = StringBuilder()
  for item in self.content {
    match item {
      Text(s) => out.write_string(s)
      Element(e) => out.write_string(e.text_content())
    }
  }
  out.to_string()
}

///|
fn element_children(node : XmlElement) -> Array[XmlElement] {
  let out = []
  for item in node.content {
    if item is Element(e) {
      out.push(e)
    }
  }
  out
}

///|
fn children(n : XmlElement, name : String) -> Array[XmlElement] {
  element_children(n).filter(e => e.uri == "DAV:" && e.name == name)
}

///|
fn one(n : XmlElement, name : String) -> XmlElement raise DavError {
  let nodes = children(n, name)
  if nodes.length() != 1 {
    raise Invalid("expected one DAV:" + name)
  }
  nodes[0]
}

///|
fn attribute_escape(s : String) -> String {
  escape(s)
  .replace_all(old="\t", new="&#9;")
  .replace_all(old="\n", new="&#10;")
  .replace_all(old="\r", new="&#13;")
}

///|
fn render_element(
  e : XmlElement,
  out : StringBuilder,
  depth : Int,
) -> Unit raise DavError {
  if depth > 32 {
    raise Invalid("XML depth limit")
  }
  ncname(e.name)
  xml_text(e.uri)
  if e.uri == "http://www.w3.org/2000/xmlns/" {
    raise Invalid("reserved XML namespace")
  }
  let tag = if e.uri.is_empty() {
    e.name
  } else if e.uri == "http://www.w3.org/XML/1998/namespace" {
    "xml:" + e.name
  } else {
    "e:" + e.name
  }
  out.write_string("<" + tag)
  if !e.uri.is_empty() && !tag.has_prefix("xml:") {
    out.write_string(" xmlns:e=\"" + attribute_escape(e.uri) + "\"")
  }
  let seen : Array[(String, String)] = []
  for i, a in e.attributes {
    ncname(a.name)
    xml_text(a.uri)
    xml_text(a.value)
    if a.uri == "http://www.w3.org/2000/xmlns/" ||
      (a.uri.is_empty() && a.name == "xmlns") ||
      seen.contains((a.uri, a.name)) {
      raise Invalid("reserved or duplicate attribute")
    }
    seen.push((a.uri, a.name))
    let name = if a.uri.is_empty() {
      a.name
    } else if a.uri == "http://www.w3.org/XML/1998/namespace" {
      "xml:" + a.name
    } else {
      let p = "a" + i.to_string()
      out.write_string(" xmlns:" + p + "=\"" + attribute_escape(a.uri) + "\"")
      p + ":" + a.name
    }
    out.write_string(" " + name + "=\"" + attribute_escape(a.value) + "\"")
  }
  if e.content.is_empty() {
    out.write_string("/>")
    return
  }
  out.write_string(">")
  for item in e.content {
    match item {
      Text(s) => {
        xml_text(s)
        out.write_string(escape(s).replace_all(old="\r", new="&#13;"))
      }
      Element(child) => render_element(child, out, depth + 1)
    }
  }
  out.write_string("</" + tag + ">")
}

///|
// Bound tree and input-string complexity before allocating escaped output.
fn xml_budget(
  e : XmlElement,
  depth : Int,
  budget : Array[Int],
) -> Unit raise DavError {
  if depth > 32 || e.attributes.length() > 256 {
    raise Invalid("XML resource limit")
  }
  budget[0] += 1
  if budget[0] > 10000 {
    raise Invalid("XML node limit")
  }
  let strings = [e.uri, e.name]
  for a in e.attributes {
    strings.push(a.uri)
    strings.push(a.name)
    strings.push(a.value)
  }
  for item in e.content {
    if item is Text(s) {
      strings.push(s)
    }
  }
  budget[1] += 64 + e.attributes.length() * 48
  for s in strings {
    if s.length() > 1048576 || budget[1] > 1048576 - s.length() {
      raise Invalid("XML serialization size limit")
    }
    budget[1] += s.length()
  }
  for item in e.content {
    if item is Element(child) {
      xml_budget(child, depth + 1, budget)
    }
  }
}

///|
pub fn XmlElement::to_xml(self : XmlElement) -> String raise DavError {
  xml_budget(self, 0, [0, 0])
  let out = StringBuilder()
  render_element(self, out, 0)
  let value = out.to_string()
  if value.length() > 1048576 {
    raise Invalid("XML size limit")
  }
  value
}
