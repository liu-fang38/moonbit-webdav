import assert from 'node:assert/strict';
import {challenges,selectChallenge,digestAuthorization} from './digest.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const published='realm="http-auth@example.org", qop="auth, auth-int", nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"';
for(const [algorithm,expected] of [['MD5','8ca523f5e9506fed4657c9700eebdbec'],['SHA-256','753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1']]) {
  const ch=selectChallenge(`Digest ${published}, algorithm=${algorithm}`);
  const auth=digestAuthorization(ch,'Mufasa','Circle of Life','GET','/dir/index.html',Buffer.alloc(0),'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ');
  assert.equal(challenges(auth.header)[0].params.response,expected);
}
const ch=selectChallenge('Basic realm="fallback", Digest realm="a,b", nonce="q\\\"x", qop="auth", algorithm=MD5, Digest realm="strong", nonce="s", qop="auth", algorithm=SHA-256',{allowBasic:true});
assert.equal(ch.algorithm,'SHA-256');assert.equal(ch.params.realm,'strong');
const selected=selectChallenge('Digest realm="r", nonce="n", algorithm=MD5-sess, qop=auth');
const first=digestAuthorization(selected,'u','p','GET','/a'),second=digestAuthorization(selected,'u','p','GET','/b');
assert.equal(challenges(first.header)[0].params.nc,'00000001');assert.equal(challenges(second.header)[0].params.nc,'00000002');
assert.throws(()=>first.verify('rspauth="0000"',Buffer.alloc(0)),/rspauth/);
for(const value of ['Digest realm="r", nonce="a", nonce="b"','Digest realm="r", nonce="bad','Digest realm="r"\r\nInjected: 1'])assert.throws(()=>challenges(value));
assert.throws(()=>selectChallenge('Digest realm="r", nonce="n", qop="auth-int"',{streaming:true}),/supported/);
assert.throws(()=>selectChallenge('Basic realm="x"'),/supported/);
const vectors=JSON.parse(await readFile(new URL('../evidence/digest-reference-vectors.json',import.meta.url)));
for(const item of vectors.cases){
  const challenge=selectChallenge(item.challenge);
  const proof=digestAuthorization(challenge,item.username,item.password,item.method,item.uri,Buffer.from(item.requestHex,'hex'),item.cnonce);
  const params=challenges(proof.header)[0].params;assert.equal(params.response,item.response,item.algorithm+' '+item.qop);assert.equal(params.username,item.userhash);
  assert.equal(proof.verify(`rspauth="${item.rspauth}", nextnonce="next"`,Buffer.from(item.responseHex,'hex')),'next');
  if(item.qop==='auth-int')assert.throws(()=>proof.verify(`rspauth="${item.rspauth}"`,Buffer.from('tampered')),/rspauth/);
}
const sourceSha256={};for(const file of ['tools/digest.mjs','tools/test-digest.mjs','tools/digest-reference.py','evidence/digest-reference-vectors.json'])sourceSha256[file]=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
await writeFile(new URL('../evidence/digest-validation.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),publishedRfc7616Vectors:2,pythonHashlibVectors:vectors.cases.length,additionalChecks:['challenge grammar','algorithm preference','nonce counts','auth-int tamper rejection','stream auth-int exclusion','response proof validation'],sourceSha256},null,2)+'\n');
console.log(`Digest: 2 RFC 7616 vectors + ${vectors.cases.length} Python hashlib vectors and negative checks passed`);
