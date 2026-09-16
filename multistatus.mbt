///|
pub(all) struct XmlProperty {
  element : XmlElement
  status : Int
} derive(Debug, Eq, ToJson)

///|
pub(all) struct DavResponse {
  hrefs : Array[String]
  status : Int?
  properties : Array[XmlProperty]
  description : String?
  location : String?
  errors : Array[XmlElement]
} derive(Debug, Eq, ToJson)

///|
fn status(s : String) -> Int raise DavError {
  let pieces = s
    .trim()
    .to_owned()
    .split(" ")
    .filter(x => !x.is_empty())
    .collect()
  if pieces.length() < 2 ||
    (pieces[0] != "HTTP/1.1" && pieces[0] != "HTTP/1.0") ||
    pieces[1].length() != 3 ||
    !pieces[1].iter().all(c => c >= '0' && c <= '9') {
    raise Invalid("HTTP status line")
  }
  let code = @strconv.parse_int(pieces[1].to_owned()) catch {
    _ => raise Invalid("status code")
  }
  if code < 100 || code > 599 {
    raise Invalid("HTTP status code range")
  }
  code
}

///|
fn optional_text(n : XmlElement, name : String) -> String? raise DavError {
  let items = children(n, name)
  if items.length() > 1 {
    raise Invalid("duplicate DAV:" + name)
  }
  if items.is_empty() {
    None
  } else {
    Some(items[0].text_content())
  }
}

///|
pub fn parse_responses(source : String) -> Array[DavResponse] raise DavError {
  let root = parse_xml(source)
  if root.uri != "DAV:" || root.name != "multistatus" {
    raise Invalid("DAV multistatus root required")
  }
  let out = []
  for r in children(root, "response") {
    let hrefs = children(r, "href").map(h => h.text_content().trim().to_owned())
    if hrefs.is_empty() || hrefs.any(s => s.is_empty()) {
      raise Invalid("DAV href required")
    }
    let propstats = children(r, "propstat")
    let response_status = optional_text(r, "status").map(status)
    if (response_status == None) == propstats.is_empty() ||
      (!propstats.is_empty() && hrefs.length() != 1) {
      raise Invalid("response requires status or propstat, not both")
    }
    let properties = []
    let errors : Array[XmlElement] = []
    for error in children(r, "error") {
      for e in element_children(error) {
        errors.push(e)
      }
    }
    for ps in propstats {
      let code = status(one(ps, "status").text_content())
      for element in element_children(one(ps, "prop")) {
        properties.push({ element, status: code, })
      }
      for error in children(ps, "error") {
        for e in element_children(error) {
          errors.push(e)
        }
      }
    }
    let location = match children(r, "location") {
      [] => None
      [node] => Some(one(node, "href").text_content())
      _ => raise Invalid("duplicate DAV location")
    }
    out.push({
      hrefs,
      status: response_status,
      properties,
      description: optional_text(r, "responsedescription"),
      location,
      errors,
    })
  }
  out
}

///|
/// Compatibility view; use parse_responses for namespaced XML attributes and mixed content.
pub fn parse_multistatus(source : String) -> Array[Resource] raise DavError {
  let out = []
  for response in parse_responses(source) {
    let properties : Array[Property] = response.properties.map(p => {
      let e = p.element
      let value = if e.uri == "DAV:" &&
        e.name == "resourcetype" &&
        !children(e, "collection").is_empty() {
        "collection"
      } else {
        e.text_content()
      }
      { uri: e.uri, name: e.name, value, status: p.status, }
    })
    for href in response.hrefs {
      out.push({ href, status: response.status, properties, })
    }
  }
  out
}
