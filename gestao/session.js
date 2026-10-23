'use strict';
// Shared by the order dashboard and newsletter editor. No customer data or tokens
// are stored in browser storage. Server timeouts remain authoritative when offline.
(() => {
 let running=false,ending=false,generation=0,deadline=0,lastHuman=0,acknowledged=0,lastRequest=0,timer=null,onLock=null,inflight=null,channel=null;
 const $=id=>document.getElementById(id);
 try{channel=new BroadcastChannel('ah-management-session');}catch{}
 function publish(message){channel?.postMessage(message);}
 function closeWarning(){if($('sessionWarning')?.open)$('sessionWarning').close();}
 function stop(){generation++;running=false;clearInterval(timer);timer=null;closeWarning();$('sessionSettings')?.remove();}
 function lock(message){if(ending)return;ending=true;stop();onLock?.(message);}
 async function revoke(){try{await fetch('/management-api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true});}catch{}}
 async function logout(){publish({type:'logout'});lock('A sessão terminou por segurança. Entra novamente para continuar.');await revoke();}
 function apply(data,started){
  if(!running)return;
  deadline=started+data.remainingMs;
  $('sessionMinutes').value=String(data.idleMinutes);
  if(deadline-Date.now()>60000)closeWarning();
 }
 async function sync(active=false,minutes){
  if(!running)return;
  if(inflight){await inflight;if(!running)return;}
  const version=generation,started=Date.now(),human=lastHuman;lastRequest=started;
  inflight=(async()=>{
   try{
    const response=await fetch('/management-api/auth/session',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({active,...(minutes!==undefined?{idleMinutes:minutes}:{})})});
    if(version!==generation)return;
    if(response.status===401){publish({type:'logout'});lock('A sessão terminou. Entra novamente para continuar.');return;}
    if(!response.ok)throw Error('Não foi possível verificar a sessão.');
    const data=await response.json();
    if(!running||version!==generation)return;
    if(active)acknowledged=human;
    apply(data,started);publish({type:'session',deadline,idleMinutes:data.idleMinutes});
    $('sessionError').textContent='';
   }catch{if(running)$('sessionError').textContent='Sem ligação. A sessão continua a terminar automaticamente por segurança.';}
  })();
  try{await inflight;}finally{inflight=null;}
 }
 function tick(){
  if(!running)return;
  const remaining=deadline-Date.now();
  if(remaining<=0){logout();return;}
  if(remaining<=60000){
   $('sessionCountdown').textContent=String(Math.ceil(remaining/1000));
   if(!$('sessionWarning').open){$('sessionWarning').showModal();$('sessionStay').focus();}
  }
  if(!document.hidden&&Date.now()-lastRequest>=30000)sync(lastHuman>acknowledged&&remaining>60000);
 }
 function activity(event){
  if(!running||!event.isTrusted||document.hidden||$('sessionWarning').open)return;
  // Check elapsed wall time before accepting input after sleep/background throttling.
  if(deadline<=Date.now()){logout();return;}
  lastHuman=Date.now();
  if(lastHuman-lastRequest>=30000)sync(true);
 }
 function build(){
  if(!$('sessionWarning')){
   const dialog=document.createElement('dialog');dialog.id='sessionWarning';dialog.className='session-warning';dialog.setAttribute('aria-labelledby','sessionWarningTitle');
   dialog.innerHTML='<img src="../assets/logo-sm.png" alt="Asheerah Hair" width="72"><h2 id="sessionWarningTitle">Queres continuar por aqui?</h2><p>A tua sessão vai terminar em <strong id="sessionCountdown">60</strong> segundos para proteger os dados das clientes.</p><p>Guarda as alterações antes de saíres.</p><div class="session-actions"><button type="button" id="sessionStay">Continuar sessão</button><button type="button" id="sessionLeave">Sair agora</button></div><p id="sessionError" role="status"></p>';
   dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);
   $('sessionStay').onclick=async()=>{if(deadline<=Date.now()){logout();return;}$('sessionStay').disabled=true;lastHuman=Date.now();try{await sync(true);}finally{$('sessionStay').disabled=false;}};
   $('sessionLeave').onclick=logout;
  }
  const settings=document.createElement('section');settings.id='sessionSettings';settings.className='session-settings';settings.setAttribute('aria-label','Segurança da sessão');
  settings.innerHTML='<div><strong>Segurança da sessão</strong><p>Saída automática após inatividade. Recebes um aviso 1 minuto antes.</p></div><label for="sessionMinutes">Nesta sessão <select id="sessionMinutes"><option value="5">5 minutos</option><option value="15" selected>15 minutos</option><option value="30">30 minutos</option></select></label>';
  document.querySelector('main').append(settings);
  $('sessionMinutes').onchange=async()=>{if(deadline<=Date.now()){logout();return;}lastHuman=Date.now();await sync(true,Number($('sessionMinutes').value));};
 }
 async function start(callback){
  if(running)return;
  onLock=callback;ending=false;running=true;lastHuman=acknowledged=Date.now();deadline=Date.now()+15000;build();
  await sync(false);
  if(running){timer=setInterval(tick,1000);tick();}
 }
 for(const name of ['pointerdown','keydown','wheel','touchstart'])document.addEventListener(name,activity,{passive:true,capture:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();if(running)sync(false);}});
 window.addEventListener('pageshow',()=>{if(running){tick();sync(false);}});
 if(channel)channel.onmessage=({data})=>{
  if(data?.type==='logout'){lock('A sessão terminou noutro separador. Entra novamente para continuar.');return;}
  if(running&&data?.type==='session'&&Number.isFinite(data.deadline)&&[5,15,30].includes(data.idleMinutes)){
   deadline=data.deadline;$('sessionMinutes').value=String(data.idleMinutes);if(deadline-Date.now()>60000)closeWarning();tick();
  }
 };
 window.AHSession={start,stop,logout};
})();
