///|
pub extend DavError with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend DavResponse with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend DavResponse with Eq::{not_equal, equal}

///|
pub extend DavResponse with ToJson::{to_json}

///|
pub extend LockInfo with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend LockInfo with Eq::{not_equal, equal}

///|
pub extend LockInfo with ToJson::{to_json}

///|
pub extend Property with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend Property with Eq::{not_equal, equal}

///|
pub extend Property with ToJson::{to_json}

///|
pub extend Request with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend Request with Eq::{not_equal, equal}

///|
pub extend Request with ToJson::{to_json}

///|
pub extend Resource with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend Resource with Eq::{not_equal, equal}

///|
pub extend Resource with ToJson::{to_json}

///|
pub extend XmlAttribute with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend XmlAttribute with Eq::{not_equal, equal}

///|
pub extend XmlAttribute with ToJson::{to_json}

///|
pub extend XmlContent with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend XmlContent with Eq::{not_equal, equal}

///|
pub extend XmlContent with ToJson::{to_json}

///|
pub extend XmlElement with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend XmlElement with Eq::{not_equal, equal}

///|
pub extend XmlElement with ToJson::{to_json}

///|
pub extend XmlProperty with @moonbitlang/core/debug.Debug::{to_repr}

///|
pub extend XmlProperty with Eq::{not_equal, equal}

///|
pub extend XmlProperty with ToJson::{to_json}
