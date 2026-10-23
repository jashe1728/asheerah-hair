'use strict';
const crypto=require('node:crypto');
const security=require('./public-security.cjs');
const {FROM,REPLY}=require('./order-email.cjs');
const SITE='https://asheerahhair.com',ID=/^[a-f0-9-]{36}$/i;
const subKey=id=>'newsletter-subscribers/'+id+'.json';
const draftKey=id=>'newsletter-campaigns/'+id+'.json';
function dailyLimit(env){const value=Number(env.NEWSLETTER_DAILY_LIMIT);return Number.isSafeInteger(value)&&value>=1&&value<=1000?value:20;}
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const site=env=>/^http:\/\/127\.0\.0\.1:\d+$/.test(env.SITE_ORIGIN||'')?env.SITE_ORIGIN:SITE;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
async function read(env,key){const object=await env.REVIEW_MEDIA.get(key);return object?{value:JSON.parse(await object.text()),etag:object.etag}:null;}
async function write(env,key,value,current){const saved=await env.REVIEW_MEDIA.put(key,JSON.stringify(value),{onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});if(!saved)throw Object.assign(Error('Outra pessoa atualizou este conteúdo. Volta a carregar.'),{status:409});return saved;}
function token(env,purpose,id,nonce=''){const key=security.signingSecret(env);if(!key)throw Error('Not configured');return crypto.createHmac('sha256',key).update(purpose+':'+id+':'+nonce).digest('hex');}
function equal(a,b){return /^[a-f0-9]{64}$/.test(a||'')&&crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
function urlFor(env,purpose,subscriber){return site(env)+'/public/newsletter/'+purpose+'?id='+subscriber.id+'&token='+token(env,purpose,subscriber.id,purpose==='confirm'?subscriber.nonce:'');}
function imageUrl(env,id){return site(env)+'/public/newsletter-media/'+id+'?token='+token(env,'image',id);}
const copy={
 pt:{subject:'Confirma a tua inscrição — Asheerah Hair',title:'Um pouco de Asheerah, na tua caixa de entrada.',text:'Recebe novidades, inspiração e lançamentos escolhidos com carinho. Confirma que queres receber os nossos emails.',button:'Confirmar inscrição',ignore:'Se não pediste esta inscrição, ignora este email.',unsubscribe:'Cancelar inscrição',confirmed:'A tua inscrição está confirmada. Bem-vinda à Asheerah Hair!',unsubscribed:'A inscrição foi cancelada. Não receberás mais newsletters.'},
 en:{subject:'Confirm your subscription — Asheerah Hair',title:'A little Asheerah in your inbox.',text:'Receive news, inspiration and carefully chosen launches. Confirm that you would like our emails.',button:'Confirm subscription',ignore:'If you did not request this, simply ignore this email.',unsubscribe:'Unsubscribe',confirmed:'Your subscription is confirmed. Welcome to Asheerah Hair!',unsubscribed:'You have unsubscribed. You will not receive more newsletters.'},
 es:{subject:'Confirma tu suscripción — Asheerah Hair',title:'Un poco de Asheerah en tu correo.',text:'Recibe novedades, inspiración y lanzamientos elegidos con cariño. Confirma que quieres recibir nuestros emails.',button:'Confirmar suscripción',ignore:'Si no solicitaste la suscripción, ignora este email.',unsubscribe:'Cancelar suscripción',confirmed:'Tu suscripción está confirmada. ¡Bienvenida a Asheerah Hair!',unsubscribed:'Tu suscripción ha sido cancelada.'},
 fr:{subject:'Confirmez votre inscription — Asheerah Hair',title:'Un peu d’Asheerah dans votre boîte mail.',text:'Recevez nos nouveautés, inspirations et lancements choisis avec soin. Confirmez votre inscription.',button:'Confirmer mon inscription',ignore:'Si vous n’avez rien demandé, ignorez cet email.',unsubscribe:'Se désinscrire',confirmed:'Votre inscription est confirmée. Bienvenue chez Asheerah Hair !',unsubscribed:'Votre inscription a été annulée.'},
 de:{subject:'Bestätige dein Abonnement — Asheerah Hair',title:'Ein wenig Asheerah in deinem Postfach.',text:'Erhalte Neuigkeiten, Inspiration und liebevoll ausgewählte Neuheiten. Bestätige dein Abonnement.',button:'Abonnement bestätigen',ignore:'Falls du dies nicht angefordert hast, ignoriere diese E-Mail.',unsubscribe:'Abmelden',confirmed:'Dein Abonnement ist bestätigt. Willkommen bei Asheerah Hair!',unsubscribed:'Du wurdest vom Newsletter abgemeldet.'},
 it:{subject:'Conferma la tua iscrizione — Asheerah Hair',title:'Un po’ di Asheerah nella tua posta.',text:'Ricevi novità, ispirazione e lanci scelti con cura. Conferma che desideri ricevere le nostre email.',button:'Conferma iscrizione',ignore:'Se non hai richiesto l’iscrizione, ignora questa email.',unsubscribe:'Annulla iscrizione',confirmed:'La tua iscrizione è confermata. Benvenuta in Asheerah Hair!',unsubscribed:'La tua iscrizione è stata annullata.'}
};
function frame(title,body,footer=''){return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title></head><body style="margin:0;background:#f5eee6;color:#493426;font-family:Arial,sans-serif"><table role="presentation" width="100%" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fffaf4;border-radius:20px;overflow:hidden"><tr><td align="center" style="padding:32px"><img width="120" src="'+SITE+'/assets/logo-sm.png" alt="Asheerah Hair"></td></tr><tr><td style="padding:0 28px 30px"><h1 style="font-family:Georgia,serif;font-size:30px;line-height:1.2">'+escape(title)+'</h1>'+body+'</td></tr><tr><td style="padding:24px;background:#eadbcb;text-align:center;font-size:13px;line-height:1.8">Asheerah Hair · '+escape(REPLY)+'<br>'+footer+'</td></tr></table></td></tr></table></body></html>';}
function render(env,campaign,subscriber){const text=copy[subscriber?.language||campaign.language]||copy.pt;const unsubscribe=subscriber?urlFor(env,'unsubscribe',subscriber):'#';const blocks=campaign.text.split(/\n\s*\n/).map(p=>'<p style="font-size:16px;line-height:1.8">'+escape(p).replace(/\n/g,'<br>')+'</p>').join('');const images=campaign.images.map((id,index)=>'<p><img src="'+escape(imageUrl(env,id))+'" alt="'+escape(campaign.imageAlts?.[index]||campaign.title)+'" width="544" style="display:block;width:100%;height:auto;border-radius:14px"></p>').join('');const button=campaign.buttonLabel&&campaign.buttonUrl?'<p style="margin-top:28px"><a href="'+escape(campaign.buttonUrl)+'" style="display:inline-block;padding:16px 24px;border-radius:30px;background:#69462f;color:#fffaf4;text-decoration:none">'+escape(campaign.buttonLabel)+'</a></p>':'';return frame(campaign.title,images+blocks+button,'<a href="'+escape(unsubscribe)+'" style="color:#493426">'+text.unsubscribe+'</a>').replace(SITE+'/assets/logo-sm.png',site(env)+'/assets/logo-sm.png');}
async function mail(env,payload,id){if(!env.RESEND_API_KEY)throw Error('Email not configured');const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:FROM,reply_to:REPLY,...payload})});let data;try{data=await response.json();}catch{}if(!response.ok||!data?.id)throw Object.assign(Error('O serviço de email está temporariamente indisponível.'),{status:response.status===429?429:502});return data.id;}
async function subscribe(env,email,language='pt'){
 if(env.NEWSLETTER_ENABLED!=='1'||!env.REVIEW_MEDIA||!env.RESEND_API_KEY)throw Object.assign(Error('Newsletter service is not configured'),{status:503});
 const address=email.toLowerCase().trim(),indexKey='newsletter-addresses/'+token(env,'address',address)+'.json';
 let index=await read(env,indexKey);
 if(!index){const candidate={id:crypto.randomUUID()};try{await write(env,indexKey,candidate,null);index={value:candidate};}catch(error){if(error.status!==409)throw error;index=await read(env,indexKey);}}
 const id=index.value.id,current=await read(env,subKey(id));
 if(current?.value.status==='active'||current?.value.status==='pending'&&Date.now()-Date.parse(current.value.requestedAt)<600000)return {ok:true,confirmationRequired:true};
 await security.take(env,'subscription-confirmation-mail:daily',30,86400000);
 const subscriber={id,email:address,language:copy[language]?language:'pt',status:'pending',nonce:crypto.randomUUID(),requestedAt:new Date().toISOString()};
 await write(env,subKey(id),subscriber,current);
 const text=copy[subscriber.language],link=urlFor(env,'confirm',subscriber);
 try{await mail(env,{to:[address],subject:text.subject,html:frame(text.title,'<p style="line-height:1.8">'+text.text+'</p><p><a href="'+escape(link)+'">'+text.button+'</a></p><p style="font-size:13px">'+text.ignore+'</p>'),text:text.text+'\n'+link+'\n'+text.ignore},'newsletter-optin/'+id+'/'+subscriber.nonce);}catch(error){const latest=await read(env,subKey(id));if(latest?.value.nonce===subscriber.nonce)await write(env,subKey(id),{...subscriber,requestedAt:new Date(0).toISOString()},latest);throw error;}
 return {ok:true,confirmationRequired:true};
}
function page(title,body){return new Response(frame(title,body),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':"default-src 'none'; img-src https://asheerahhair.com; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});}
async function publicHandle(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(path.startsWith('/public/newsletter-media/')){
  const id=path.split('/').pop();if(!ID.test(id)||!equal(url.searchParams.get('token'),token(env,'image',id)))return new Response(null,{status:404});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
  const image=await env.REVIEW_MEDIA?.get('newsletter-media/'+id);if(!image)return new Response(null,{status:404});
  return new Response(request.method==='HEAD'?null:image.body,{headers:{'content-type':image.httpMetadata.contentType,'cache-control':'public, max-age=86400','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'"}});
 }
 if(!['/public/newsletter/confirm','/public/newsletter/unsubscribe'].includes(path))return json({error:'Not found'},404);
 if(!['GET','POST'].includes(request.method))return new Response(null,{status:405});
 const id=url.searchParams.get('id');if(!ID.test(id||'')||!env.REVIEW_MEDIA)return page('Asheerah Hair','<p>Este link não está disponível.</p>');
 const current=await read(env,subKey(id));if(!current)return page('Asheerah Hair','<p>Este link não está disponível.</p>');
 const sub=current.value,purpose=path.endsWith('/confirm')?'confirm':'unsubscribe';
 if(!equal(url.searchParams.get('token'),token(env,purpose,id,purpose==='confirm'?sub.nonce:'')))return json({error:'Invalid link'},403);
 const text=copy[sub.language]||copy.pt;
 if(purpose==='unsubscribe'&&sub.status==='unsubscribed')return page('Asheerah Hair','<p>'+escape(text.unsubscribed)+'</p>');
 if(request.method==='GET')return page(purpose==='confirm'?text.subject:text.unsubscribe,'<form method="post"><button style="background:#69462f;color:#fffaf4;border:0;padding:16px 24px;border-radius:24px;font-size:16px" type="submit">'+escape(purpose==='confirm'?text.button:text.unsubscribe)+'</button></form>');
 // No mutation on GET: email link scanners cannot opt somebody in or cancel a subscription.
 if(purpose==='confirm'&&(sub.status!=='pending'||Date.now()-Date.parse(sub.requestedAt)>48*3600000))return page(text.subject,'<p>Este link expirou ou já foi utilizado. Podes voltar a inscrever-te no site.</p>');
 const next={...sub,status:purpose==='confirm'?'active':'unsubscribed',[purpose==='confirm'?'confirmedAt':'unsubscribedAt']:new Date().toISOString()};
 await write(env,subKey(id),next,current);
 return page('Asheerah Hair','<p>'+escape(purpose==='confirm'?text.confirmed:text.unsubscribed)+'</p>');
}
async function allSubscribers(env){const values=[];let cursor;do{const batch=await env.REVIEW_MEDIA.list({prefix:'newsletter-subscribers/',limit:100,...(cursor?{cursor}:{})});for(const item of batch.objects){const sub=await read(env,item.key);if(sub)values.push(sub.value);}if(values.length>1000)throw Object.assign(Error('A lista precisa de revisão técnica antes de enviar mais de 1000 inscrições.'),{status:409});cursor=batch.truncated?batch.cursor:null;}while(cursor);return values;}
function validate(input){
 if(!input||typeof input.title!=='string'||!input.title.trim()||input.title.length>160||typeof input.text!=='string'||!input.text.trim()||input.text.length>12000||!Array.isArray(input.images)||input.images.length>3||input.images.some(id=>!ID.test(id)))throw Object.assign(Error('Indica um título, texto e até 3 imagens.'),{status:400});
 if(input.buttonUrl){let u;try{u=new URL(input.buttonUrl);}catch{}if(!u||u.protocol!=='https:'||!['asheerahhair.com','www.asheerahhair.com'].includes(u.hostname)||u.username||u.password)throw Object.assign(Error('O botão deve abrir uma página segura do site Asheerah Hair.'),{status:400});}
 return {title:input.title.trim(),text:input.text.trim(),images:input.images,language:copy[input.language]?input.language:'pt',buttonLabel:String(input.buttonLabel||'').slice(0,60),buttonUrl:String(input.buttonUrl||'').slice(0,1000),imageAlts:Array.isArray(input.imageAlts)?input.imageAlts.slice(0,3).map(s=>String(s).slice(0,160)):[]};
}
async function handle(request,env,user){
 const url=new URL(request.url),path=url.pathname.replace('/management-api/newsletter','');
 if(!env.REVIEW_MEDIA)return json({error:'Serviço indisponível.'},503);
 if(request.method!=='GET'&&(request.headers.get('Origin')!==url.origin))return json({error:'Pedido inválido.'},403);
 try{
  if(request.method==='GET'&&path===''){
   const batch=await env.REVIEW_MEDIA.list({prefix:'newsletter-campaigns/',limit:100});
   const campaigns=[];for(const obj of batch.objects){const c=await read(env,obj.key);if(c){const {audience,...safe}=c.value;campaigns.push(safe);}}
   const subscribers=await allSubscribers(env);
   return json({campaigns:campaigns.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),subscribers:{active:subscribers.filter(s=>s.status==='active').length,pending:subscribers.filter(s=>s.status==='pending').length},enabled:env.NEWSLETTER_ENABLED==='1',dailyLimit:dailyLimit(env)});
  }
  const preview=path.match(/^\/preview\/([a-f0-9-]{36})$/i);
  if(request.method==='GET'&&preview){const saved=await read(env,draftKey(preview[1]));if(!saved)return json({error:'Não encontrado.'},404);return new Response(render(env,saved.value),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'",'referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});}
  const image=path.match(/^\/image\/([a-f0-9-]{36})$/i);
  if(request.method==='GET'&&image){const saved=await env.REVIEW_MEDIA.get('newsletter-media/'+image[1]);if(!saved)return json({error:'Não encontrado.'},404);return new Response(saved.body,{headers:{'content-type':saved.httpMetadata.contentType,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});}
  if(request.method==='POST'&&path==='/images'){
   const type=(request.headers.get('Content-Type')||'').split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(type))return json({error:'Usa uma imagem JPEG, PNG ou WebP.'},415);
   if(Number(request.headers.get('Content-Length')||0)>3*1024*1024)return json({error:'A imagem deve ter até 3 MB.'},413);
   const data=new Uint8Array(await request.arrayBuffer());if(!data.length||data.length>3*1024*1024)return json({error:'A imagem deve ter até 3 MB.'},413);
   const valid=type==='image/jpeg'?data[0]===255&&data[1]===216&&data[2]===255:type==='image/png'?Buffer.from(data.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])):Buffer.from(data.subarray(0,4)).toString()==='RIFF'&&Buffer.from(data.subarray(8,12)).toString()==='WEBP';
   if(!valid)return json({error:'O conteúdo não corresponde ao formato da imagem.'},415);
   await security.take(env,'newsletter-image-uploads:daily',30,86400000);
   const id=crypto.randomUUID();await env.REVIEW_MEDIA.put('newsletter-media/'+id,data,{httpMetadata:{contentType:type,cacheControl:'private, no-store'}});return json({id,url:imageUrl(env,id)},201);
  }
  if(request.method!=='POST')return json({error:'Não encontrado.'},404);
  if((request.headers.get('Content-Type')||'').split(';')[0]!=='application/json')return json({error:'Pedido inválido.'},415);
  const raw=await request.text();if(Buffer.byteLength(raw)>20000)return json({error:'Texto demasiado longo.'},413);
  let input;try{input=JSON.parse(raw);}catch{return json({error:'Pedido inválido.'},400);}
  if(path==='/draft'){
   const value=validate(input);let current=null;const id=input.id||crypto.randomUUID();if(!ID.test(id))return json({error:'Rascunho inválido.'},400);
   if(input.id){current=await read(env,draftKey(id));if(!current||current.value.status!=='draft'||current.value.version!==input.version)return json({error:'Atualiza o rascunho antes de continuar. Campanhas em envio não podem ser alteradas.'},409);}
   for(const image of value.images){if(!await env.REVIEW_MEDIA.get('newsletter-media/'+image))return json({error:'Imagem não encontrada.'},400);}
   const campaign={...value,id,status:'draft',version:(current?.value.version||0)+1,createdAt:current?.value.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),updatedBy:user};await write(env,draftKey(id),campaign,current);return json({campaign});
  }
  if(!ID.test(input.id||''))return json({error:'Campanha inválida.'},400);
  const current=await read(env,draftKey(input.id));if(!current||current.value.version!==input.version)return json({error:'Atualiza a campanha antes de continuar.'},409);
  const campaign=current.value;
  if(path==='/test'){
   await security.take(env,'newsletter-tests:daily',10,86400000);
   await mail(env,{to:[user],subject:'[TESTE] '+campaign.title,html:render(env,campaign),text:campaign.text},'newsletter-test/'+campaign.id+'/'+crypto.randomUUID());return json({ok:true});
  }
  if(path==='/send'){
   if(env.NEWSLETTER_ENABLED!=='1')return json({error:'O envio ainda não está configurado.'},503);
   const audience=(await allSubscribers(env)).filter(s=>s.status==='active');
   if(campaign.status!=='draft'||input.acknowledged!==true||input.expectedRecipients!==audience.length||!audience.length)return json({error:'Confirma o número atual de inscrições antes de enviar.'},409);
   const next={...campaign,status:'queued',audience:audience.map(s=>s.id),cursor:0,sent:0,failed:0,skipped:0,version:campaign.version+1,queuedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
   // Prepare the marker first: a failed marker write must leave a retryable draft, never an invisible queued campaign.
   await env.REVIEW_MEDIA.put('newsletter-queue/'+next.id,JSON.stringify({id:next.id,at:new Date().toISOString()}));await write(env,draftKey(next.id),next,current);const {audience:privateAudience,...safe}=next;return json({campaign:safe});
  }
  if(path==='/pause'&&['queued','sending'].includes(campaign.status)){const {audience,...safe}=campaign;await write(env,draftKey(campaign.id),{...campaign,status:'paused',version:campaign.version+1},current);return json({campaign:{...safe,status:'paused',version:campaign.version+1}});}
  if(path==='/resume'&&campaign.status==='paused'&&!campaign.lastError&&input.acknowledged===true){await env.REVIEW_MEDIA.put('newsletter-queue/'+campaign.id,JSON.stringify({id:campaign.id,at:new Date().toISOString()}));await write(env,draftKey(campaign.id),{...campaign,status:'queued',version:campaign.version+1},current);return json({ok:true});}
  return json({error:'Ação indisponível.'},409);
 }catch(error){return json({error:error.status?error.message:'Não foi possível concluir. Tenta novamente.'},error.status||502);}
}
async function processQueue(env){
 if(env.NEWSLETTER_ENABLED!=='1'||!env.REVIEW_MEDIA||!env.RESEND_API_KEY)return;
 const position=await env.REVIEW_MEDIA.get('newsletter-queue-cursor'),cursor=position?await position.text():'';
 const queue=await env.REVIEW_MEDIA.list({prefix:'newsletter-queue/',limit:5,...(cursor?{cursor}:{})});
 // Advance even when every campaign in a page is paused; earlier keys cannot starve later work.
 await env.REVIEW_MEDIA.put('newsletter-queue-cursor',queue.truncated?queue.cursor:'');
 for(const entry of queue.objects){
  const id=entry.key.split('/').pop();let current=await read(env,draftKey(id));if(!current||!['queued','sending'].includes(current.value.status))continue;
  const lockKey='newsletter-locks/'+id,currentLock=await read(env,lockKey);if(currentLock&&currentLock.value.until>Date.now())continue;
  try{await write(env,lockKey,{until:Date.now()+120000},currentLock);}catch{continue;}
  try{
   for(let count=0;count<5;count++){
    current=await read(env,draftKey(id));const c=current.value;if(!['queued','sending'].includes(c.status))break;
    if(c.cursor>=c.audience.length){await write(env,draftKey(id),{...c,status:'completed',completedAt:new Date().toISOString()},current);await env.REVIEW_MEDIA.delete(entry.key);break;}
    const sid=c.audience[c.cursor],subscriber=await read(env,subKey(sid)),jobKey='newsletter-delivery/'+id+'/'+sid+'.json';let job=await read(env,jobKey),result=job?.value.status;
    if(!['sent','failed','skipped'].includes(result)){
     if(!subscriber||subscriber.value.status!=='active')result='skipped';
     else{
      if(!job){const sub=subscriber.value,unsubscribe=urlFor(env,'unsubscribe',sub);await write(env,jobKey,{status:'prepared',at:new Date().toISOString(),payload:{to:[sub.email],subject:c.title,html:render(env,c,sub),text:c.text+'\n\n'+(copy[sub.language]||copy.pt).unsubscribe+': '+unsubscribe,headers:{'List-Unsubscribe':'<'+unsubscribe+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}},null);job=await read(env,jobKey);}
      if(job.value.attemptedAt&&Date.now()-Date.parse(job.value.attemptedAt)>23*3600000){await write(env,draftKey(id),{...c,status:'paused',lastError:'Uma entrega precisa de revisão para evitar envios duplicados.'},current);break;}
      try{
       await security.take(env,'newsletter-campaign-mail:daily',dailyLimit(env),86400000);
       if(!job.value.attemptedAt){await write(env,jobKey,{...job.value,attemptedAt:new Date().toISOString()},job);job=await read(env,jobKey);}
       await mail(env,job.value.payload,'newsletter/'+id+'/'+sid);result='sent';
      }
      // A network failure may follow provider acceptance. Keep the same frozen payload/key for a safe retry.
      catch{break;}
     }
     await write(env,jobKey,{status:result,at:job?.value.at||new Date().toISOString()},job);
    }
    await write(env,draftKey(id),{...c,status:'sending',cursor:c.cursor+1,[result]:c[result]+1,updatedAt:new Date().toISOString()},current);
   }
  }finally{const lock=await read(env,lockKey);if(lock)await write(env,lockKey,{until:0},lock);}
 }
}
module.exports={handle,publicHandle,subscribe,processQueue,render,validate,token,urlFor,allSubscribers,mail};
