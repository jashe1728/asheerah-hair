'use strict';
const crypto=require('node:crypto');
const COOKIE='__Host-ah_management';
const WINDOW=15*60*1000;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const allowed=env=>String(env.MANAGEMENT_ALLOWED_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const prefix='management-auth/';
async function read(env,key){const obj=await env.REVIEW_MEDIA.get(prefix+key);return obj?{value:JSON.parse(await obj.text()),etag:obj.etag}:null;}
async function put(env,key,value,current){return env.REVIEW_MEDIA.put(prefix+key,JSON.stringify(value),{onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});}
function tokenFrom(request){const cookies=request.headers.get('Cookie')||'';const found=cookies.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));const token=found?.slice(COOKIE.length+1)||'';return /^[a-f0-9]{64}$/.test(token)?token:null;}
async function identity(request,env){
 if(!env.REVIEW_MEDIA||!allowed(env).length)return null;
 const token=tokenFrom(request);if(!token)return null;
 const record=await read(env,'sessions/'+hash(token)+'.json');
 return record&&record.value.expiresAt>Date.now()&&allowed(env).includes(record.value.email)?record.value.email:null;
}
async function rateLimit(env,scope,identifier,max,period=WINDOW){
 const now=Date.now(),window=Math.floor(now/period),key='limits/'+scope+'-'+hash(identifier)+'-'+window+'.json';
 for(let attempt=0;attempt<5;attempt++){
  const current=await read(env,key),count=current?.value.count||0;if(count>=max)return false;
  if(await put(env,key,{count:count+1,expiresAt:(window+2)*period},current))return true;
 }
 return false;
}
async function handle(request,env){
 const url=new URL(request.url);
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'Pedido inválido.'},403);
 if(!env.REVIEW_MEDIA||!allowed(env).length)return json({error:'O acesso privado ainda está a ser preparado.'},503);
 if(Number(request.headers.get('Content-Length')||0)>1000)return json({error:'Pedido demasiado grande.'},413);
 const raw=await request.text();if(Buffer.byteLength(raw)>1000)return json({error:'Pedido demasiado grande.'},413);
 let input;try{input=JSON.parse(raw);}catch{return json({error:'Pedido inválido.'},400);}
 if(!input||Array.isArray(input)||typeof input!=='object')return json({error:'Pedido inválido.'},400);
 if(url.pathname==='/management-api/auth/logout'){
  const token=tokenFrom(request);if(token)await env.REVIEW_MEDIA.delete(prefix+'sessions/'+hash(token)+'.json');
  return json({ok:true},200,{'set-cookie':COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
 }
 const ip=request.headers.get('CF-Connecting-IP')||'unavailable';
 if(url.pathname==='/management-api/auth/start'){
  if(!await rateLimit(env,'start-ip',ip,20))return json({error:'Demasiadas tentativas. Aguarda 15 minutos antes de tentar novamente.'},429);
  if(typeof input.email!=='string'||input.email.length>254||!/^\S+@\S+\.\S+$/.test(input.email))return json({error:'Introduz um e-mail válido.'},400);
  const email=input.email.trim().toLowerCase(),challenge=crypto.randomBytes(24).toString('hex');
  // The same response for unlisted accounts avoids exposing who has access.
  const result={ok:true,challenge,message:'Se este e-mail tiver acesso, receberá um código de entrada.'};
  if(!allowed(env).includes(email))return json(result);
  if(!await rateLimit(env,'start-email',email,3))return json(result);
  if(!await rateLimit(env,'send-day','all',30,86400000))return json(result);
  if(!env.RESEND_API_KEY)return json({error:'O envio do código não está disponível. Tenta novamente mais tarde.'},503);
  const code=String(crypto.randomInt(100000,1000000)),expiresAt=Date.now()+10*60*1000;
  await put(env,'codes/'+challenge+'.json',{email,digest:hash(challenge+':'+code),attempts:0,used:false,expiresAt},null);
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'management-login/'+challenge},body:JSON.stringify({from:'Asheerah Hair <noreply@asheerahhair.com>',to:[email],subject:'O teu código de entrada · Asheerah Hair',text:`O teu código de entrada na área privada da Asheerah Hair é ${code}. É válido durante 10 minutos e só pode ser usado uma vez. Não o partilhes com ninguém. Se não pediste este código, ignora esta mensagem.`,html:`<div style="background:#fdf6e4;padding:36px;font-family:Arial,sans-serif;color:#362511"><div style="max-width:440px;margin:auto;background:#fffdf7;padding:32px;border-radius:16px;text-align:center"><img src="https://asheerahhair.com/assets/logo-sm.png" width="90" alt="Asheerah Hair"><h1 style="font:30px Georgia,serif">Bem-vinda ao teu negócio.</h1><p>Usa este código para entrar na tua área privada:</p><p style="font-size:34px;letter-spacing:8px;font-weight:bold;background:#f4ead9;padding:18px;border-radius:10px">${code}</p><p style="font-size:12px;color:#84745e">Válido durante 10 minutos · utilização única<br>Não partilhes este código. Se não o pediste, ignora esta mensagem.</p></div></div>`})});
  if(!sent.ok)return json({error:'Não foi possível enviar o código. Tenta novamente mais tarde.'},502);
  return json(result);
 }
 if(url.pathname==='/management-api/auth/verify'){
  if(!await rateLimit(env,'verify-ip',ip,30))return json({error:'Demasiadas tentativas. Aguarda 15 minutos.'},429);
  if(typeof input.challenge!=='string'||!/^[a-f0-9]{48}$/.test(input.challenge)||typeof input.code!=='string'||!/^\d{6}$/.test(input.code))return json({error:'Código inválido ou expirado.'},401);
  const key='codes/'+input.challenge+'.json';
  for(let attempt=0;attempt<5;attempt++){
   const current=await read(env,key),c=current?.value;
   if(!c||c.used||c.expiresAt<=Date.now()||c.attempts>=5||!allowed(env).includes(c.email))return json({error:'Código inválido ou expirado. Pede um novo código.'},401);
   const valid=crypto.timingSafeEqual(Buffer.from(c.digest,'hex'),Buffer.from(hash(input.challenge+':'+input.code),'hex'));
   const updated={...c,attempts:c.attempts+1,used:valid};
   if(!await put(env,key,updated,current))continue;
   if(!valid)return json({error:'Código inválido ou expirado.'},401);
   const token=crypto.randomBytes(32).toString('hex');
   await put(env,'sessions/'+hash(token)+'.json',{email:c.email,createdAt:Date.now(),expiresAt:Date.now()+8*3600000},null);
   return json({ok:true},200,{'set-cookie':COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800'});
  }
  return json({error:'Não foi possível entrar. Tenta novamente.'},409);
 }
 return json({error:'Não encontrado.'},404);
}
async function cleanup(env){
 if(!env.REVIEW_MEDIA||!allowed(env).length)return;
 const position=await env.REVIEW_MEDIA.get('management-auth-cursor'),cursor=position?await position.text():'';
 const batch=await env.REVIEW_MEDIA.list({prefix,limit:50,...(cursor?{cursor}:{})});
 for(const obj of batch.objects){const saved=await env.REVIEW_MEDIA.get(obj.key);if(!saved)continue;const value=JSON.parse(await saved.text());if(value.expiresAt&&value.expiresAt<Date.now()-WINDOW)await env.REVIEW_MEDIA.delete(obj.key);}
 await env.REVIEW_MEDIA.put('management-auth-cursor',batch.truncated?batch.cursor:'');
}
module.exports={identity,handle,cleanup,COOKIE};
