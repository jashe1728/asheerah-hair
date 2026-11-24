// Local test entry only. Never referenced by backend/worker.mjs or live config.
import actualWorker from '../backend/worker.mjs';
import auth from '../backend/management-auth.cjs';
import crypto from 'node:crypto';
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);if(url.hostname!=='127.0.0.1')return new Response('Loopback only',{status:403});
  if(request.method==='POST'&&url.pathname==='/__demo/start'&&request.headers.get('origin')===url.origin){
   for(const [index,language] of ['pt','en','es','fr','de','it'].entries()){
    const id='00000000-0000-4000-8000-00000000de0'+(index+1),order={version:1,id,createdAt:'2026-11-24T10:00:00Z',language,method:'manual_dashboard',status:'awaiting_payment',manualRequestHash:'a'.repeat(64),customer:{name:'Cliente Demonstração '+language,email:language+'@example.invalid',phone:'+000000000',address:'Rua Fictícia 12',city:'Lisboa',postalCode:'0000-000',country:'PT'},items:[{qty:1,title:'Lamara Chocolate',variant:'26″ · HD Lace · Cap M',unitCents:15000,image:'/assets/logo-sm.png'}],subtotalCents:15000,discountCents:0,shippingCents:1000,totalCents:16000,fulfillmentMethod:'delivery',fulfillmentAddress:'Rua Fictícia 12, Lisboa, PT'};
    const key='business-orders/'+id+'.json';if(!await env.REVIEW_MEDIA.get(key)){
     await env.REVIEW_MEDIA.put(key,JSON.stringify(order));await env.REVIEW_MEDIA.put('business-operations/'+id+'.json',JSON.stringify({version:0,stage:'courier_accepted',tracking:'',notes:'SYNTHETIC LOCAL ONLY',events:[],paymentConfirmation:{amountCents:order.totalCents,orderDigest:crypto.createHash('sha256').update(JSON.stringify(order)).digest('hex'),reference:'FAKE RECEIPT',by:'operator@example.invalid',at:order.createdAt}}));
    }
   }
   await env.REVIEW_MEDIA.put('business-backfill-complete','synthetic');
   const token=crypto.randomBytes(32).toString('hex');await env.REVIEW_MEDIA.put('management-auth/sessions/'+crypto.createHash('sha256').update(token).digest('hex')+'.json',JSON.stringify({email:'operator@example.invalid',createdAt:Date.now(),lastActiveAt:Date.now(),idleMinutes:30,expiresAt:Date.now()+3600000}));
   return new Response('Synthetic local session ready',{headers:{'Set-Cookie':auth.COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict','Cache-Control':'no-store'}});
  }
  if(url.pathname.startsWith('/management-api/'))return actualWorker.fetch(request,env,ctx);
  if(request.method==='GET'&&url.pathname.startsWith('/gestao/')||request.method==='GET'&&url.pathname.startsWith('/assets/')){
   const r=await env.ASSETS.fetch(request),headers=new Headers(r.headers);headers.set('Cache-Control','no-store');headers.set('X-Frame-Options','DENY');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");return new Response(r.body,{status:r.status,headers});
  }
  return new Response('Local test harness: only dashboard assets and management API are allowed.',{status:404});
 }
};
