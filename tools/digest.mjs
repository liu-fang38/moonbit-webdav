import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

const tokenChar = /[!#$%&'*+.^_`|~0-9A-Za-z-]/;
/** Parse combined challenges, respecting quoted commas and quoted-pair escapes. */
export function challenges(value) {
  if (Array.isArray(value)) value = value.join(', ');
  if (typeof value !== 'string' || value.length > 65536 || /[\r\n\x00-\x08\x0b-\x1f\x7f]/.test(value)) throw Error('Invalid authentication challenge');
  let i=0,current;const result=[];
  const space=()=>{while(/[ \t]/.test(value[i]??'!'))i++;};
  const token=()=>{const start=i;while(i<value.length&&tokenChar.test(value[i]))i++;if(start===i)throw Error('Malformed authentication token');return value.slice(start,i);};
  while(i<value.length) {
    space();while(value[i]===','){i++;space();}if(i>=value.length)break;
    const key=token();space();
    if(value[i]!=='=') {
      current={scheme:key.toLowerCase(),params:Object.create(null)};result.push(current);
      if(value[i]===','||i>=value.length)continue;
      if(!['basic','digest'].includes(current.scheme)) {while(i<value.length&&value[i]!==',')i++;continue;}
      // The next iteration consumes the first auth-param after this scheme.
      continue;
    }
    if(!current)throw Error('Authentication parameter without scheme');
    i++;space();let data='';
    if(value[i]==='"') {
      i++;let ended=false;
      while(i<value.length) {
        const c=value[i++];if(c==='"'){ended=true;break;}
        if(c==='\\'){if(i>=value.length)throw Error('Unterminated quoted-pair');data+=value[i++];}else data+=c;
      }
      if(!ended)throw Error('Unterminated authentication quote');
    } else data=token();
    const name=key.toLowerCase();
    if(Object.hasOwn(current.params,name))throw Error('Duplicate authentication parameter');
    current.params[name]=data;space();
    if(i<value.length&&value[i]!==',')throw Error('Missing authentication separator');
  }
  return result;
}

const algorithms = new Map([
  ['MD5',['md5',1]],['MD5-SESS',['md5',1]],
  ['SHA-256',['sha256',2]],['SHA-256-SESS',['sha256',2]],
  ['SHA-512-256',['sha512-256',3]],['SHA-512-256-SESS',['sha512-256',3]],
]);
export function selectChallenge(header, {allowBasic=false, streaming=false}={}) {
  const parsed=challenges(header), candidates=[];
  for(const ch of parsed) {
    if(ch.scheme!=='digest')continue;
    const p=ch.params, algorithm=(p.algorithm??'MD5').toUpperCase(), spec=algorithms.get(algorithm);
    if(!spec || typeof p.realm!=='string' || !p.nonce || (p.charset && p.charset.toLowerCase()!=='utf-8'))continue;
    const offered=p.qop?.split(',').map(x=>x.trim().toLowerCase());
    const qop=!offered?undefined:offered.includes('auth')?'auth':!streaming&&offered.includes('auth-int')?'auth-int':null;
    if(qop===null)continue;
    if(p.userhash && !['true','false'].includes(p.userhash.toLowerCase()))continue;
    candidates.push({...ch,algorithm,hash:spec[0],rank:spec[1],qop,count:0});
  }
  if(candidates.length)return candidates.sort((a,b)=>b.rank-a.rank)[0];
  if(allowBasic) {
    const basic=parsed.find(x=>x.scheme==='basic');if(basic)return basic;
  }
  throw Error('No supported HTTP authentication challenge');
}

const quote=s=>'"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
const hash=(algorithm,value,encoding='utf8')=>createHash(algorithm).update(value,encoding).digest('hex');
/** Counter belongs to the selected nonce; synchronous reservation is safe across concurrent requests. */
export function digestAuthorization(challenge, username, password, method, uri, body=Buffer.alloc(0), cnonce=randomBytes(16).toString('hex')) {
  const p=challenge.params, algorithm=challenge.algorithm, qop=challenge.qop;
  if(!algorithm || challenge.scheme!=='digest')throw Error('Digest challenge required');
  const utf8=p.charset?.toLowerCase()==='utf-8', encoding=utf8?'utf8':'latin1';
  if(utf8){username=username.normalize('NFC');password=password.normalize('NFC');}
  else if([...username+password+p.realm].some(c=>c.codePointAt(0)>255))throw Error('Non-Latin-1 credentials require Digest charset=UTF-8');
  if(/[\r\n\x00]/.test(username+password+uri+cnonce))throw Error('Invalid Digest input');
  if(challenge.count>=0xffffffff)throw Error('Digest nonce counter exhausted');
  const nc=(++challenge.count).toString(16).padStart(8,'0');
  const H=value=>hash(challenge.hash,value,encoding);
  let ha1=H(`${username}:${p.realm}:${password}`);
  if(algorithm.endsWith('-SESS'))ha1=H(`${ha1}:${p.nonce}:${cnonce}`);
  if(qop==='auth-int'&&!Buffer.isBuffer(body))throw Error('Digest auth-int needs a replayable byte body');
  const bodyDigest=qop==='auth-int'?hash(challenge.hash,body):undefined;
  const a2=`${method}:${uri}${qop==='auth-int'?':'+bodyDigest:''}`;
  const response=H(`${ha1}:${p.nonce}:${qop?`${nc}:${cnonce}:${qop}:`:''}${H(a2)}`);
  const userhash=p.userhash?.toLowerCase()==='true';
  const userField=userhash?`username=${quote(H(`${username}:${p.realm}`))}`:utf8&&/[^\x20-\x7e]/.test(username)?`username*=UTF-8''${encodeURIComponent(username).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`:`username=${quote(username)}`;
  const fields=[userField,`realm=${quote(p.realm)}`,`nonce=${quote(p.nonce)}`,`uri=${quote(uri)}`,`algorithm=${algorithm.replace('-SESS','-sess')}`,`response=${quote(response)}`];
  if(p.opaque!==undefined)fields.push(`opaque=${quote(p.opaque)}`);
  if(qop)fields.push(`qop=${qop}`,`nc=${nc}`,`cnonce=${quote(cnonce)}`);
  else if(algorithm.endsWith('-SESS'))fields.push(`cnonce=${quote(cnonce)}`);
  if(p.userhash!==undefined)fields.push(`userhash=${userhash}`);
  function verify(info, responseBody) {
    if(!info)return undefined;
    const parsed=challenges('Digest '+info)[0].params;
    if(parsed.qop!==undefined&&parsed.qop!==qop || parsed.cnonce!==undefined&&parsed.cnonce!==cnonce || parsed.nc!==undefined&&parsed.nc!==nc)throw Error('Digest Authentication-Info mismatch');
    if(parsed.rspauth!==undefined) {
      const entity=qop==='auth-int'?':'+hash(challenge.hash,responseBody):'';
      const expected=H(`${ha1}:${p.nonce}:${qop?`${nc}:${cnonce}:${qop}:`:''}${H(`:${uri}${entity}`)}`);
      if(!/^[0-9a-f]+$/i.test(parsed.rspauth) || parsed.rspauth.length!==expected.length || !timingSafeEqual(Buffer.from(parsed.rspauth.toLowerCase()),Buffer.from(expected)))throw Error('Invalid Digest rspauth');
    }
    return parsed.nextnonce;
  }
  return {header:'Digest '+fields.join(', '),verify,qop};
}
