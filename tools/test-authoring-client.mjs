import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {readFile,writeFile} from 'node:fs/promises';
import {WebDavClient,DavHttpError,DavProtocolError,DavMultiStatusError} from './client.mjs';
import {challenges} from './digest.mjs';

const seen=[];const hash=s=>createHash('sha256').update(s).digest('hex');
const challenge=(res,nonce='first',extra='')=>{res.writeHead(401,{'WWW-Authenticate':`Digest realm="test", nonce="${nonce}", algorithm=SHA-256, qop="auth"${extra}`});res.end();};
function verify(req,res,nonce){
  const p=challenges(req.headers.authorization??'')[0]?.params;
  if(!p)return challenge(res,nonce),false;
  assert.equal(p.nonce,nonce);assert.equal(p.uri,req.url);assert.equal(p.username,'user');
  const ha1=hash('user:test:pass');
  assert.equal(p.response,hash(`${ha1}:${nonce}:${p.nc}:${p.cnonce}:auth:${hash(req.method+':'+req.url)}`));
  const rspauth=hash(`${ha1}:${nonce}:${p.nc}:${p.cnonce}:auth:${hash(':'+req.url)}`);
  res.setHeader('Authentication-Info',`qop=auth, cnonce="${p.cnonce}", nc=${p.nc}, rspauth="${rspauth}", nextnonce="cached"`);
  return true;
}
const errors=[];
const server=createServer((req,res)=>{(async()=>{
  seen.push({url:req.url,authorization:req.headers.authorization});
  const count=()=>seen.filter(x=>x.url===req.url).length;
  if(req.url==='/stale'){
    if(!req.headers.authorization)return challenge(res);
    if(challenges(req.headers.authorization)[0].params.nonce==='first')return challenge(res,'second',', stale=true');
    if(verify(req,res,'second'))res.end('verified');return;
  }
  if(req.url==='/cached'){if(verify(req,res,'cached'))res.end('cached');return;}
  if(req.url==='/digest-head'){if(verify(req,res,'first'))res.end();return;}
  if(req.url==='/wrong')return challenge(res);
  if(req.url==='/forever-stale')return challenge(res,'n'+count(),', stale=true');
  if(req.url==='/downgrade'){res.writeHead(401,{'WWW-Authenticate':'Basic realm="fallback"'});return res.end();}
  if(req.url==='/bad-proof'){if(!req.headers.authorization)return challenge(res);res.setHeader('Authentication-Info','rspauth="00000000000000000000000000000000"');return res.end('bad');}
  if(req.url==='/auth-int-only'){res.writeHead(401,{'WWW-Authenticate':'Digest realm="test", nonce="n", qop="auth-int"'});return res.end();}
  if(req.url==='/stall'){res.writeHead(200,{'Content-Length':'100'});res.write('partial');return;}
  if(req.url==='/backpressure'){res.writeHead(200,{'Content-Length':String(4*1024*1024)});return res.end(Buffer.alloc(4*1024*1024));}
  if(req.url==='/early-success'){res.writeHead(201);return res.end();}
  if(req.url==='/early-auth'&&!req.headers.authorization)return challenge(res);
  if(req.url==='/early-auth'){if(!verify(req,res,'first'))return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
  if(req.url==='/put'||req.url==='/early-auth'){res.writeHead(201);return res.end(body);}
  if(req.url==='/propname'){
    assert.match(body.toString(),/<D:propname\/>/);
    res.writeHead(207);return res.end('<D:multistatus xmlns:D="DAV:"><D:response><D:href>/propname</D:href><D:propstat><D:prop><D:getetag/><x:custom xmlns:x="urn:x"/></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>');
  }
  if(req.url==='/multi-failure'){
    res.writeHead(207);return res.end('<D:multistatus xmlns:D="DAV:"><D:response><D:href>/a</D:href><D:status>HTTP/1.1 403 Forbidden</D:status><D:location><D:href>/elsewhere</D:href></D:location><D:responsedescription>denied</D:responsedescription></D:response></D:multistatus>');
  }
  if(req.url==='/bad-xml'){res.writeHead(207);return res.end(Buffer.from([255]));}
  if(req.url==='/wrong-status')return res.end('<r/>');
  if(req.url==='/lock-mismatch'){
    res.writeHead(200,{'Lock-Token':'<urn:uuid:header>'});return res.end('<D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock><D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:depth>0</D:depth><D:locktoken><D:href>urn:uuid:body</D:href></D:locktoken></D:activelock></D:lockdiscovery></D:prop>');
  }
  res.writeHead(404);res.end();
})().catch(error=>{if(!req.aborted)errors.push(error);res.destroy();});});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`,credentials={username:'user',password:'pass',auth:'digest'};
const client=new WebDavClient(origin),results=[];
const test=async(name,fn)=>{await fn();results.push({name,passed:true});};
const never=()=>new Readable({read(){}});
try{
  await test('Digest stale retry, independent SHA256 validation, rspauth and nextnonce cache',async()=>{
    const c=new WebDavClient(origin,{...credentials,auth:'auto'});assert.equal((await c.get('/stale')).body.toString(),'verified');
    assert.equal(seen.filter(x=>x.url==='/stale').length,3);assert.equal((await c.get('/cached')).body.toString(),'cached');
    assert.equal(seen.filter(x=>x.url==='/cached').length,1);
    await assert.rejects(c.get('/downgrade'),/No supported/);
  });
  await test('standards-conforming unauthenticated HEAD challenge works',async()=>{
    assert.equal((await new WebDavClient(origin,credentials).head('/digest-head')).status,200);
  });
  await test('wrong password and forever-stale challenges have bounded retries',async()=>{
    await assert.rejects(new WebDavClient(origin,credentials).get('/wrong'),e=>e instanceof DavHttpError&&e.response.status===401);
    assert.equal(seen.filter(x=>x.url==='/wrong').length,2);
    await assert.rejects(new WebDavClient(origin,credentials).get('/forever-stale'),e=>e.response.status===401);
    assert.equal(seen.filter(x=>x.url==='/forever-stale').length,3);
  });
  await test('bad server proof and unsupported stream auth-int fail closed',async()=>{
    await assert.rejects(new WebDavClient(origin,credentials).get('/bad-proof'),/rspauth/);
    await assert.rejects(new WebDavClient(origin,credentials).getStream('/auth-int-only'),/No supported/);
  });
  await test('stream response retains deadline until body completion',async()=>{
    const response=await new WebDavClient(origin,{timeout:80}).getStream('/stall');response.body.resume();await assert.rejects(response.completed,/timed out/);
    const blocked=await new WebDavClient(origin,{timeout:100}).getStream('/backpressure');await assert.rejects(blocked.completed,/timed out/);
  });
  await test('stream cancellation and caller destruction reject completion',async()=>{
    const controller=new AbortController();const response=await client.getStream('/stall',{signal:controller.signal});response.body.resume();controller.abort();await assert.rejects(response.completed);
    const closed=await client.getStream('/stall');closed.body.destroy();await assert.rejects(closed.completed);
  });
  await test('stream uploads enforce exact lengths and byte chunks',async()=>{
    assert.equal((await client.putStream('/put',Readable.from([Buffer.from('ab'),Buffer.from('cd')]),{length:4})).body.toString(),'abcd');
    await assert.rejects(client.putStream('/put',Readable.from(['a']),{length:2}),/shorter/);
    await assert.rejects(client.putStream('/put',Readable.from(['long']),{length:1}),/exceeds/);
    await assert.rejects(client.putStream('/put',Readable.from([{}]),{length:1}),/Byte stream/);
    await assert.rejects(client.putStream('/put',()=>123,{length:1}),/Node Readable/);
    await assert.rejects(client.putStream('/put',()=>{throw Error('factory failed');},{length:1}),/factory failed/);
  });
  await test('early 401 disposes stalled source and replays a fresh stream',async()=>{
    let first,attempts=0;const source=()=>++attempts===1?(first=never()):Readable.from(['ok']);
    const r=await new WebDavClient(origin,credentials).putStream('/early-auth',source,{length:2});assert.equal(r.body.toString(),'ok');assert.equal(attempts,2);assert(first.destroyed);
  });
  await test('early successful response cannot hide incomplete upload',async()=>{
    const input=never();await assert.rejects(new WebDavClient(origin,{timeout:80}).putStream('/early-success',input,{length:1}),/timed out/);assert(input.destroyed);
  });
  await test('stalled upload timeout and abort release source',async()=>{
    const input=never();await assert.rejects(new WebDavClient(origin,{timeout:80}).putStream('/put',input,{length:1}),/timed out/);assert(input.destroyed);
    const controller=new AbortController(),second=never();const pending=client.putStream('/put',second,{length:1,signal:controller.signal});controller.abort();await assert.rejects(pending);assert(second.destroyed);
  });
  await test('standard propname body and rich response use scalar optional fields',async()=>{
    const r=await client.propfind('/propname',{depth:0,namesOnly:true});assert.equal(r.responses[0].properties[1].element.uri,'urn:x');assert.equal(r.responses[0].status,null);
    const error=await client.remove('/multi-failure').catch(e=>e);assert(error instanceof DavMultiStatusError);assert.equal(error.failures[0].status,403);assert.equal(error.failures[0].location,'/elsewhere');assert.equal(error.failures[0].description,'denied');
  });
  await test('invalid UTF8 XML, incorrect status and mismatched lock token reject',async()=>{
    for(const path of ['/bad-xml','/wrong-status'])await assert.rejects(client.propfind(path),e=>e instanceof DavProtocolError);
    await assert.rejects(client.lock('/lock-mismatch'),e=>e instanceof DavProtocolError&&/absent/.test(e.message));
  });
  await test('invalid stream, header and lock options never reach server',async()=>{
    const count=seen.length;
    assert.throws(()=>client.putStream('/put',Readable.from([]),{length:-1}),/length/);
    await assert.rejects(new WebDavClient(origin,credentials).putStream('/put',Readable.from(['a']),{length:1}),/factory/);
    await assert.rejects(client.get('/',{headers:{'X-Test':'a','x-test':'b'}}),/Duplicate/);
    await assert.rejects(client.get('/',{headers:{Authorization:'bad'}}),/managed/);
    await assert.rejects(client.put('/put','x',{lockTokens:['urn:x>\r\nInjected: yes']}));
    await assert.rejects(client.put('/put','x',{lockTokens:['urn:x'],lockConditions:[]}));
    assert.equal(seen.length,count);
  });
  assert.deepEqual(errors,[]);
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
const sourceSha256={};for(const file of ['tools/client.mjs','tools/digest.mjs','tools/test-authoring-client.mjs','web/engine.mjs'])sourceSha256[file]=hash(await readFile(new URL('../'+file,import.meta.url)));
await writeFile(new URL('../evidence/authoring-client-validation.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),node:process.version,passed:results.length,results,independentServer:false,sourceSha256},null,2)+'\n');
console.log(`${results.length} authoring/Digest/stream failure fixture groups passed`);
