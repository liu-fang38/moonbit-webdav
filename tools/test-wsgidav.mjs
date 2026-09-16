import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile, writeFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Readable, Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {WebDavClient, DavHttpError, DavMultiStatusError, DavProtocolError} from './client.mjs';

const args=['-X','utf8',fileURLToPath(new URL('./wsgidav-reference.py',import.meta.url))];
if(process.env.WSGIDAV_PYTHONPATH)args.push(process.env.WSGIDAV_PYTHONPATH);
const child=spawn(process.env.PYTHON??'python',args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
const exited=once(child,'exit');let logs='';child.stderr.on('data',v=>logs+=v);
const ready=await new Promise((resolve,reject)=>{
  let text='';const timer=setTimeout(()=>reject(Error('WsgiDAV startup timed out: '+logs)),15000);
  child.stdout.on('data',v=>{text+=v;for(const line of text.split('\n'))if(line.startsWith('READY ')){clearTimeout(timer);resolve(JSON.parse(line.slice(6)));}});
  child.once('error',e=>{clearTimeout(timer);reject(e);});
  child.once('exit',code=>{clearTimeout(timer);reject(Error('WsgiDAV exited '+code+': '+logs));});
}).catch(e=>{child.kill();throw e;});
const origin=`http://127.0.0.1:${ready.httpPort}`;
const credentials={username:'demo',password:'test-only',auth:'digest'};
const client=new WebDavClient(origin,credentials);
const results=[];const test=async(name,fn)=>{await fn();results.push({name,passed:true});console.log('PASS '+name);};
const digest=value=>createHash('sha256').update(value).digest('hex');
const status=code=>e=>e instanceof DavHttpError&&e.response.status===code;
let cleanup=false;
try{
  await test('independently seeded binary bytes through Digest authentication',async()=>{
    assert.deepEqual((await client.get('/independent.bin')).body,Buffer.from('independent server bytes\x00\xff','latin1'));
    assert.equal((await client.options()).headers.dav,'1,2');
  });
  await test('bad credentials and missing credentials fail closed',async()=>{
    await assert.rejects(new WebDavClient(origin,{...credentials,password:'wrong'}).get('/independent.bin'),status(401));
    await assert.rejects(new WebDavClient(origin).get('/independent.bin'),status(401));
  });
  await test('Basic and auto authentication interoperate with independent server',async()=>{
    for(const auth of ['basic','auto'])assert.equal((await new WebDavClient(origin,{...credentials,auth}).get('/independent.bin')).status,200);
  });
  await test('mkdirAll, Unicode paths, stat and list preserve metadata',async()=>{
    assert.equal((await client.mkdirAll('/parent/中文 空间/child/')).length,3);
    assert.deepEqual(await client.mkdirAll('/parent/中文 空间/child/'),[]);
    await client.put('/parent/中文 空间/child/a%.bin',Buffer.from([0,255,128,10]));
    const info=await client.stat('/parent/中文 空间/child/a%.bin');assert.equal(info.size,4n);assert(!info.isCollection);assert(info.etag);
    const list=await client.list('/parent/中文 空间/child/');assert.equal(list.length,1);assert.equal(list[0].path,info.path);
    assert((await client.stat('/parent/')).isCollection);
  });
  await test('conditional write rejects stale ETag without altering file',async()=>{
    const path='/conditional';await client.put(path,'one');const etag=(await client.head(path)).headers.etag;
    await client.put(path,'two',{headers:{'If-Match':etag}});
    await assert.rejects(client.put(path,'bad',{headers:{'If-Match':'"not-current"'}}),status(412));
    assert.equal((await client.get(path)).body.toString(),'two');
  });
  await test('dead properties preserve custom namespaces attributes and mixed XML',async()=>{
    await client.proppatch('/conditional',{set:[{uri:'urn:test',name:'color',value:'蓝色 & red'},{xml:'<x:rich xmlns:x="urn:test" xml:lang="en">before<x:bold rank="2">yes</x:bold>after</x:rich>'}]});
    const result=await client.propfind('/conditional',{depth:0,properties:[{uri:'urn:test',name:'color'},{uri:'urn:test',name:'rich'},{uri:'urn:test',name:'missing'}]});
    const props=result.responses[0].properties;assert.equal(props.find(p=>p.element.name==='color').element.content[0],'蓝色 & red');
    const rich=props.find(p=>p.element.name==='rich').element;assert.equal(rich.attributes[0].value,'en');assert.deepEqual(rich.content.map(x=>typeof x==='string'?x:x.name),['before','bold','after']);
    assert.equal(props.find(p=>p.element.name==='missing').status,404);
    await client.proppatch('/conditional',{remove:[{uri:'urn:test',name:'color'}]});
    const removed=await client.propfind('/conditional',{depth:0,properties:[{uri:'urn:test',name:'color'}]});assert.equal(removed.responses[0].properties[0].status,404);
  });
  await test('WsgiDAV propname limitation is rejected; protected-property failures remain observable',async()=>{
    // WsgiDAV 4.3.5 recognizes DAV:name instead of RFC 4918 DAV:propname.
    // Keep the standard request and reject its malformed href-only response.
    await assert.rejects(client.propfind('/conditional',{depth:0,namesOnly:true}),e=>e instanceof DavProtocolError&&/status or propstat/.test(e.message));
    await assert.rejects(client.proppatch('/conditional',{set:[{uri:'DAV:',name:'getetag',value:'fake'}]}),e=>e instanceof DavMultiStatusError&&e.failures.some(r=>r.properties.some(p=>p.status===403)));
  });
  await test('exclusive lock blocks writes and refresh/token write/unlock succeed',async()=>{
    const path='/conditional';const lock=await client.lock(path,{owner:'中文 owner <test>',depth:0,timeout:'Second-90'});
    assert.equal(lock.lock.scope,'exclusive');assert.equal(lock.lock.depth,'0');assert(lock.token.startsWith('opaquelocktoken:'));
    await assert.rejects(client.put(path,'blocked'),status(423));
    await assert.rejects(client.put(path,'wrong',{lockTokens:['urn:uuid:wrong']}),e=>[412,423].includes(e.response.status));
    assert.equal((await client.refreshLock(path,lock.token,{timeout:'Second-120'})).token,lock.token);
    await client.put(path,'locked',{lockTokens:[lock.token]});await client.unlock(path,lock.token);
    await client.put(path,'unlocked');assert.equal((await client.get(path)).body.toString(),'unlocked');
  });
  await test('depth-infinity parent lock requires token for descendants',async()=>{
    const lock=await client.lock('/parent/',{depth:'infinity'});
    await assert.rejects(client.put('/parent/child.bin','blocked'),status(423));
    await client.put('/parent/child.bin','allowed',{lockTokens:[lock.token]});
    await client.unlock('/parent/',lock.token);
  });
  await test('lock unmapped resource creates an empty locked file',async()=>{
    const lock=await client.lock('/created-by-lock',{depth:0});assert.equal(lock.status,201);
    assert.equal((await client.stat('/created-by-lock')).size,0n);
    await client.put('/created-by-lock','body',{lockTokens:[lock.token]});await client.unlock('/created-by-lock',lock.token);
  });
  await test('shared locks and token-authorized writes interoperate',async()=>{
    const first=await client.lock('/conditional',{shared:true,depth:0});const second=await client.lock('/conditional',{shared:true,depth:0});
    assert.notEqual(first.token,second.token);assert.equal(second.lock.scope,'shared');
    await client.put('/conditional','shared',{lockTokens:[first.token,second.token]});
    await client.unlock('/conditional',first.token);await client.unlock('/conditional',second.token);
  });
  await test('COPY MOVE with tagged source and destination locks',async()=>{
    await client.put('/source','source bytes');await client.put('/destination','old bytes');
    const a=await client.lock('/source',{depth:0}),b=await client.lock('/destination',{depth:0});
    await assert.rejects(client.copy('/source','/destination',{overwrite:true}),status(423));
    const lockConditions=[{path:'/source',tokens:[a.token]},{path:'/destination',tokens:[b.token]}];
    await client.copy('/source','/destination',{overwrite:true,lockConditions});assert.equal((await client.get('/destination')).body.toString(),'source bytes');
    await client.unlock('/source',a.token);
    // Overwrite replaces the destination resource and removes its old lock.
    await assert.rejects(client.unlock('/destination',b.token),status(409));
    await client.move('/destination','/moved');await assert.rejects(client.get('/destination'),status(404));await client.remove('/moved');
  });
  await test('stream upload retries Digest with fresh source and verifies filesystem bytes',async()=>{
    const fresh=new WebDavClient(origin,credentials);let factories=0;
    const bytes=Buffer.alloc(12*1024*1024+17);for(let i=0;i<bytes.length;i++)bytes[i]=i*31%251;
    const source=()=>{factories++;return Readable.from((function*(){for(let i=0;i<bytes.length;i+=32768)yield bytes.subarray(i,i+32768);})());};
    await fresh.putStream('/large-stream.bin',source,{length:bytes.length});assert.equal(factories,2);
    assert.equal(digest(await readFile(ready.share+'/large-stream.bin')),digest(bytes));
    const download=await fresh.getStream('/large-stream.bin');const hash=createHash('sha256');let count=0;
    await pipeline(download.body,new Writable({highWaterMark:8192,write(chunk,encoding,callback){count+=chunk.length;hash.update(chunk);setImmediate(callback);}}));
    await download.completed;assert.equal(count,bytes.length);assert.equal(hash.digest('hex'),digest(bytes));
    await assert.rejects(fresh.get('/large-stream.bin'),/response limit/);
  });
  await test('stream download Range preserves partial content status and bytes',async()=>{
    const response=await client.getStream('/large-stream.bin',{headers:{Range:'bytes=100-999'}});assert.equal(response.status,206);
    const chunks=[];for await(const chunk of response.body)chunks.push(chunk);await response.completed;
    const expected=(await readFile(ready.share+'/large-stream.bin')).subarray(100,1000);assert.deepEqual(Buffer.concat(chunks),expected);
  });
  await test('HTTPS requires trusted certificate and matching hostname',async()=>{
    const url=`https://localhost:${ready.httpsPort}`;
    assert.equal((await new WebDavClient(url,{...credentials,ca:ready.certificate}).get('/independent.bin')).status,200);
    await assert.rejects(new WebDavClient(url,credentials).get('/independent.bin'),/certificate/i);
    await assert.rejects(new WebDavClient(`https://127.0.0.1:${ready.httpsPort}`,{...credentials,ca:ready.certificate}).get('/independent.bin'),/IP|altname|hostname/i);
  });
  await test('collection COPY, MOVE, recursive DELETE and missing-path errors',async()=>{
    await client.copy('/parent/','/tree-copy/');assert((await client.list('/tree-copy/')).length>0);
    await client.move('/tree-copy/','/tree-moved/');await client.remove('/tree-moved/');await assert.rejects(client.stat('/tree-moved/'),status(404));
  });
  await test('network CLI streams real files and exposes lock lifecycle and failures',async()=>{
    const cli=async(args,extra={})=>{
      const p=spawn(process.execPath,[fileURLToPath(new URL('./dav.mjs',import.meta.url)),...args],{windowsHide:true,env:{...process.env,DAV_ORIGIN:origin,DAV_USERNAME:'demo',DAV_PASSWORD:'test-only',DAV_AUTH:'digest',DAV_TOKEN:'',DAV_LOCK_TOKEN:'',...extra},stdio:['ignore','pipe','pipe']});
      const out=[],err=[];p.stdout.on('data',x=>out.push(x));p.stderr.on('data',x=>err.push(x));const [code]=await once(p,'close');return {code,body:Buffer.concat(out),error:Buffer.concat(err).toString()};
    };
    assert.equal((await cli(['--help'])).code,0);
    assert.equal((await cli(['bad-command'])).code,1);
    const put=await cli(['put','/cli-upload.bin',ready.share+'/independent.bin']);assert.equal(put.code,0,put.error);
    const get=await cli(['get','/cli-upload.bin']);assert.equal(get.code,0,get.error);assert.deepEqual(get.body,await readFile(ready.share+'/independent.bin'));
    const lock=await cli(['lock','/cli-upload.bin']);assert.equal(lock.code,0,lock.error);const token=JSON.parse(lock.body).token;
    const blocked=await cli(['put','/cli-upload.bin',ready.share+'/independent.bin']);assert.equal(blocked.code,1);assert.match(blocked.error,/HTTP 423/);
    const authorized=await cli(['put','/cli-upload.bin',ready.share+'/independent.bin'],{DAV_LOCK_TOKEN:token});assert.equal(authorized.code,0,authorized.error);
    for(const command of ['refresh','unlock']){const r=await cli([command,'/cli-upload.bin',token]);assert.equal(r.code,0,r.error);}
    const metadata=await cli(['stat','/cli-upload.bin']);assert.equal(metadata.code,0,metadata.error);assert.equal(JSON.parse(metadata.body).size,String(get.body.length));
  });
}finally{
  child.stdin.end('\n');const timer=setTimeout(()=>child.kill(),8000);const [code]=await exited;clearTimeout(timer);
  cleanup=code===0;assert(cleanup,'Reference server did not stop normally: '+logs);
  await assert.rejects(stat(ready.share),{code:'ENOENT'});
}
const sourceSha256={};for(const file of ['dav.mbt','xml.mbt','multistatus.mbt','authoring.mbt','cmd/web/authoring.mbt','web/engine.mjs','tools/client.mjs','tools/digest.mjs','tools/dav.mjs','tools/test-wsgidav.mjs','tools/wsgidav-reference.py'])sourceSha256[file]=digest(await readFile(new URL('../'+file,import.meta.url)));
await writeFile(new URL('../evidence/wsgidav-validation.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),node:process.version,passed:results.length,results,server:{version:ready.version,cheroot:ready.cheroot,cryptography:ready.cryptography,openssl:ready.openssl,python:ready.python,sourceSha256:ready.sourceSha256},independentServer:true,tlsTested:true,temporaryServerAndShareRemoved:cleanup,knownServerLimitations:['WsgiDAV 4.3.5 recognizes DAV:name instead of RFC4918 DAV:propname; standard propname yields malformed href-only response and is rejected.','Fresh HEAD Digest authentication returns an illegal response body on 401 with Cheroot 11.1.2; Node rejects HTTP framing. Authentication tests use GET; warmed HEAD is tested.','Two same-user shared locks require both tokens for writes in this server; cross-user shared-lock semantics remain untested.'],sourceSha256},null,2)+'\n');
console.log(`${results.length} independent WsgiDAV groups passed; temporary server/share removed`);
