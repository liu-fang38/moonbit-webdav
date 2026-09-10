///|
/// Set DAV properties atomically on the server; this only constructs the request.
pub fn proppatch(
  raw_path : String,
  properties : Array[(String, String)],
) -> Request raise DavError {
  if properties.is_empty() || properties.length() > 256 {
    raise Invalid("property count 1..256")
  }
  let mut xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?><D:propertyupdate xmlns:D=\"DAV:\"><D:set><D:prop>"
  for (name, value) in properties {
    xml += property_xml(name, value)
  }
  xml += "</D:prop></D:set></D:propertyupdate>"
  {
    verb: "PROPPATCH",
    target: path(raw_path),
    headers: { "Content-Type": "application/xml; charset=utf-8" },
    body: xml,
  }
}
