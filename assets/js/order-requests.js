/* Server-validated, anti-spam-protected Orange Money requests. */
(() => {
  if (!CONFIG.orderRequestsEnabled) return;
  let token='', widget, busy=false, submitted=false;
  const language=()=>document.documentElement.lang.slice(0,2);
  const messages={pt:['Conclua a verificação de segurança.','Pedido recebido. A encomenda será confirmada após a receção do pagamento. Referência: ','Não foi possível guardar o pedido. Tente novamente.'],en:['Please complete the security check.','Request received. Your order will be confirmed after payment is received. Reference: ','We could not save your request. Please try again.'],fr:['Veuillez effectuer la vérification de sécurité.','Demande reçue. Votre commande sera confirmée après réception du paiement. Référence : ','Impossible d’enregistrer votre demande. Réessayez.'],es:['Completa la verificación de seguridad.','Solicitud recibida. El pedido se confirmará tras recibir el pago. Referencia: ','No se pudo guardar la solicitud. Inténtalo de nuevo.'],de:['Bitte schließe die Sicherheitsprüfung ab.','Anfrage erhalten. Deine Bestellung wird nach Zahlungseingang bestätigt. Referenz: ','Die Anfrage konnte nicht gespeichert werden. Bitte erneut versuchen.'],it:['Completa la verifica di sicurezza.','Richiesta ricevuta. L’ordine sarà confermato dopo la ricezione del pagamento. Riferimento: ','Impossibile salvare la richiesta. Riprova.']};
  const msg=i=>(messages[language()]||messages.en)[i];
  function mount(){
    const area=document.querySelector('#payArea .om-instructions-box');
    if(!area||area.querySelector('.order-security'))return;
    const box=document.createElement('div');box.className='order-security';area.append(box);token='';
    if(!window.turnstile)return;
    widget=window.turnstile.render(box,{sitekey:CONFIG.reviewTurnstileSiteKey,action:'order_request',callback:value=>{token=value;},'expired-callback':()=>{token='';},'error-callback':()=>{token='';}});
  }
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=()=>{document.querySelector('.order-security')?.remove();mount();};document.head.append(script);
  new MutationObserver(mount).observe(document.body,{subtree:true,childList:true});mount();
  document.addEventListener('submit',async event=>{
    if(!event.target.querySelector('#placeOrderBtn')||document.querySelector('input[name=pay]:checked')?.value!=='orange_money')return;
    event.preventDefault();event.stopImmediatePropagation();
    if(busy||submitted)return;
    const note=document.getElementById('orderNote'),btn=document.getElementById('placeOrderBtn');
    const show=(text,ok=false)=>{note.textContent=text;note.className='order-note '+(ok?'ok':'error');};
    if(!validateCheckout(event.target)){focusFirstError(event.target);return;}
    if(!token){show(msg(0));return;}
    const val=id=>document.getElementById(id).value.trim();
    const request={language:language()||'pt',customer:{name:val('coFirst')+' '+val('coLast'),email:val('coEmail'),phone:val('coPhone'),country:resolveCountryCode(val('coCountry'))||val('coCountry'),address:[val('coAddr'),val('coApt')].filter(Boolean).join(', '),city:[val('coCity'),val('coDistrict')].filter(Boolean).join(', '),postalCode:val('coZip'),notes:val('coNotes')},items:getCart().map(i=>({handle:i.handle,options:i.opts,quantity:i.qty})),couponCode:getAppliedCoupon()?.code||'',fulfillmentMethod:'delivery'};
    // Reuse the reference after a network error, but never for a changed request.
    const fingerprint=JSON.stringify(request);let previous;try{previous=JSON.parse(sessionStorage.getItem('ah-order-request')||'null');}catch{}
    const requestId=previous?.fingerprint===fingerprint?previous.id:crypto.randomUUID();
    sessionStorage.setItem('ah-order-request',JSON.stringify({id:requestId,fingerprint}));
    busy=true;btn.disabled=true;
    try{
      const response=await fetch(new URL('/request-orange-money',CONFIG.stripeCheckoutURL),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...request,requestId,turnstileToken:token})});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error('Request failed');
      submitted=true;show(msg(1)+result.orderId,true);
    }catch{show(msg(2));btn.disabled=false;}
    finally{busy=false;token='';if(widget!==undefined)window.turnstile.reset(widget);}
  },true);
})();
