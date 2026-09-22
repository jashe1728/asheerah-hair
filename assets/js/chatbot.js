/* Asheerah Hair — multilingual, deterministic three-tier website assistant. */
'use strict';

const CHAT_STOP_WORDS=new Set(['a','an','and','are','can','do','does','for','have','how','i','in','is','it','me','my','of','on','or','the','this','to','what','when','where','with','you','your']);
const CHAT_SESSION='AH-'+Date.now().toString(36).toUpperCase().slice(-6)+'-'+Math.random().toString(36).slice(2,5).toUpperCase();
const CHAT_STATE={entries:[],locales:{},transcript:[],ready:false};
const CHAT_QUICK_QUESTIONS={
  en:{hair:'What type of hair do you sell?',shipping:'How long does shipping take?',returns:'Do you accept returns?',contact:'How do I contact you?'},
  pt:{hair:'Que tipos de cabelo vendem?',shipping:'Quanto tempo demora a entrega?',returns:'Qual é a política de devolução?',contact:'Como posso contactar-vos?'},
  es:{hair:'¿Qué tipos de cabello venden?',shipping:'¿Cuánto tarda el envío?',returns:'¿Cuál es la política de devoluciones?',contact:'¿Cómo puedo contactarles?'},
  de:{hair:'Welche Haartypen verkauft ihr?',shipping:'Wie lange dauert der Versand?',returns:'Wie ist die Rückgaberichtlinie?',contact:'Wie kann ich euch kontaktieren?'},
  fr:{hair:'Quels types de cheveux vendez-vous ?',shipping:'Combien de temps prend la livraison ?',returns:'Quelle est la politique de retour ?',contact:'Comment puis-je vous contacter ?'},
  it:{hair:'Quali tipi di capelli vendete?',shipping:'Quanto tempo richiede la spedizione?',returns:'Qual è la politica di reso?',contact:'Come posso contattarvi?'}
};

function chatLang(){return typeof LANG!=='undefined'&&['pt','en','es','de','fr','it'].includes(LANG)?LANG:'pt';}
function chatLocale(){return CHAT_STATE.locales[chatLang()]||CHAT_STATE.locales.en||{ui:{},entries:{}};}
function chatText(key){return chatLocale().ui[key]||((CHAT_STATE.locales.en||{}).ui||{})[key]||key;}
function chatEntryLocale(entry){return (chatLocale().entries||{})[entry.id]||{};}
function chatEntryTriggers(entry){return chatLang()==='en'?(entry.triggers||[]):(chatEntryLocale(entry).triggers||[]);}
function chatEntryAnswer(entry){return chatLang()==='en'?entry.answer:(chatEntryLocale(entry).answer||'');}
function chatNormalize(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/×/g,'x').replace(/[^a-z0-9€x\s]/g,' ').replace(/\s+/g,' ').trim();}
function chatTokens(value){return chatNormalize(value).split(' ').filter(word=>word.length>1&&!CHAT_STOP_WORDS.has(word));}
function chatPhraseMatch(message,list){const text=' '+chatNormalize(message)+' ';return (list||[]).some(phrase=>text.includes(' '+chatNormalize(phrase)+' '));}
function chatHumanOnly(message){return chatPhraseMatch(message,chatLocale().humanOnly);}
function chatScore(message,entry){
  const text=chatNormalize(message),messageTokens=new Set(chatTokens(text));let score=0;
  chatEntryTriggers(entry).forEach(raw=>{const trigger=chatNormalize(raw);if(!trigger)return;if(text===trigger)score+=12;else if(text.includes(trigger))score+=trigger.includes(' ')?8:4;else{const triggerTokens=chatTokens(trigger),overlap=triggerTokens.filter(word=>messageTokens.has(word)).length;score+=triggerTokens.length>1&&overlap===triggerTokens.length?6:overlap;}});
  return {entry,score};
}
function chatRoute(message){
  const simple=chatNormalize(message),locale=chatLocale();
  if((locale.greetings||[]).map(chatNormalize).includes(simple))return {kind:'answer',tier:1,reason:'greeting',reply:chatText('greetingReply')};
  if((locale.thanks||[]).map(chatNormalize).includes(simple))return {kind:'answer',tier:1,reason:'thanks',reply:chatText('thanksReply')};
  if((locale.goodbyes||[]).map(chatNormalize).includes(simple))return {kind:'answer',tier:1,reason:'goodbye',reply:chatText('goodbyeReply')};
  if(chatHumanOnly(message))return {kind:'handoff',tier:3,reason:'human_only_signal',reply:chatText('humanOnly')};
  if(chatPhraseMatch(message,locale.ownerPhrases))return {kind:'handoff',tier:3,reason:'customer_requested_owner',reply:chatText('ownerRequested')};
  const ranked=CHAT_STATE.entries.map(entry=>chatScore(message,entry)).filter(result=>result.score>0).sort((a,b)=>b.score-a.score);
  const best=ranked[0],second=ranked[1];
  if(!best||best.score<4)return chatUnknown('low_confidence',best);
  if(second&&best.score-second.score<2&&best.entry.id!==second.entry.id)return chatUnknown('ambiguous',best,second);
  const entry=best.entry,answer=chatEntryAnswer(entry);
  if(entry.status!=='approved'||!String(answer).trim())return chatUnknown('answer_not_approved',best);
  if(Number(entry.tier)===3)return {kind:'handoff',tier:3,reason:'tier_3',matchedId:entry.id,reply:chatText('tier3')};
  if(Number(entry.tier)===2)return {kind:'answer_and_handoff',tier:2,reason:'owner_confirmation_required',matchedId:entry.id,reply:answer,followUp:chatText('tier2FollowUp')};
  return {kind:'answer',tier:1,reason:'approved_match',matchedId:entry.id,reply:answer};
}
function chatUnknown(reason,best,second){return {kind:'handoff',tier:3,reason,matchedId:best&&best.entry?best.entry.id:'',possibleSecondId:second&&second.entry?second.entry.id:'',reply:chatText('unknown')};}

async function chatLoadKnowledge(){
  try{
    const script=document.currentScript||Array.from(document.scripts).find(item=>/chatbot\.js(?:\?|$)/.test(item.src));
    const responses=await Promise.all([
      fetch(new URL('../data/chatbot-kb.json',script.src),{cache:'no-store'}),
      fetch(new URL('../data/chatbot-locales.json',script.src),{cache:'no-store'})
    ]);
    if(!responses[0].ok||!responses[1].ok)throw new Error('Knowledge base unavailable');
    const data=await responses[0].json();CHAT_STATE.locales=await responses[1].json();
    CHAT_STATE.entries=Array.isArray(data.entries)?data.entries:[];CHAT_STATE.ready=true;
  }catch(error){CHAT_STATE.entries=[];CHAT_STATE.ready=false;console.warn('Asheerah assistant is safely in handoff-only mode:',error.message);}
}

let chatOpen=false;
function toggleChat(force){
  const win=document.getElementById('chatWindow'),launcher=document.querySelector('.chat-btn');
  if(!win)return;
  const nextOpen=typeof force==='boolean'?force:!win.classList.contains('open');
  chatOpen=nextOpen;
  if(nextOpen){
    win.hidden=false;
    win.classList.add('open');
  }else{
    win.classList.remove('open');
    win.hidden=true;
  }
  win.setAttribute('aria-hidden',String(!nextOpen));
  if(launcher)launcher.setAttribute('aria-expanded',String(nextOpen));
  if(nextOpen){
    const input=document.getElementById('chatInput');
    const touchDevice=typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
    if(input&&!touchDevice)input.focus();
  }
}
function chatAdd(role,text){const body=document.getElementById('chatBody');if(!body)return;const div=document.createElement('div');div.className='msg '+role;div.textContent=text;body.appendChild(div);CHAT_STATE.transcript.push({role,text});CHAT_STATE.transcript=CHAT_STATE.transcript.slice(-8);body.scrollTop=body.scrollHeight;}
function botSay(text){chatAdd('bot',text);}function userSay(text){chatAdd('user',text);}
function chatHandoffButton(question){
  const body=document.getElementById('chatBody');if(!body)return;
  const number=String((window.CONFIG&&CONFIG.whatsapp)||'351914522508').replace(/\D/g,'');
  const transcript=CHAT_STATE.transcript.slice(-6).map(item=>(item.role==='user'?chatText('customer'):chatText('helper'))+': '+item.text).join('\n');
  const text=[chatText('waIntro'),chatText('reference')+': '+CHAT_SESSION,chatText('page')+': '+location.href,chatText('myQuestion')+': '+question,'',chatText('recentChat')+':',transcript].join('\n');
  const link=document.createElement('a');link.className='chat-handoff';link.href='https://wa.me/'+number+'?text='+encodeURIComponent(text);link.target='_blank';link.rel='noopener';link.textContent=chatText('whatsappButton');body.appendChild(link);body.scrollTop=body.scrollHeight;
}
function chatLog(result,question){
  const endpoint=window.CONFIG&&CONFIG.backendURL;if(!endpoint)return;
  const transcript=CHAT_STATE.transcript.slice(-6).map(item=>(item.role==='user'?chatText('customer'):chatText('helper'))+': '+item.text).join('\n');
  fetch(endpoint,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},keepalive:true,body:JSON.stringify({type:'chat_log',timestamp:new Date().toISOString(),sessionId:CHAT_SESSION,language:chatLang(),page:location.pathname,question:question.slice(0,500),route:result.kind,tier:result.tier,reason:result.reason,matchedId:result.matchedId||'',transcript:transcript.slice(0,2500)})}).catch(()=>{});
}
function sendChat(text){const input=document.getElementById('chatInput'),message=String(text||(input&&input.value)||'').trim();if(!message)return;userSay(message);if(input)input.value='';const result=CHAT_STATE.ready?chatRoute(message):chatUnknown('knowledge_unavailable');setTimeout(()=>{botSay(result.reply);if(result.followUp)botSay(result.followUp);if(result.kind==='handoff'||result.kind==='answer_and_handoff'){chatHandoffButton(message);chatLog(result,message);}},250);}
function quickAsk(question){sendChat(question);}

function chatApplyLanguage(){
  const head=document.querySelector('.chat-head');if(head&&head.firstChild)head.firstChild.nodeValue=chatText('title');
  const input=document.getElementById('chatInput');if(input)input.placeholder=chatText('placeholder');
  const send=document.querySelector('.chat-input button');if(send)send.textContent=chatText('send');
  document.querySelectorAll('.chat-quick button').forEach(button=>{
    if(!button.dataset.chatIntent){const action=button.getAttribute('onclick')||'';if(/type of hair/i.test(action))button.dataset.chatIntent='hair';else if(/shipping/i.test(action))button.dataset.chatIntent='shipping';else if(/returns/i.test(action))button.dataset.chatIntent='returns';else if(/contact/i.test(action))button.dataset.chatIntent='contact';}
    const intent=button.dataset.chatIntent;if(!intent)return;
    button.textContent=chatText('quick'+intent.charAt(0).toUpperCase()+intent.slice(1));
    button.removeAttribute('onclick');button.onclick=()=>quickAsk((CHAT_QUICK_QUESTIONS[chatLang()]||CHAT_QUICK_QUESTIONS.en)[intent]);
  });
}
function chatLanguageChanged(){chatApplyLanguage();const body=document.getElementById('chatBody');if(!body)return;body.innerHTML='';CHAT_STATE.transcript=[];botSay(chatText('welcome'));const note=document.createElement('p');note.className='chat-safety';note.textContent=chatText('safety');body.appendChild(note);}
if(typeof window!=='undefined')window.chatLanguageChanged=chatLanguageChanged;

if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',async()=>{
  const win=document.getElementById('chatWindow'),input=document.getElementById('chatInput'),launcher=document.querySelector('.chat-btn');
  if(win){win.hidden=true;win.classList.remove('open');win.setAttribute('role','dialog');win.setAttribute('aria-label','Asheerah Hair');win.setAttribute('aria-hidden','true');}
  if(launcher){launcher.setAttribute('aria-controls','chatWindow');launcher.setAttribute('aria-expanded','false');}if(input)input.setAttribute('maxlength','500');
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&win&&win.classList.contains('open'))toggleChat(false);});
  await chatLoadKnowledge();chatApplyLanguage();const body=document.getElementById('chatBody');if(body&&!body.children.length)chatLanguageChanged();
});
if(typeof module==='object'&&module.exports)module.exports={chatNormalize,chatScore,chatHumanOnly,chatRoute,chatUnknown,chatEntryAnswer,CHAT_STATE};
