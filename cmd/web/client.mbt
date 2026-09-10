///|
pub fn encode_path(raw : String) -> String {
  @lib.path(raw) catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn find_request(raw : String, depth : Int) -> String {
  @lib.propfind(raw, depth, []).to_json().stringify() catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn transfer_request(
  verb : String,
  raw : String,
  dest : String,
  overwrite : Bool,
) -> String {
  @lib.copy_move(verb, raw, dest, overwrite).to_json().stringify() catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
pub fn resources(source : String) -> String {
  @lib.parse_multistatus(source).to_json().stringify() catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}
