"""Independent disposable WsgiDAV server: HTTP Digest/Basic and verified HTTPS.
Optional argv[1] points to an isolated pip --target dependency directory.
One line on stdin or EOF stops both servers and deletes the temporary share.
"""
import sys
if len(sys.argv) > 1:
    sys.path.insert(0, sys.argv[1])
from pathlib import Path
from datetime import datetime, timedelta, timezone
import hashlib, importlib.metadata, json, ssl, tempfile, threading
from cheroot.wsgi import Server
from cheroot.ssl.builtin import BuiltinSSLAdapter
from wsgidav.wsgidav_app import WsgiDAVApp
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

with tempfile.TemporaryDirectory(prefix='moonbit-wsgidav-') as directory:
    base = Path(directory); share = base/'share'; share.mkdir()
    (share/'independent.bin').write_bytes(b'independent server bytes\x00\xff')
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'localhost')])
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
        .public_key(private.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc)-timedelta(minutes=1))
        .not_valid_after(datetime.now(timezone.utc)+timedelta(days=1))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost')]),critical=False)
        .add_extension(x509.BasicConstraints(ca=True,path_length=None),critical=True)
        .sign(private,hashes.SHA256()))
    key_file, cert_file = base/'key.pem', base/'cert.pem'
    key_file.write_bytes(private.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    config = {'provider_mapping':{'/':str(share)},'verbose':0,
        'logging':{'enable':False},'property_manager':True,'lock_storage':True,
        'dir_browser':{'enable':False},
        'http_authenticator':{'accept_basic':True,'accept_digest':True,'default_to_digest':True},
        'simple_dc':{'user_mapping':{'/':{'demo':{'password':'test-only','roles':['admin']}}}}}
    app = WsgiDAVApp(config)
    servers = [Server(('127.0.0.1',0),app,numthreads=4,timeout=5,shutdown_timeout=2) for _ in range(2)]
    servers[1].ssl_adapter = BuiltinSSLAdapter(str(cert_file),str(key_file))
    for server in servers: server.prepare()
    workers = [threading.Thread(target=server.serve,daemon=True) for server in servers]
    for worker in workers: worker.start()
    try:
        import wsgidav
        package = Path(wsgidav.__file__).parent
        fingerprints = {name:hashlib.sha256((package/name).read_bytes()).hexdigest() for name in ['wsgidav_app.py','request_server.py','http_authenticator.py']}
        print('READY '+json.dumps({'httpPort':servers[0].socket.getsockname()[1],'httpsPort':servers[1].socket.getsockname()[1],
            'certificate':cert_file.read_text(),'share':str(share),'version':importlib.metadata.version('WsgiDAV'),
            'python':sys.version,'cheroot':importlib.metadata.version('cheroot'),
            'cryptography':importlib.metadata.version('cryptography'),'openssl':ssl.OPENSSL_VERSION,
            'sourceSha256':fingerprints}),flush=True)
        sys.stdin.readline()
    finally:
        for server in servers: server.stop()
        for worker in workers: worker.join(timeout=3)
