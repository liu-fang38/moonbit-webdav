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
pub fn property_xml(name : String, value : String) -> String raise DavError {
  xml_text(value)
  if name.is_empty() ||
    !name.to_array().iter().all(c => (c >= 'a' && c <= 'z') || c == '-') {
    raise Invalid("property name")
  }
  "<D:" + name + ">" + escape(value) + "</D:" + name + ">"
}
