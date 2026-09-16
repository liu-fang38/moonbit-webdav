"""Independent Python hashlib vectors for the RFC 7616 digest equations."""
from pathlib import Path
import hashlib, json, sys

cases=[]
for algorithm in ['MD5','MD5-sess','SHA-256','SHA-256-sess','SHA-512-256','SHA-512-256-sess']:
    for qop in [None,'auth','auth-int']:
        name={'MD5':'md5','SHA-256':'sha256','SHA-512-256':'sha512_256'}[algorithm.replace('-sess','')]
        username,password,realm='Jäsøn','test-only','réalm'
        nonce,cnonce,nc,method,uri='nonce','client-nonce','00000001','PUT','/resource%20one'
        request_body,response_body=b'\x00\xffrequest',b'\x00response\xfe'
        def h(data): return hashlib.new(name,data if isinstance(data,bytes) else data.encode('utf8')).hexdigest()
        ha1=h(f'{username}:{realm}:{password}')
        if algorithm.endswith('-sess'): ha1=h(f'{ha1}:{nonce}:{cnonce}')
        def response(verb,body):
            a2=f'{verb}:{uri}'+(':'+h(body) if qop=='auth-int' else '')
            middle=f'{nc}:{cnonce}:{qop}:' if qop else ''
            return h(f'{ha1}:{nonce}:{middle}{h(a2)}')
        fields=f'Digest realm="{realm}", nonce="{nonce}", algorithm={algorithm}, charset=UTF-8, userhash=true'
        if qop: fields+=f', qop="{qop}"'
        cases.append(dict(algorithm=algorithm,qop=qop,challenge=fields,username=username,password=password,method=method,uri=uri,cnonce=cnonce,requestHex=request_body.hex(),responseHex=response_body.hex(),response=response(method,request_body),rspauth=response('',response_body),userhash=h(f'{username}:{realm}')))
value={'oracle':'Python stdlib hashlib; RFC 7616 section 3.4 equations','python':sys.version,'cases':cases,'generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
Path('evidence/digest-reference-vectors.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
print(f'Generated {len(cases)} Digest algorithm/session/qop vectors')
