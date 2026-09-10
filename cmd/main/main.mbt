///|
fn run(input : String) -> String {
  Repr(@lib.parse_multistatus(input)).to_string() catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
fn main {
  println(
    run(
      "<d:multistatus xmlns:d=\"DAV:\"><d:response><d:href>/notes/a.txt</d:href><d:propstat><d:prop><d:getcontentlength>42</d:getcontentlength><d:displayname>笔记</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>",
    ),
  )
}
