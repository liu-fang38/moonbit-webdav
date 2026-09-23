import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {WebDavClient,DavHttpError} from '../tools/client.mjs';
import {withWsgiDav} from '../tools/wsgidav-harness.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');

await withWsgiDav(async info=>{
  // Disposable local files only. Two independent client instances share one
  // resource to demonstrate optimistic concurrency, not global synchronization.
  const origin=`https://localhost:${info.httpsPort}`;
  const options={username:'demo',password:'test-only',auth:'digest',ca:info.certificate};
  const alice=new WebDavClient(origin,options),bob=new WebDavClient(origin,options),resource='/shared-config.json';
  await alice.put(resource,JSON.stringify({owner:'initial',revision:0})+'\n',{headers:{'If-None-Match':'*'}});
  const base=await alice.get(resource),bobBase=await bob.get(resource);
  assert.deepEqual(base.body,bobBase.body);assert.equal(base.headers.etag,bobBase.headers.etag);assert.ok(base.headers.etag&&!base.headers.etag.startsWith('W/'));
  const aliceValue={owner:'alice-updated',revision:1,feature:'reports'},bobValue={owner:'bob-conflicting-edit',revision:1};
  const aliceBytes=Buffer.from(JSON.stringify(aliceValue)+'\n'),bobBytes=Buffer.from(JSON.stringify(bobValue)+'\n');
  await alice.put(resource,aliceBytes,{headers:{'If-Match':base.headers.etag}});
  const conflict=await bob.put(resource,bobBytes,{headers:{'If-Match':bobBase.headers.etag}}).then(()=>undefined,e=>e);
  assert.ok(conflict instanceof DavHttpError);assert.equal(conflict.response.status,412);
  const afterConflict=await bob.get(resource);assert.deepEqual(afterConflict.body,aliceBytes);
  // Explicit sample decision: preserve Alice's edit, add Bob's separate note.
  // No automatic semantic merge algorithm is claimed.
  const resolved={...JSON.parse(afterConflict.body),note:'bob reviewed Alice revision and kept it',revision:2};
  const resolvedBytes=Buffer.from(JSON.stringify(resolved)+'\n');
  await bob.put(resource,resolvedBytes,{headers:{'If-Match':afterConflict.headers.etag}});
  const final=await alice.get(resource);assert.deepEqual(final.body,resolvedBytes);
  assert.deepEqual(await fs.readFile(path.join(info.share,'shared-config.json')),resolvedBytes);
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'webdav-conflict-workflow-'));
  const files={'base.json':base.body,'alice.json':aliceBytes,'bob-rejected.json':bobBytes,'after-conflict.json':afterConflict.body,'resolved.json':final.body};
  for(const [name,bytes] of Object.entries(files))await fs.writeFile(path.join(output,name),bytes,{flag:'wx'});
  const report={server:'WsgiDAV '+info.version,transport:'loopback HTTPS with temporary trusted CA and Digest',sourceSha256:info.sourceSha256,
    clients:2,resource,initialEtag:base.headers.etag,afterAliceEtag:afterConflict.headers.etag,staleWriteStatus:conflict.response.status,
    winnerPreserved:true,explicitResolutionWritten:true,filesystemBytesMatch:true,
    files:Object.entries(files).map(([file,b])=>({file,bytes:b.length,sha256:digest(b)})),
    limits:['single-resource If-Match workflow, not global synchronization','resolution policy is explicit sample code','no real enterprise user or production server deployment tested']};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,...report}));
});
