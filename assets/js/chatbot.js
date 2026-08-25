/* Asheerah Hair — warm, deterministic three-tier website assistant. */
'use strict';

const CHAT_HUMAN_ONLY = [
  'damaged','damage','wrong item','wrong order','defective','faulty','broken',
  'complaint','complain','not what i ordered','lace torn','chargeback',
  'custom order problem','custom order issue'
];
const CHAT_STOP_WORDS = new Set([
  'a','an','and','are','can','do','does','for','have','how','i','in','is','it','me',
  'my','of','on','or','the','this','to','what','when','where','with','you','your'
]);
const CHAT_SESSION = 'AH-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + Math.random().toString(36).slice(2,5).toUpperCase();
const CHAT_STATE = { entries:[], transcript:[], ready:false };

function chatNormalize(value){
  return String(value||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/×/g,'x')
    .replace(/[^a-z0-9€x\s]/g,' ').replace(/\s+/g,' ').trim();
}
function chatTokens(value){
  return chatNormalize(value).split(' ').filter(word=>word.length>1&&!CHAT_STOP_WORDS.has(word));
}
function chatHumanOnly(message){
  const text=chatNormalize(message);
  return CHAT_HUMAN_ONLY.some(phrase=>text.includes(chatNormalize(phrase)));
}
function chatScore(message,entry){
  const text=chatNormalize(message);
  const messageTokens=new Set(chatTokens(text));
  let score=0;
  (entry.triggers||[]).forEach(raw=>{
    const trigger=chatNormalize(raw);
    if(!trigger)return;
    if(text===trigger) score+=12;
    else if(text.includes(trigger)) score+=trigger.includes(' ')?8:4;
    else score+=chatTokens(trigger).filter(word=>messageTokens.has(word)).length;
  });
  return {entry,score};
}

function chatRoute(message){
  const simple=chatNormalize(message);
  if(/^(hi|hello|hey|good morning|good afternoon|good evening)$/.test(simple)) return {
    kind:'answer',tier:1,reason:'greeting',
    reply:"Hi lovely 🤍 Ask me about the hair, prices, payment, shipping, returns, care, customization, stock, or ordering."
  };
  if(/^(thank you|thanks|thank you so much|thanks so much)$/.test(simple)) return {
    kind:'answer',tier:1,reason:'thanks',reply:"You’re very welcome 🤍 I’m here if you need anything else."
  };
  if(/^(bye|goodbye|see you)$/.test(simple)) return {
    kind:'answer',tier:1,reason:'goodbye',reply:"Take care 🤍 We’re here whenever you need us."
  };
  if(chatHumanOnly(message)) return {
    kind:'handoff',tier:3,reason:'human_only_signal',
    reply:"I’m sorry this has happened. I don’t want you to have to explain it twice. Tap below and I’ll carry this chat into WhatsApp so the owner can look after it personally."
  };
  if(/\b(owner|person|human|speak to|talk to)\b/i.test(message)) return {
    kind:'handoff',tier:3,reason:'customer_requested_owner',
    reply:"Of course. Tap below and I’ll carry this chat into WhatsApp for the owner."
  };
  const ranked=CHAT_STATE.entries.map(entry=>chatScore(message,entry))
    .filter(result=>result.score>0).sort((a,b)=>b.score-a.score);
  const best=ranked[0],second=ranked[1];
  if(!best||best.score<4) return chatUnknown('low_confidence',best);
  if(second&&best.score-second.score<2&&best.entry.id!==second.entry.id){
    return chatUnknown('ambiguous',best,second);
  }
  const entry=best.entry;
  if(entry.status!=='approved'||!String(entry.answer||'').trim()){
    return chatUnknown('answer_not_approved',best);
  }
  if(Number(entry.tier)===3) return {
    kind:'handoff',tier:3,reason:'tier_3',matchedId:entry.id,
    reply:"I’m bringing the owner into this so she can look after it personally. Tap below and your recent chat will be ready to send in WhatsApp."
  };
  if(Number(entry.tier)===2) return {
    kind:'answer_and_handoff',tier:2,reason:'owner_confirmation_required',matchedId:entry.id,
    reply:entry.answer,
    followUp:"That’s the general information. For the exact price, stock, customs, installment, or custom detail, tap below and I’ll carry this chat to the owner so you don’t need to repeat it."
  };
  return {kind:'answer',tier:1,reason:'approved_match',matchedId:entry.id,reply:entry.answer};
}
function chatUnknown(reason,best,second){
  return {
    kind:'handoff',tier:3,reason,
    matchedId:best&&best.entry?best.entry.id:'',
    possibleSecondId:second&&second.entry?second.entry.id:'',
    reply:"I don’t want to guess and give you the wrong information. Tap below and I’ll carry your question and this chat into WhatsApp for the owner. You won’t need to type it all again."
  };
}

async function chatLoadKnowledge(){
  try{
    const script=document.currentScript||Array.from(document.scripts).find(item=>/chatbot\.js(?:\?|$)/.test(item.src));
    const url=new URL('../data/chatbot-kb.json',script.src);
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error('Knowledge base unavailable');
    const data=await response.json();
    CHAT_STATE.entries=Array.isArray(data.entries)?data.entries:[];
    CHAT_STATE.ready=true;
  }catch(error){
    CHAT_STATE.entries=[];
    CHAT_STATE.ready=false;
    console.warn('Asheerah assistant is safely in handoff-only mode:',error.message);
  }
}

let chatOpen=false;
function toggleChat(){
  chatOpen=!chatOpen;
  const windowEl=document.getElementById('chatWindow');
  const launcher=document.querySelector('.chat-btn');
  if(!windowEl)return;
  windowEl.classList.toggle('open',chatOpen);
  windowEl.setAttribute('aria-hidden',String(!chatOpen));
  if(launcher)launcher.setAttribute('aria-expanded',String(chatOpen));
  if(chatOpen){const input=document.getElementById('chatInput');if(input)input.focus();}
}
function chatAdd(role,text){
  const body=document.getElementById('chatBody');
  if(!body)return;
  const div=document.createElement('div');
  div.className='msg '+role;
  div.textContent=text;
  body.appendChild(div);
  CHAT_STATE.transcript.push({role,text});
  CHAT_STATE.transcript=CHAT_STATE.transcript.slice(-8);
  body.scrollTop=body.scrollHeight;
}
function botSay(text){chatAdd('bot',text);}
function userSay(text){chatAdd('user',text);}

function chatHandoffButton(question){
  const body=document.getElementById('chatBody');
  if(!body)return;
  const number=String((window.CONFIG&&CONFIG.whatsapp)||'351914522508').replace(/\D/g,'');
  const transcript=CHAT_STATE.transcript.slice(-6)
    .map(item=>(item.role==='user'?'Customer':'Website helper')+': '+item.text).join('\n');
  const text=[
    'Hi, I was using the Asheerah Hair website chat.',
    'Reference: '+CHAT_SESSION,
    'Page: '+location.href,
    'My question: '+question,
    '',
    'Recent chat:',transcript
  ].join('\n');
  const link=document.createElement('a');
  link.className='chat-handoff';
  link.href='https://wa.me/'+number+'?text='+encodeURIComponent(text);
  link.target='_blank';
  link.rel='noopener';
  link.textContent='Continue with the owner on WhatsApp';
  body.appendChild(link);
  body.scrollTop=body.scrollHeight;
}

function chatLog(result,question){
  const endpoint=window.CONFIG&&CONFIG.backendURL;
  if(!endpoint)return;
  const transcript=CHAT_STATE.transcript.slice(-6)
    .map(item=>(item.role==='user'?'Customer':'Website helper')+': '+item.text).join('\n');
  fetch(endpoint,{
    method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},keepalive:true,
    body:JSON.stringify({
      type:'chat_log',timestamp:new Date().toISOString(),sessionId:CHAT_SESSION,
      page:location.pathname,question:question.slice(0,500),route:result.kind,tier:result.tier,
      reason:result.reason,matchedId:result.matchedId||'',transcript:transcript.slice(0,2500)
    })
  }).catch(()=>{});
}

function sendChat(text){
  const input=document.getElementById('chatInput');
  const message=String(text||(input&&input.value)||'').trim();
  if(!message)return;
  userSay(message);
  if(input)input.value='';
  const result=CHAT_STATE.ready?chatRoute(message):chatUnknown('knowledge_unavailable');
  setTimeout(()=>{
    botSay(result.reply);
    if(result.followUp)botSay(result.followUp);
    if(result.kind==='handoff'||result.kind==='answer_and_handoff'){
      chatHandoffButton(message);
      chatLog(result,message);
    }
  },250);
}
function quickAsk(question){sendChat(question);}

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
  const chatWindow=document.getElementById('chatWindow');
  const input=document.getElementById('chatInput');
  const launcher=document.querySelector('.chat-btn');
  if(chatWindow){
    chatWindow.setAttribute('role','dialog');
    chatWindow.setAttribute('aria-label','Asheerah Hair website assistant');
    chatWindow.setAttribute('aria-hidden','true');
  }
  if(launcher){launcher.setAttribute('aria-controls','chatWindow');launcher.setAttribute('aria-expanded','false');}
  if(input)input.setAttribute('maxlength','500');
  await chatLoadKnowledge();
  const body=document.getElementById('chatBody');
  if(body&&!body.children.length){
    botSay("Hi lovely 🤍 What can I help you with? I’ll answer when I’m certain, and take you to the owner when I’m not.");
    const note=document.createElement('p');
    note.className='chat-safety';
    note.textContent='Please don’t share card details, passwords, PINs, or security codes here.';
    body.appendChild(note);
  }
});

if(typeof module==='object'&&module.exports){
  module.exports={chatNormalize,chatScore,chatHumanOnly,chatRoute,chatUnknown,CHAT_STATE};
}
