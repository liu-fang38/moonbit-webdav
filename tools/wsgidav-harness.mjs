import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function withWsgiDav(run){
  const args=['-X','utf8',fileURLToPath(new URL('./wsgidav-reference.py',import.meta.url))];
  if(process.env.WSGIDAV_PYTHONPATH)args.push(process.env.WSGIDAV_PYTHONPATH);
  const child=spawn(process.env.PYTHON??'python',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let logs='';child.stderr.on('data',b=>{logs=(logs+b).slice(-12000);});child.stdin.on('error',()=>{});
  const stopped=new Promise(resolve=>{child.once('exit',code=>resolve(code));child.once('error',()=>resolve(-1));});
  try{
    const info=await new Promise((resolve,reject)=>{
      let text='';const timer=setTimeout(()=>reject(Error('WsgiDAV startup timed out: '+logs)),15000);
      child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);reject(Error('WsgiDAV exited '+code+': '+logs));});
      child.stdout.on('data',b=>{text+=b;const line=text.split('\n').find(l=>l.startsWith('READY '));if(line){clearTimeout(timer);try{resolve(JSON.parse(line.slice(6)));}catch(e){reject(e);}}});
    });
    if(info.version!=='4.3.5')throw Error('This reproducible example pins WsgiDAV 4.3.5');
    return await run(info);
  }finally{
    if(child.exitCode===null&&child.signalCode===null){child.stdin.end('\n');const timer=setTimeout(()=>child.kill(),6000);await stopped;clearTimeout(timer);}
  }
}
