///|
pub fn run(input : String) -> String {
  Repr(@lib.parse_multistatus(input)).to_string() catch {
    e => "ERROR: " + Repr(e).to_string()
  }
}

///|
fn main {

}
