import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {WebDavClient,DavProtocolError} from './client.mjs';

const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--evidence'))throw Error('Usage: node tools/test-href-identity.mjs [--evidence FILE]');
const escapeXml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let hrefs=[],seen=[];
const server=createServer((req,res)=>{
  seen.push(req.url);
  res.writeHead(207,{'Content-Type':'application/xml'});
  res.end('<D:multistatus xmlns:D="DAV:">'+hrefs.map(href=>'<D:response><D:href>'+escapeXml(href)+'</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>').join('')+'</D:multistatus>');
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`,client=new WebDavClient(origin),results=[];
const test=async(name,fn)=>{await fn();results.push({name,passed:true});};
const rejects=promise=>assert.rejects(promise,error=>error instanceof DavProtocolError);
try{
  await test('encoded slash cannot impersonate two path segments',async()=>{
    for(const href of ['/a%2Fb','/a%2fb',origin+'/a%2Fb']){hrefs=[href];await rejects(client.stat('/a/b'));}
  });
  await test('listing fails rather than returning an aliased child path',async()=>{
    hrefs=['/a/','/a/x%2Fy'];await rejects(client.list('/a/'));
  });
  await test('ordinary, absolute and unreserved-equivalent hrefs match',async()=>{
    for(const href of ['/a/b',origin+'/a/b','/%61/%62']){hrefs=[href];assert.equal((await client.stat('/a/b')).path,'/a/b');}
  });
  await test('encoded literal percent is decoded once and reusable',async()=>{
    hrefs=['/a%252Fb'];const info=await client.stat('/a%2Fb');assert.equal(info.path,'/a%2Fb');
    await client.get(info.path);assert.equal(seen.at(-1),'/a%252Fb');
  });
  await test('UTF8, space and encoded reserved filename bytes round-trip',async()=>{
    for(const [raw,encoded] of [['/中文 x','/%e4%b8%ad%e6%96%87%20x'],['/a?b#c','/a%3fb%23c'],['/a;b','/a%3Bb'],['/a\\b','/a%5Cb']]){
      hrefs=[encoded];const info=await client.stat(raw);assert.equal(info.path,raw);
      await client.get(info.path);assert.equal(seen.at(-1),encoded.replace(/%[a-f0-9]{2}/gi,v=>v.toUpperCase()));
    }
  });
  await test('literal reserved punctuation is not confused with an escaped octet',async()=>{
    hrefs=['/a;b'];await rejects(client.stat('/a;b'));await rejects(client.list('/'));
  });
  await test('foreign origin, credentials, query and fragment are rejected',async()=>{
    for(const href of ['http://example.invalid/a/b',`http://user@127.0.0.1:${server.address().port}/a/b`,'/a/b?q=1','/a/b#part']){
      hrefs=[href];await rejects(client.stat('/a/b'));
    }
  });
  await test('malformed percent and UTF8 encodings are rejected',async()=>{
    for(const href of ['/a%','/a%GG','/a%C0%AF','/a%FF']){hrefs=[href];await rejects(client.stat('/a'));}
  });
  await test('URL parser repair cannot change a returned resource identity',async()=>{
    for(const href of ['/a\\b','/a\t/b']){hrefs=[href];await rejects(client.stat('/a/b'));}
  });
  await test('collection slash and unreserved self href keep list semantics',async()=>{
    hrefs=['/%61/','/a/%62'];assert.deepEqual((await client.list('/a')).map(r=>r.path),['/a/b']);
    hrefs=['/%61/'];assert.equal((await client.stat('/a')).path,'/a/');
  });
  await test('unrelated representable resource is not returned as requested',async()=>{
    hrefs=['/other'];await assert.rejects(client.stat('/a/b'),/Requested resource missing/);
  });
  await test('low-level propfind preserves an otherwise unrepresentable raw href',async()=>{
    hrefs=['/a%2Fb'];assert.equal((await client.propfind('/a/b')).resources[0].href,'/a%2Fb');
  });
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
const sourceSha256={};
for(const file of ['tools/client.mjs','tools/test-href-identity.mjs','web/engine.mjs'])sourceSha256[file]=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
const report={date:new Date().toISOString(),node:process.version,passed:results.length,results,server:'purpose-built loopback HTTP fixture',independentServer:false,standard:'RFC3986 sections 2.2, 2.3, 2.4',sourceSha256};
if(args.length){const file=resolve(args[1]);await mkdir(dirname(file),{recursive:true});await writeFile(file,JSON.stringify(report,null,2)+'\n');}
console.log(`${results.length} WebDAV href identity groups passed`);
