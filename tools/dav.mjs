#!/usr/bin/env node
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {WebDavClient,DavHttpError,DavMultiStatusError} from './client.mjs';

const help=`WebDAV network CLI (Node.js 22+)
Usage: node tools/dav.mjs COMMAND ARGUMENTS
  ls PATH                 list a collection as JSON
  stat PATH               show metadata as JSON (size is a decimal string)
  get PATH                stream bytes to stdout
  put PATH LOCAL_FILE     stream a local file, replaying Digest if needed
  mkdir PATH              create missing parent collections
  copy SOURCE DESTINATION copy, refusing to overwrite
  move SOURCE DESTINATION move, refusing to overwrite
  rm PATH                 delete resource or collection
  props PATH JSON_FILE    atomic PROPPATCH {set:[...],remove:[...]}
  lock PATH               create exclusive depth-0 lock; output token as JSON
  refresh PATH TOKEN      refresh lock
  unlock PATH TOKEN       remove lock
Environment: DAV_ORIGIN, DAV_USERNAME, DAV_PASSWORD, DAV_TOKEN,
  DAV_AUTH (none|basic|bearer|digest|auto), DAV_CA (PEM filename),
  DAV_TIMEOUT_MS (default 10000), DAV_LOCK_TOKEN (one mutation token).
Digest is the CLI default with password credentials; no redirect following.
Use HTTPS for credentials. GET emits binary data; other commands emit JSON.
`;
const counts={ls:1,stat:1,get:1,put:2,mkdir:1,copy:2,move:2,rm:1,props:2,lock:1,refresh:2,unlock:2};
try{
  const [command,...args]=process.argv.slice(2);
  if(command==='--help'||command==='-h'){process.stdout.write(help);}
  else{
    if(!Object.hasOwn(counts,command)||args.length!==counts[command])throw Error('Invalid command or argument count; use --help');
    if(!process.env.DAV_ORIGIN)throw Error('DAV_ORIGIN is required');
    const env=process.env,username=env.DAV_USERNAME,token=env.DAV_TOKEN||undefined;
    const client=new WebDavClient(env.DAV_ORIGIN,{username,password:env.DAV_PASSWORD??'',token,auth:env.DAV_AUTH??(token!==undefined?'bearer':username!==undefined?'digest':'none'),ca:env.DAV_CA?await readFile(env.DAV_CA):undefined,timeout:Number(env.DAV_TIMEOUT_MS??10000)});
    const options=env.DAV_LOCK_TOKEN?{lockTokens:[env.DAV_LOCK_TOKEN]}:{};
    const [path,other]=args;let value;
    switch(command){
      case 'ls':value=await client.list(path);break;
      case 'stat':value=await client.stat(path);break;
      case 'get':{const result=await client.getStream(path);await pipeline(result.body,process.stdout);await result.completed;break;}
      case 'put':{const info=await stat(other);if(!info.isFile())throw Error('Upload source must be a regular file');value=await client.putStream(path,()=>createReadStream(other),{...options,length:info.size});break;}
      case 'mkdir':value=await client.mkdirAll(path,options);break;
      case 'copy':value=await client.copy(path,other,options);break;
      case 'move':value=await client.move(path,other,options);break;
      case 'rm':value=await client.remove(path,options);break;
      case 'props':value=await client.proppatch(path,{...JSON.parse(await readFile(other,'utf8')),...options});break;
      case 'lock':value=await client.lock(path,{depth:0});break;
      case 'refresh':value=await client.refreshLock(path,other);break;
      case 'unlock':value=await client.unlock(path,other);break;
    }
    if(command!=='get'){
      if(value&&'body' in value){const {body,...metadata}=value;value=metadata;}
      process.stdout.write(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,null,2)+'\n');
    }
  }
}catch(error){
  const detail=error instanceof DavHttpError?`HTTP ${error.response.status}`:error instanceof DavMultiStatusError?'Multi-Status includes failed resources/properties':error.message;
  process.stderr.write('WebDAV: '+detail+'\n');process.exitCode=1;
}
