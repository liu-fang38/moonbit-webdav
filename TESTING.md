# Validation and reproduction — 0.4.0

## Required local checks

```powershell
./verify.ps1 -MoonPath C:/path/to/moon/bin/moon.exe
```

The script formats, generates the API, checks with warnings denied, runs explicit Wasm-GC and JS tests, builds the actual browser engine, and runs the demo, XML CLI, 5 legacy HTTP fixture groups, 13 new authoring/Digest/stream failure groups, 150 independent XML vectors plus 6 policy/bound checks, and Digest reference vectors. It also runs the existing 307 seeded bounded malformed inputs and the 5-warmup/30-measurement example benchmark. The latter measures the documented XML example, not network performance or upstream parity.

`README.mbt.md` is executable. Generated API and `web/engine.mjs` must match the same source. `moon fmt` and `moon info` must be idempotent. CI invokes the deterministic checks, but remote CI has not run because this repository has not been uploaded. Historical coverage data has not been refreshed for 0.4.

## Independent XML and Digest expectations

Python's standard library generates committed reference vectors; the normal verification reads them without requiring Python:

```powershell
python -X utf8 tools/xml-reference.py
python -X utf8 tools/digest-reference.py
node tools/test-xml-reference.mjs
node tools/test-digest.mjs
```

XML: 130 accepted ElementTree infosets and 20 independently rejected documents. Comparison uses expanded names, attributes and ordered mixed content; adjacent text chunks are combined because comments and PIs are intentionally discarded. Serialized XML is reparsed and compared. Six additional client policy/bound cases deliberately reject DTD, XML 1.1 or excessive size/depth/nodes; these are not counted as ElementTree equivalence.

Digest: two published RFC 7616 section 3.9.1 MD5/SHA-256 vectors and 18 Python hashlib cases across three hash algorithms, sess/non-sess, no qop/auth/auth-int. The latter include UTF-8 userhash and rspauth, with tampered-response rejection. They are an independent equation implementation, not a mature server's coverage of all 18 modes. WsgiDAV separately tests live MD5/auth negotiation.

## Independent server and real network CLI

Requires Python 3 and WsgiDAV 4.3.5, Cheroot 11.1.2, cryptography 50.0.1. Install in an isolated directory, not the global Python environment:

```powershell
$reference=Join-Path $env:TEMP 'moonbit-webdav-reference-python'
python -m pip install --target $reference WsgiDAV==4.3.5 cheroot==11.1.2 cryptography==50.0.1
$env:WSGIDAV_PYTHONPATH=$reference
node tools/test-wsgidav.mjs
```

Set `PYTHON` to an executable path if needed. The helper binds HTTP and HTTPS to loopback with OS-selected ports, creates a temporary filesystem share and one-day localhost certificate, and uses unmodified WsgiDAV/Cheroot modules with in-memory property and lock storage. It installs no service. The test closes its child and verifies the share was deleted. The dependency cache is left in the chosen directory for reuse.

The 17 groups cover binary seed data, Digest/Basic/auto and wrong credentials, Unicode directories and metadata, ETag writes, custom/nested XML properties, protected properties, exclusive/shared/inherited locks, empty locked resources, refresh/unlock, tagged source/destination COPY, collection lifecycle, a 12 MiB + 17 byte streaming upload/download verified against server filesystem SHA-256, Range, TLS trust/hostname, and separate CLI processes. CLI tests include streamed file bytes, JSON metadata, lock/refresh/unlock, unauthorized write failure, and token-authorized writes.

Known server limits remain explicit: WsgiDAV uses nonstandard DAV:name for propname and returns malformed href-only 207 for the standard request; the test expects protocol rejection and a separate fixture verifies standard propname. Its fresh HEAD 401 has an illegal body under Cheroot; live authentication uses GET, warmed HEAD is covered, and a conforming HEAD challenge is checked in a fixture. Its bare Lock-Token header is normalized after URI validation and matched against the XML body. Shared-lock writes supply both same-user tokens. These are not silently counted as full standards compatibility.

## Evidence and scope

- `evidence/wsgidav-validation.json`: independent server version/source fingerprints, result names, cleanup and limitations.
- `evidence/authoring-client-validation.json`: purposeful network fixtures for stale/counter/proof, deadlines, abort, early responses, lengths, protocol and managed-header failures; not an independent server.
- `evidence/xml-reference-validation.json`, `digest-validation.json`: reference vectors and source fingerprints.
- `evidence/authoring-upgrade.json`: final local source manifest and scope of checks for this release.
- Older `current-validation.json`, coverage and initial baseline manifests remain historical snapshots; they do not validate the new source.

No Apache/mod_dav, IIS/Nextcloud, litmus suite, production load, sustained memory, other operating systems or remote CI were tested in this increment. The retained gaps are in FEATURES.md. The independent tests are optional rather than auto-installing third-party packages during every verify run.
