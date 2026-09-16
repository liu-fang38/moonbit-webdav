import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {Readable, PassThrough} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import * as core from '../web/engine.mjs';
import {selectChallenge, digestAuthorization} from './digest.mjs';

function checked(value,json=false){if(value.startsWith('ERROR:'))throw Error(value);return json?JSON.parse(value):value;}
function positive(value,name,zero=false){if(!Number.isSafeInteger(value)||value<(zero?0:1))throw TypeError(`Invalid ${name}`);return value;}
function mergeHeaders(...groups){const out={};for(const group of groups)for(const [name,value] of Object.entries(group??{})){const key=name.toLowerCase();if(Object.hasOwn(out,key))throw TypeError(`Duplicate header: ${name}`);if(typeof value!=='string')throw TypeError('Header values must be strings');out[key]=value;}return out;}
const decode=response=>new TextDecoder('utf-8',{fatal:true}).decode(response.body);
export class DavHttpError extends Error{constructor(response){super(`WebDAV HTTP ${response.status}`);this.name='DavHttpError';this.response=response;}}
export class DavProtocolError extends Error{constructor(message,response){super(message);this.name='DavProtocolError';this.response=response;}}
export class DavMultiStatusError extends Error{constructor(response,failures){super('WebDAV operation contains failed resources or properties');this.name='DavMultiStatusError';this.response=response;this.failures=failures;}}

/** HTTP(S) origin is fixed. Raw absolute paths are encoded by MoonBit. */
export class WebDavClient {
  #origin;#username;#password;#authorization;#auth;#challenge;
  constructor(origin,{username,password='',token,auth,timeout=10000,maxResponseBytes=8*1024*1024,ca,signal}={}){
    this.#origin=new URL(origin);
    if(!['http:','https:'].includes(this.#origin.protocol)||this.#origin.username||this.#origin.password||this.#origin.pathname!=='/'||this.#origin.search||this.#origin.hash)throw TypeError('HTTP(S) origin required; pass paths to individual methods');
    positive(timeout,'timeout');if(timeout>2147483647)throw TypeError('Timeout exceeds timer range');positive(maxResponseBytes,'response limit');
    if(username!==undefined&&(typeof username!=='string'||username.includes(':')||typeof password!=='string'||/[\r\n\0]/.test(username+password)))throw TypeError('Invalid credentials');
    if(token!==undefined&&(typeof token!=='string'||!token||/[\r\n\0]/.test(token)))throw TypeError('Invalid bearer token');
    if(username!==undefined&&token!==undefined)throw TypeError('Choose password or bearer credentials');
    this.#auth=auth??(token!==undefined?'bearer':username!==undefined?'basic':'none');
    if(!['none','basic','bearer','digest','auto'].includes(this.#auth)||(['basic','digest','auto'].includes(this.#auth)&&username===undefined)||(this.#auth==='bearer'&&token===undefined))throw TypeError('Invalid authentication mode');
    this.#username=username;this.#password=password;
    this.#authorization=this.#auth==='bearer'?`Bearer ${token}`:this.#auth==='basic'?`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`:undefined;
    Object.assign(this,{timeout,maxResponseBytes,ca,signal});
  }
  get origin(){return new URL(this.#origin);}
  #conditions({lockTokens,lockConditions}={}){
    if(lockTokens!==undefined&&lockConditions!==undefined)throw TypeError('Choose untagged tokens or tagged conditions');
    if(lockTokens!==undefined)return {'if':checked(core.if_header(JSON.stringify(lockTokens),false))};
    if(lockConditions!==undefined){
      if(!Array.isArray(lockConditions))throw TypeError('lockConditions must be an array');
      const list=lockConditions.map(c=>({uri:this.#origin.origin+checked(core.encode_path(c.path)),tokens:c.tokens}));
      return {'if':checked(core.if_header(JSON.stringify(list),true))};
    }
    return {};
  }
  async request(method,rawPath,{body=Buffer.alloc(0),headers={},signal=this.signal,...options}={}){
    return this.send({verb:method,target:checked(core.encode_path(rawPath)),headers:mergeHeaders(headers,this.#conditions(options)),body},signal);
  }
  async send(spec,signal=this.signal,streamOutput=false){
    if(signal?.aborted)throw signal.reason??Error('Aborted');
    if(typeof spec.verb!=='string'||!/^[A-Z]+$/.test(spec.verb)||typeof spec.target!=='string'||!spec.target.startsWith('/')||/[\r\n\x00-\x20\x7f]/.test(spec.target))throw TypeError('Invalid request target or method');
    spec={...spec,headers:mergeHeaders(spec.headers)};
    for(const key of Object.keys(spec.headers))if(['host','content-length','transfer-encoding','authorization','connection','expect'].includes(key))throw TypeError(`managed header: ${key}`);
    if(!spec.source){spec.body=typeof spec.body==='string'?Buffer.from(spec.body):spec.body??Buffer.alloc(0);if(!(spec.body instanceof Uint8Array))throw TypeError('body must be string or bytes');spec.body=Buffer.from(spec.body);}
    const streaming=streamOutput||!!spec.source;
    if(spec.source&&!spec.replayable&&['digest','auto'].includes(this.#auth))throw TypeError('Digest stream upload requires a fresh-stream factory for challenge replay');
    const deadline=performance.now()+this.timeout;
    let selected=this.#challenge;
    if(streaming&&selected?.qop==='auth-int')selected=undefined;
    for(let attempt=0;attempt<3;attempt++){
      let authorization=this.#authorization,proof;
      if(selected?.scheme==='digest'){
        proof=digestAuthorization(selected,this.#username,this.#password,spec.verb,spec.target,spec.source?undefined:spec.body);
        authorization=proof.header;
      }else if(selected?.scheme==='basic')authorization=`Basic ${Buffer.from(`${this.#username}:${this.#password}`).toString('base64')}`;
      const response=await this.#attempt(spec,authorization,signal,deadline,streamOutput);
      if(response.status===401&&['digest','auto'].includes(this.#auth)&&attempt<2){
        const next=selectChallenge(response.headers['www-authenticate'],{allowBasic:this.#auth==='auto'&&selected?.scheme!=='digest'&&this.#challenge?.scheme!=='digest',streaming});
        if(selected?.scheme===next.scheme&&(next.scheme==='basic'||(next.params.nonce===selected.params.nonce&&next.params.stale?.toLowerCase()!=='true')))throw new DavHttpError(response);
        if(spec.source&&!spec.replayable)throw Error('Upload source cannot be replayed');
        // Reuse counters for the same nonce if the server repeats a stale challenge.
        if(selected?.scheme==='digest'&&next.scheme==='digest'&&selected.params.nonce===next.params.nonce&&selected.params.realm===next.params.realm&&selected.algorithm===next.algorithm)next.count=selected.count;
        selected=next;this.#challenge=next;continue;
      }
      if(response.status<200||response.status>=300)throw new DavHttpError(response);
      try{
        const nextnonce=proof?.verify(response.headers['authentication-info'],streamOutput?Buffer.alloc(0):response.body);
        if(nextnonce&&this.#challenge===selected)this.#challenge={...selected,params:{...selected.params,nonce:nextnonce},count:0};
      }catch(error){if(streamOutput)response.body.destroy(error);throw error;}
      return response;
    }
    throw Error('Authentication retry limit');
  }
  #attempt(spec,authorization,signal,deadline,streamOutput){
    return new Promise((resolve,reject)=>{
      const remaining=Math.ceil(deadline-performance.now());if(remaining<=0){reject(Error('WebDAV request timed out'));return;}
      const headers={...spec.headers,'content-length':String(spec.source?spec.length:spec.body.length)};
      if(authorization)headers.authorization=authorization;
      let timer,source,output,uploadDone=!spec.source,result,settled=false,responseEnded=false,early=false;
      const finishError=error=>{clearTimeout(timer);if(!settled){settled=true;reject(error);}source?.destroy(error);output?.destroy(error);req.destroy(error);};
      const finish=()=>{
        if(!result||!responseEnded||(!uploadDone&&result.status>=200&&result.status<300)||settled)return;
        settled=true;clearTimeout(timer);
        if(early){source?.destroy();req.destroy();}
        resolve(result);
      };
      const transport=this.#origin.protocol==='https:'?https:http;
      const req=transport.request({protocol:this.#origin.protocol,hostname:this.#origin.hostname.replace(/^\[|\]$/g,''),port:this.#origin.port||undefined,method:spec.verb,path:spec.target,headers,signal,ca:this.ca,rejectUnauthorized:true,checkServerIdentity:tls.checkServerIdentity},res=>{
        result={status:res.statusCode,headers:res.headers};early=res.statusCode<200||res.statusCode>=300;
        if(streamOutput&&!early){
          output=new PassThrough({highWaterMark:65536});output.on('error',()=>{});
          const completed=pipeline(res,output).finally(()=>clearTimeout(timer));completed.catch(()=>{});
          output.once('close',()=>{if(!res.complete)req.destroy();});
          settled=true;resolve({...result,body:output,completed});return;
        }
        const chunks=[];let size=0;
        res.on('data',chunk=>{size+=chunk.length;if(size>this.maxResponseBytes){finishError(Error('WebDAV response limit exceeded'));res.destroy();}else chunks.push(chunk);});
        res.on('error',finishError);
        res.on('end',()=>{result.body=Buffer.concat(chunks);responseEnded=true;finish();});
      });
      timer=setTimeout(()=>finishError(Error('WebDAV request timed out')),remaining);
      req.on('error',finishError);
      req.on('close',()=>{if(settled&&!streamOutput)clearTimeout(timer);});
      if(!spec.source){req.end(spec.body);return;}
      const drain=()=>new Promise((done,fail)=>{
        const cleanup=()=>{req.off('drain',ready);req.off('error',error);req.off('close',closed);};
        const ready=()=>{cleanup();done();},error=e=>{cleanup();fail(e);},closed=()=>error(Error('Upload connection closed'));
        req.once('drain',ready);req.once('error',error);req.once('close',closed);
      });
      (async()=>{
        try{
          const candidate=spec.source();if(!(candidate instanceof Readable))throw TypeError('Stream factory must return a Node Readable');source=candidate;
          source.on('error',()=>{});let size=0;
          req.flushHeaders();
          for await(const value of source){
            if(early)break;
            if(!(typeof value==='string'||value instanceof Uint8Array))throw TypeError('Byte stream required');
            const chunk=Buffer.from(value);size+=chunk.length;if(size>spec.length)throw Error('Upload exceeds declared length');
            if(!req.write(chunk))await drain();
          }
          if(!early&&size!==spec.length)throw Error('Upload shorter than declared length');
          uploadDone=true;if(!req.destroyed)req.end();finish();
        }catch(error){if(early&&responseEnded){uploadDone=true;finish();}else finishError(error);}
      })();
    });
  }
  get(path,options){return this.request('GET',path,options);}
  head(path,options){return this.request('HEAD',path,options);}
  put(path,body,options={}){return this.request('PUT',path,{...options,body});}
  mkdir(path,options){return this.request('MKCOL',path,options);}
  async remove(path,options){return this.#multi(await this.request('DELETE',path,options),false,true);}
  options(path='/',options){return this.request('OPTIONS',path,options);}
  getStream(path,{headers={},signal=this.signal,...options}={}){return this.send({verb:'GET',target:checked(core.encode_path(path)),headers:mergeHeaders(headers,this.#conditions(options))},signal,true);}
  putStream(path,source,{length,headers={},signal=this.signal,...options}={}){
    positive(length,'stream length',true);const factory=typeof source==='function'?source:()=>source;
    return this.send({verb:'PUT',target:checked(core.encode_path(path)),headers:mergeHeaders(headers,this.#conditions(options)),source:factory,length,replayable:typeof source==='function'},signal);
  }
  #multi(response,required=false,throwFailures=false){
    if(response.status!==207){if(required)throw new DavProtocolError('Expected 207 Multi-Status',response);return response;}
    let source,resources,responses;
    try{source=decode(response);resources=checked(core.resources(source),true);responses=checked(core.responses(source),true);}
    catch(error){throw new DavProtocolError(error.message,response);}
    const value={...response,resources,responses};
    const failures=responses.filter(r=>(r.status!==null&&(r.status<200||r.status>=300))||r.properties.some(p=>p.status<200||p.status>=300));
    if(throwFailures&&failures.length)throw new DavMultiStatusError(value,failures);
    return value;
  }
  async propfind(path,{depth=1,properties=[],namesOnly=false,headers={},signal=this.signal,...options}={}){
    if(![0,1].includes(depth)||typeof namesOnly!=='boolean')throw TypeError('Invalid PROPFIND options');
    const spec=checked(core.find_extended(path,depth,JSON.stringify(properties),namesOnly),true);
    spec.headers=mergeHeaders(spec.headers,headers,this.#conditions(options));
    return this.#multi(await this.send(spec,signal),true);
  }
  async proppatch(path,{set=[],remove=[],headers={},signal=this.signal,...options}={}){
    const spec=checked(core.patch_request(path,JSON.stringify({set,remove})),true);spec.headers=mergeHeaders(spec.headers,headers,this.#conditions(options));
    return this.#multi(await this.send(spec,signal),true,true);
  }
  copy(path,destination,options){return this.transfer('COPY',path,destination,options);}
  move(path,destination,options){return this.transfer('MOVE',path,destination,options);}
  transfer(verb,path,destination,{overwrite=false,headers={},signal=this.signal,...options}={}){
    if(typeof overwrite!=='boolean')throw TypeError('overwrite must be boolean');
    const url=this.#origin.origin+checked(core.encode_path(destination));
    const spec=checked(core.transfer_request(verb,path,url,overwrite),true);spec.headers=mergeHeaders(spec.headers,headers,this.#conditions(options));
    return this.send(spec,signal).then(response=>this.#multi(response,false,true));
  }
  async lock(path,{owner='',depth='infinity',timeout='Second-3600',shared=false,headers={},signal=this.signal}={}){
    if(typeof shared!=='boolean')throw TypeError('shared must be boolean');
    const spec=checked(core.lock_spec('lock',path,owner,String(depth),timeout,shared),true);spec.headers=mergeHeaders(spec.headers,headers);
    const response=await this.send(spec,signal);const header=response.headers['lock-token'];
    if(typeof header!=='string')throw new DavProtocolError('Missing Lock-Token response header',response);
    // Some deployed servers (including WsgiDAV) omit the RFC angle brackets.
    // Accept a single validated absolute token URI in either form, and still
    // require it to match the lockdiscovery body below.
    const raw=header.trim(),token=/^<[^<>]+>$/.test(raw)?raw.slice(1,-1):raw;
    try{checked(core.if_header(JSON.stringify([token]),false));}catch{throw new DavProtocolError('Invalid Lock-Token response header',response);}
    return this.#lockResult(response,token);
  }
  async refreshLock(path,token,{timeout='Second-3600',headers={},signal=this.signal}={}){
    const spec=checked(core.lock_spec('refresh',path,token,'',timeout,false),true);spec.headers=mergeHeaders(spec.headers,headers);
    return this.#lockResult(await this.send(spec,signal),token);
  }
  unlock(path,token,{headers={},signal=this.signal}={}){
    const spec=checked(core.lock_spec('unlock',path,token,'','',false),true);spec.headers=mergeHeaders(spec.headers,headers);return this.send(spec,signal);
  }
  #lockResult(response,token){
    let locks;try{locks=checked(core.lock_result(decode(response)),true);}catch(error){throw new DavProtocolError(error.message,response);}
    const lock=locks.find(l=>l.token===token);if(!lock)throw new DavProtocolError('Lock token is absent from discovery body',response);
    return {...response,token,lock,locks};
  }
  #pathFromHref(href){const value=new URL(href,this.#origin);if(value.origin!==this.#origin.origin||value.search||value.hash)throw Error('Invalid or foreign DAV href');return decodeURIComponent(value.pathname);}
  #info(resource){
    const property=name=>resource.properties.find(p=>p.uri==='DAV:'&&p.name===name&&p.status>=200&&p.status<300)?.value;
    const rawLength=property('getcontentlength');let size;
    if(rawLength!==undefined){if(!/^\d+$/.test(rawLength))throw Error('Invalid DAV content length');size=BigInt(rawLength);}
    return {path:this.#pathFromHref(resource.href),href:resource.href,isCollection:property('resourcetype')==='collection',size,etag:property('getetag'),contentType:property('getcontenttype'),lastModified:property('getlastmodified'),resource};
  }
  async stat(path,options={}){
    const result=await this.propfind(path,{...options,depth:0});const canonical=s=>s==='/'?s:s.replace(/\/$/,'');
    const resource=result.resources.find(r=>canonical(this.#pathFromHref(r.href))===canonical(path));
    if(!resource)throw new DavProtocolError('Requested resource missing from PROPFIND',result);
    if(resource.status!==null&&(resource.status<200||resource.status>=300))throw new DavMultiStatusError(result,[resource]);
    return this.#info(resource);
  }
  async list(path,options={}){
    const result=await this.propfind(path,{...options,depth:1});const canonical=s=>s==='/'?s:s.replace(/\/$/,'');
    const failures=result.resources.filter(r=>r.status!==null&&(r.status<200||r.status>=300));if(failures.length)throw new DavMultiStatusError(result,failures);
    return result.resources.filter(r=>canonical(this.#pathFromHref(r.href))!==canonical(path)).map(r=>this.#info(r));
  }
  async mkdirAll(path,options={}){
    checked(core.encode_path(path));const parts=path.split('/').filter(Boolean);if(parts.some(p=>p==='.'||p==='..'))throw TypeError('mkdirAll rejects dot segments');
    let current='';const created=[];
    for(const part of parts){current+='/'+part;try{await this.mkdir(current+'/',options);created.push(current+'/');}catch(error){if(!(error instanceof DavHttpError)||![405,409].includes(error.response.status))throw error;if(!(await this.stat(current+'/',options)).isCollection)throw error;}}
    return created;
  }
}
