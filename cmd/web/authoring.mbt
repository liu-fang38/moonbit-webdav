///|
fn xml_json(e : @lib.XmlElement) -> Json {
  let content : Array[Json] = e.content.map(c => {
    match c {
      Text(s) => s.to_json()
      Element(e) => xml_json(e)
    }
  })
  {
    "uri": e.uri.to_json(),
    "name": e.name.to_json(),
    "attributes": e.attributes.to_json(),
    "content": content.to_json(),
  }
}

///|
fn[T : ToJson] json_option(value : T?) -> Json {
  match value {
    Some(v) => v.to_json()
    None => Json::null()
  }
}

///|
pub fn xml_document(source : String) -> String {
  try {
    let root = @lib.parse_xml(source)
    ({ "root": xml_json(root), "xml": root.to_xml().to_json() } : Json).stringify()
  } catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn responses(source : String) -> String {
  @lib.parse_responses(source)
  .map(r => {
    (
      {
        "hrefs": r.hrefs.to_json(),
        "status": json_option(r.status),
        "properties": r.properties
        .map(p => {
          (
            { "element": xml_json(p.element), "status": p.status.to_json() } :
            Json)
        })
        .to_json(),
        "description": json_option(r.description),
        "location": json_option(r.location),
        "errors": r.errors.map(xml_json).to_json(),
      } : Json)
  })
  .to_json()
  .stringify() catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
fn object(v : Json) -> Map[String, Json] raise {
  match v {
    Object(o) => o
    _ => raise Failure("object required")
  }
}

///|
fn array(v : Json) -> Array[Json] raise {
  match v {
    Array(a) => a
    _ => raise Failure("array required")
  }
}

///|
fn text(v : Json) -> String raise {
  match v {
    String(s) => s
    _ => raise Failure("string required")
  }
}

///|
fn required(o : Map[String, Json], key : String) -> Json raise {
  o.get(key).unwrap_or_else(() => raise Failure("missing " + key))
}

///|
fn names(v : Json) -> Array[(String, String)] raise {
  array(v).map(item => {
    let o = object(item)
    (text(required(o, "uri")), text(required(o, "name")))
  })
}

///|
fn options(source : String) -> Json raise {
  if source.length() > 1048576 {
    raise Failure("options size limit")
  }
  @json.parse(source)
}

///|
pub fn find_extended(
  raw : String,
  depth : Int,
  properties : String,
  names_only : Bool,
) -> String {
  @lib.propfind_names(raw, depth, names(options(properties)), names_only~)
  .to_json()
  .stringify() catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn patch_request(raw : String, changes : String) -> String {
  try {
    let o = object(options(changes))
    let set = array(required(o, "set")).map(value => {
      let p = object(value)
      match p.get("xml") {
        Some(String(xml)) => @lib.parse_xml(xml)
        Some(_) => raise Failure("XML string required")
        None =>
          (
            {
              uri: text(required(p, "uri")),
              name: text(required(p, "name")),
              attributes: [],
              content: [@lib.Text(text(required(p, "value")))],
            } : @lib.XmlElement)
      }
    })
    @lib.set_properties(raw, set, names(required(o, "remove")))
    .to_json()
    .stringify()
  } catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn lock_spec(
  kind : String,
  raw : String,
  owner_or_token : String,
  depth : String,
  timeout : String,
  shared : Bool,
) -> String {
  try {
    let request = match kind {
      "lock" =>
        @lib.lock_request(raw, owner_or_token, depth~, timeout~, shared~)
      "refresh" => @lib.refresh_lock(raw, owner_or_token, timeout~)
      "unlock" => @lib.unlock_request(raw, owner_or_token)
      _ => raise Failure("unknown lock operation")
    }
    request.to_json().stringify()
  } catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn lock_result(source : String) -> String {
  @lib.parse_locks(source)
  .map(l => {
    (
      {
        "token": json_option(l.token),
        "root": json_option(l.root),
        "scope": l.scope.to_json(),
        "depth": l.depth.to_json(),
        "timeout": json_option(l.timeout),
        "owner": json_option(l.owner.map(xml_json)),
      } : Json)
  })
  .to_json()
  .stringify() catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn if_header(source : String, tagged : Bool) -> String {
  try {
    let values = array(options(source))
    if tagged {
      @lib.if_resources(
        values.map(v => {
          let o = object(v)
          (text(required(o, "uri")), array(required(o, "tokens")).map(text))
        }),
      )
    } else {
      @lib.if_tokens(values.map(text))
    }
  } catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}
