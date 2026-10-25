'use strict';
(() => {
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format((n||0)/100);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>s?new Date(s).toLocaleString('pt-PT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
const demo=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).get('demo')==='1';
const DEMO_KEY='asheerah-management-demo-v1';
const state={orders:[],view:'overview',selected:null,cursor:null,busy:false,pendingAction:null,challenge:null};
let lockVersion=0;
function icon(name){
 const paths={grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',orders:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',wallet:'<path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M20 11h-5v6h5M17 14h.01"/>',truck:'<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',logout:'<path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 2M4 17l2 2a7 7 0 0 0 12-2"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',filters:'<path d="M3 7h18M3 17h18"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',arrowRight:'<path d="M4 12h16m-6-6 6 6-6 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',check:'<path d="m5 12 4 4L19 6"/>',package:'<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7 5l9 5"/>',inbox:'<path d="M4 4h16l2 12v5H2v-5zM2 16h6l2 3h4l2-3h6"/>'};
 return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.package}</svg>`;
}
const stageLabels={needs_review:'Confirmar estado anterior',new:'Enviar ao fornecedor',supplier_sent:'Aguardar fornecedor',supplier_accepted:'Aguardar transportadora',courier_accepted:'Com a transportadora',pickup_ready:'Pronta para recolha',delivered:'Concluída'};
const actionLabels={confirm_payment:'Pagamento confirmado manualmente',supplier_sent:'Pedido enviado ao fornecedor',supplier_accepted:'Fornecedor aceitou o pedido',courier_accepted:'Transportadora recebeu a encomenda',pickup_ready:'Encomenda pronta para recolha',delivered:'Entrega / recolha confirmada',note:'Nota interna guardada'};
const actionCopy={
 classify_history:['Confirmar estado de pedido anterior','Este pedido já existia antes da área de gestão. Consulta os teus registos antes de indicar o estado atual.','Verifiquei o estado real deste pedido nos meus registos.'],
 confirm_payment:['Confirmar pagamento Orange Money','Confirma apenas depois de verificares que o valor integral entrou na conta. Este registo manual fica identificado no histórico.','Verifiquei a receção do valor total desta encomenda.'],
 supplier_sent:['Já enviaste o pedido ao fornecedor?','Primeiro descarrega o resumo e envia-o pelo canal habitual. Este botão regista que o envio foi feito por ti.','Já enviei o pedido ao fornecedor.'],
 supplier_accepted:['O fornecedor confirmou?','Regista a resposta do fornecedor. A aceitação do pedido ainda não significa que a transportadora recebeu a encomenda.','Recebi a confirmação de aceitação do fornecedor.'],
 courier_accepted:['Confirmar entrega à transportadora','Regista apenas depois de o fornecedor ou a transportadora confirmarem que o volume foi recebido para envio.','Recebi a confirmação de entrega da encomenda à transportadora.'],
 pickup_ready:['Pronta para recolha','Confirma que a encomenda está disponível na loja e que avisaste a cliente pelo teu canal habitual.','A encomenda está na loja e já avisei a cliente.'],
 delivered:['Concluir encomenda','Regista a entrega ou recolha apenas depois de receberes a respetiva confirmação.','Confirmei que a cliente recebeu ou recolheu a encomenda.']
};
actionLabels.classify_history='Estado anterior confirmado';
actionLabels.needs_review='Pedido anterior a rever';
function paid(o){return o.status==='paid'||!!o.operations?.paymentConfirmation;}
function stage(o){return o.operations?.stage||'new';}
function incomplete(o){return ['pending_checkout','checkout_failed','expired','payment_failed'].includes(o.status)&&!paid(o);}
function next(o){return incomplete(o)?'Checkout por concluir':!paid(o)?'Confirmar receção do pagamento':stageLabels[stage(o)]||'Ver encomenda';}
function paymentBadge(o){return `<span class="badge ${paid(o)?'paid':incomplete(o)?'neutral':'pending'}">${icon(paid(o)?'checkCircle':'clock')}${paid(o)?'Confirmado':incomplete(o)?'Por concluir':'A aguardar'}</span>`;}
function safeImage(src){try{const u=new URL(src,location.origin);return ((u.origin===location.origin&&u.pathname.startsWith('/assets/'))||(u.protocol==='https:'&&['asheerahhair.com','cdn.shopify.com'].includes(u.hostname)))?u.href:'../assets/logo-sm.png';}catch{return '../assets/logo-sm.png';}}
function options(item){return item.variant||Object.values(item.opts||{}).join(' · ');}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function saveDemo(){localStorage.setItem(DEMO_KEY,JSON.stringify(state.orders));}
function initialDemo(){
 const now=Date.now(),stamp=days=>new Date(now-days*86400000).toISOString();
 const products=[['X_Onika Ginger Bombshell','assets/img/x-onika-ginger-bombshell-1.png',29999,'26″ · 13x4 HD · 200% · M'],['Chocolate Caramel Highlight Wig','assets/img/chocolate-caramel-highlight-wig-1.jpeg',25599,'20″ · 5x5 HD · 200% · M'],['Burmese Curly Bundles','assets/img/burmese-curly-bundles-model-1.jpeg',15299,'18″ · 300 g'],['Pixie Curly Bundles','assets/img/pixie-curly-bundles-1.webp',15299,'16″ · 300 g']];
 const stages=['new','new','needs_review','supplier_accepted','courier_accepted','delivered','new','pickup_ready'];
 return ['Inês Exemplo','Marta Exemplo','Ciara Exemplo','Diana Exemplo','Sofia Exemplo','Ana Exemplo','Lara Exemplo','Rita Exemplo'].map((name,i)=>{
  const [title,image,unitCents,variant]=products[i%4],pickup=i===7,method=i===1?'orange_money':'stripe',status=i===1?'awaiting_payment':i===6?'pending_checkout':'paid';
  return {id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,createdAt:stamp(i*.5),language:'pt',method,status,customer:{name,email:`cliente${i+1}@example.com`,phone:'+351 000 000 000',country:i===1?'GW':'PT',address:'Morada fictícia para demonstração',city:i===1?'Bissau':'Lisboa',postalCode:'0000-000'},items:[{title,image,qty:1,unitCents,variant}],subtotalCents:unitCents,discountCents:0,shippingCents:pickup?0:799,totalCents:unitCents+(pickup?0:799),fulfillmentMethod:pickup?'pickup':'delivery',fulfillmentAddress:pickup?'Midana Beauty · Rua Elias Garcia, 229, 1.º andar, Loja E, Amadora':'Morada fictícia para demonstração',operations:{version:0,stage:stages[i],notes:i===2?'Confirmar disponibilidade antes de preparar.':'',tracking:i===4?'EXEMPLO-12345':'',events:i>1&&i!==6?[{action:stages[i],at:stamp(i*.5-.1),by:'Equipa · demonstração',reference:'Exemplo de confirmação'}]:[]}};
 });
}
async function api(path,body){
 const r=await fetch('/management-api/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({error:'Não foi possível ligar à área privada.'}));
 if(r.status===401&&!path.startsWith('auth/')){lock();throw Error('Entra com o teu e-mail para continuar.');}
 if(!r.ok)throw Error(data.error||'Não foi possível guardar. Tenta novamente.');return data;
}
function lock(){
 lockVersion++;window.AHSession?.stop();
 state.orders=[];state.selected=null;state.cursor=null;
 for(const id of ['orderDialog','actionDialog'])if($(id).open)$(id).close();
 for(const id of ['search','actionReference','actionTracking'])$(id).value='';
 $('ordersBody').textContent='';$('stats').textContent='';$('detail').textContent='';$('identity').textContent='Área privada';resetLogin();document.body.classList.add('is-locked');
}
function resetLogin(){state.challenge=null;$('codeStep').hidden=true;$('loginCode').required=false;$('loginCode').value='';$('loginEmail').readOnly=false;$('loginSubmit').textContent='Receber código de entrada';$('newCode').hidden=true;$('loginError').hidden=true;}
async function load(more=false,quiet=false){
 if(state.busy)return;state.busy=true;$('refresh').disabled=true;$('refresh').classList.add('is-refreshing');
 const version=lockVersion;
 try{
  if(demo){state.orders=JSON.parse(localStorage.getItem(DEMO_KEY)||'null')||initialDemo();saveDemo();$('identity').textContent='Demonstração local';state.cursor=null;}
  else {const data=await api('orders'+(more&&state.cursor?'?cursor='+encodeURIComponent(state.cursor):''));state.orders=more?[...state.orders,...data.orders.filter(o=>!state.orders.some(x=>x.id===o.id))]:data.orders;state.cursor=data.cursor||null;$('identity').textContent=data.identity;$('backfillNotice').hidden=data.historyReady;}
  if(version!==lockVersion){state.orders=[];return;}
  if(!demo)await window.AHSession.start(message=>{lock();$('loginError').textContent=message;$('loginError').hidden=false;});
  if(version!==lockVersion){state.orders=[];return;}
  document.body.classList.remove('is-locked');$('error').hidden=true;$('syncStatus').textContent=(demo?'Exemplo guardado · ':state.cursor?'Resumo parcial · ':'Atualizado · ')+new Date().toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});render();
 }catch(e){$('syncStatus').textContent='Sem ligação';if(!quiet){$('error').textContent=e.message;$('error').hidden=false;}}
 finally{state.busy=false;$('refresh').disabled=false;$('refresh').classList.remove('is-refreshing');}
}
function periodOrders(){const d=new Date();let start=0;if($('period').value==='month')start=new Date(d.getFullYear(),d.getMonth(),1).getTime();if($('period').value==='week')start=Date.now()-7*86400000;return state.orders.filter(o=>Date.parse(o.createdAt)>=start);}
function filterOrders(){const q=$('search').value.toLocaleLowerCase('pt'),f=$('statusFilter').value;return periodOrders().filter(o=>{
 if(q&&!`${o.id} ${o.customer.name} ${o.customer.email} ${o.items.map(i=>i.title).join(' ')}`.toLocaleLowerCase('pt').includes(q))return false;
 if(state.view==='shipping'&&!paid(o))return false;
 if(f==='unpaid')return !paid(o)&&!incomplete(o);if(f==='incomplete')return incomplete(o);if(f!=='all')return paid(o)&&stage(o)===f;return true;
 }).sort((a,b)=>{
  const priority=o=>incomplete(o)?6:!paid(o)?1:({new:0,needs_review:2,supplier_accepted:2,supplier_sent:3,pickup_ready:3,courier_accepted:4,delivered:5})[stage(o)]??6;
  return (state.view==='overview'?priority(a)-priority(b):0)||Date.parse(b.createdAt)-Date.parse(a.createdAt);
 });}
function render(){
 const all=periodOrders(),completed=all.filter(paid),pending=all.filter(o=>!paid(o)&&!incomplete(o)),active=completed.filter(o=>stage(o)!=='delivered'),newOrders=completed.filter(o=>stage(o)==='new'),waiting=completed.filter(o=>stage(o)==='supplier_sent');
 document.querySelector('main').dataset.view=state.view;
 $('orderCount').textContent=state.orders.length;$('daily').hidden=state.view!=='overview';$('paginationNotice').hidden=!state.cursor;
 const titles={overview:['Um novo dia, com tudo em ordem.','Acompanha cada encomenda, do primeiro pedido ao envio.'],orders:['Cada encomenda, acompanhada.','Encontra os pedidos e vê o que falta fazer.'],payments:['As contas, à tua vista.','Valores brutos das encomendas no período selecionado.'],shipping:['Do fornecedor até à cliente.','Regista cada confirmação recebida pelos teus canais habituais.']};
 $('pageTitle').innerHTML='<span class="desktop-page-title">'+esc(titles[state.view][0])+'</span><span class="mobile-page-title">'+esc({overview:'O teu dia, em ordem.',orders:'Encomendas',payments:'Pagamentos',shipping:'Fornecedor e envios'}[state.view])+'</span>';$('pageIntro').textContent=titles[state.view][1];$('listTitle').textContent=state.view==='payments'?'Pagamentos por encomenda':state.view==='shipping'?'Preparação e envio':'As tuas encomendas';
 $('stats').innerHTML=[['Pagamentos confirmados',money(completed.reduce((s,o)=>s+o.totalCents,0)),`${completed.length} encomendas pagas · período selecionado`,'wallet'],['A aguardar pagamento',money(pending.reduce((s,o)=>s+o.totalCents,0)),`${pending.length} pedidos por confirmar`,'clock'],['Em acompanhamento',active.length,'Pagas · preparação, envio ou recolha','package'],['Concluídas',completed.filter(o=>stage(o)==='delivered').length,'Entrega ou recolha registada','checkCircle']].map(([label,value,note,symbol])=>`<article class="stat"><span class="stat-label">${label}</span><span class="stat-icon" aria-hidden="true">${icon(symbol)}</span><div class="stat-value">${value}</div><small>${note}</small></article>`).join('');
 $('tasks').innerHTML=[[pending.length,'Confirmar pagamentos','Verificar recebimentos pendentes','unpaid'],[newOrders.length,'Enviar ao fornecedor','Pedidos pagos, prontos para avançar','new'],[waiting.length,'Aguardar confirmação','Pedidos enviados ao fornecedor','supplier_sent']].map(([n,title,sub,f])=>`<button class="task" data-filter="${f}"><b>${n}</b><span><strong>${title}</strong><small>${sub}</small></span><span aria-hidden="true">${icon('arrowRight')}</span></button>`).join('');
 const list=filterOrders();$('resultCount').textContent=`${list.length} encomenda${list.length===1?'':'s'}`;$('empty').hidden=list.length>0;
 $('ordersBody').innerHTML=list.map(o=>`<tr data-id="${esc(o.id)}"><td><span class="order-ref">#${esc(o.id.slice(-8).toUpperCase())}</span><strong>${esc(o.customer.name)}</strong><small>${date(o.createdAt)}</small></td><td><div class="product-cell"><img src="${esc(safeImage(o.items[0]?.image))}" alt=""><span>${esc(o.items[0]?.title||'Encomenda')}<small>${o.items.reduce((s,i)=>s+i.qty,0)} artigo(s)</small></span></div></td><td><strong>${money(o.totalCents)}</strong><small>${o.fulfillmentMethod==='pickup'?'Recolha na loja':esc(o.customer.country)}</small></td><td>${paymentBadge(o)}<small>${o.method==='orange_money'?'Orange Money · manual':'Pagamento online'}</small></td><td>${esc(next(o))}</td><td><button class="row-arrow" aria-label="Abrir encomenda de ${esc(o.customer.name)}">${icon('arrowRight')}</button></td></tr>`).join('');
 document.querySelectorAll('[data-quick-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.quickFilter===$('statusFilter').value)));
 $('loadMore').hidden=!state.cursor;document.querySelectorAll('nav [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false');});
}
function openOrder(id){state.selected=id;renderDetail();$('detail').scrollTop=0;$('orderDialog').scrollTop=0;$('orderDialog').showModal();}
function renderDetail(){
 const o=state.orders.find(o=>o.id===state.selected);if(!o)return;const op=o.operations||{},s=stage(o),isPaid=paid(o),pickup=o.fulfillmentMethod==='pickup';
 const steps=[['payment','Pagamento confirmado'],['supplier_sent','Pedido enviado ao fornecedor'],['supplier_accepted','Fornecedor aceitou'],[pickup?'pickup_ready':'courier_accepted',pickup?'Disponível para recolha':'Entregue à transportadora'],['delivered',pickup?'Recolha confirmada':'Entrega confirmada']];
 const current=steps.findIndex(([key])=>key===s),done=i=>i===0?isPaid:i<=current;
 let action=!isPaid?(o.method==='orange_money'&&!incomplete(o)?'confirm_payment':null):({needs_review:'classify_history',new:'supplier_sent',supplier_sent:'supplier_accepted',supplier_accepted:pickup?'pickup_ready':'courier_accepted',courier_accepted:'delivered',pickup_ready:'delivered'})[s];
 $('detail').innerHTML=`<div class="detail-header"><h2 id="detailTitle">${esc(o.customer.name)}</h2><p>Encomenda #${esc(o.id.slice(-8).toUpperCase())} · ${date(o.createdAt)}</p><div class="detail-badges">${paymentBadge(o)}<span class="badge neutral">${pickup?'Recolha na loja':'Entrega'}</span></div></div><section class="detail-section"><h3>O próximo passo</h3>${steps.map(([key,label],i)=>`<div class="step ${done(i)?'done':''}"><span class="step-number">${done(i)?icon('check'):i+1}</span><div><strong>${label}</strong><small>${i===0?o.method==='orange_money'?'Recebimento verificado pela equipa':'Confirmação automática do pagamento online':key==='courier_accepted'?'Confirmação recebida fora da plataforma':key==='supplier_sent'?'Contacto manual com o fornecedor':''}</small></div></div>`).join('')}${!isPaid?`<p class="detail-note">${o.method==='stripe'?'O pagamento online é confirmado automaticamente. Não é possível marcá-lo como pago manualmente.':'Verifica a receção do valor antes de confirmar o pagamento.'}</p>`:''}<div class="detail-actions">${action?`<button class="button primary" data-action="${action}">${esc({confirm_payment:'Confirmar pagamento',supplier_sent:'Já enviei ao fornecedor',supplier_accepted:'Fornecedor confirmou',courier_accepted:'Transportadora confirmou',pickup_ready:'Pronta para recolha',delivered:pickup?'Confirmar recolha':'Confirmar entrega'}[action])}</button>`:''}${isPaid?'<button class="button subtle" id="supplierSummary">Resumo para fornecedor</button>':''}</div>${op.tracking?`<p class="detail-note">Seguimento: <strong>${esc(op.tracking)}</strong></p>`:''}</section><section class="detail-section"><h3>A cliente e a entrega</h3><div class="detail-contact"><div><strong>E-mail</strong><p>${esc(o.customer.email)}</p></div><div><strong>Telefone</strong><p>${esc(o.customer.phone||'—')}</p></div><div class="full"><strong>${pickup?'Local de recolha':'Morada de entrega'}</strong><p>${esc(o.fulfillmentAddress||[o.customer.address,o.customer.city,o.customer.postalCode,o.customer.country].filter(Boolean).join(', '))}</p></div>${o.customer.notes?`<div class="full"><strong>Nota da cliente</strong><p>${esc(o.customer.notes)}</p></div>`:''}</div></section><section class="detail-section"><h3>O que foi escolhido</h3>${o.items.map(i=>`<div class="detail-product"><img src="${esc(safeImage(i.image))}" alt=""><div><strong>${esc(i.title)}</strong><p>${esc(options(i))}</p><p>Quantidade: ${i.qty}</p></div><span>${money(i.unitCents*i.qty)}</span></div>`).join('')}<div class="totals"><div><span>Produtos</span><span>${money(o.subtotalCents)}</span></div><div><span>Desconto${o.couponCode?' · '+esc(o.couponCode):''}</span><span>−${money(o.discountCents)}</span></div><div><span>Entrega</span><span>${money(o.shippingCents)}</span></div><div class="total"><span>Total</span><span>${money(o.totalCents)}</span></div></div></section><section class="detail-section"><h3>Notas só para a equipa</h3><label class="note-label" for="internalNote">Disponibilidade, contacto com fornecedor, lembretes…</label><textarea id="internalNote" maxlength="2000">${esc(op.notes||'')}</textarea><button class="button subtle" id="saveNote">Guardar nota</button></section><section class="detail-section"><h3>Histórico</h3><ul class="audit">${(op.events||[]).slice().reverse().map(e=>`<li>${esc(actionLabels[e.action]||e.action)}${e.reference?` · ${esc(e.reference)}`:''}<small>${date(e.at)} · ${esc(e.by)}</small></li>`).join('')}<li>Pedido recebido<small>${date(o.createdAt)} · Loja online</small></li></ul></section>`;
 if(isPaid){const copy=document.createElement('button');copy.className='button subtle';copy.id='copySupplierSummary';copy.textContent='Copiar resumo';document.getElementById('detail').querySelector('.detail-actions').append(copy);}
 if(s==='needs_review'){
  const note=document.createElement('p');note.className='detail-note';note.textContent='Pedido anterior à área de gestão. Confirma o estado real antes de preparar um novo envio ao fornecedor.';document.getElementById('detail').querySelector('.detail-actions').before(note);
  const button=document.getElementById('detail').querySelector('[data-action="classify_history"]');if(button)button.textContent='Confirmar estado anterior';
  for(const id of ['supplierSummary','copySupplierSummary']){const button=document.getElementById(id);if(button){button.disabled=true;button.title='Confirma primeiro o estado anterior.';}}
 }
 const summary=$('supplierSummary');if(summary)summary.innerHTML=icon('download')+'<span>Descarregar pedido em PDF</span>';
 if(summary){const note=document.createElement('p');note.className='detail-note';note.textContent='PDF em inglês, com artigos, opções, quantidades e entrega. Envia-o manualmente ao fornecedor.';summary.closest('.detail-actions').after(note);}
 const bar=$('mobileOrderAction');bar.replaceChildren();bar.hidden=false;
 const primary=$('detail').querySelector('button[data-action]');if(primary)bar.append(primary.cloneNode(true));
 const back=document.createElement('button');back.type='button';back.className='button subtle';back.dataset.closeOrder='true';back.textContent=primary?'Voltar':'Voltar à lista';bar.append(back);
}
function beginAction(action){
 const copy=actionCopy[action];if(!copy)return;state.pendingAction=action;
 $('actionTitle').textContent=copy[0];$('actionDescription').textContent=copy[1];$('acknowledgement').textContent=copy[2];
 $('actionReference').value='';$('actionReference').required=['confirm_payment','classify_history'].includes(action);
 $('actionReference').placeholder=action==='confirm_payment'?'Referência do recebimento (obrigatória)':'Ex.: confirmação nos registos anteriores';
 $('trackingLabel').hidden=action!=='courier_accepted';$('actionTracking').value='';
 if(!$('historyStageLabel')){const label=document.createElement('label');label.id='historyStageLabel';label.innerHTML='Estado atual da encomenda<select id="actionStage" aria-label="Estado atual da encomenda"></select>';$('trackingLabel').before(label);}
 $('historyStageLabel').hidden=action!=='classify_history';
 const order=state.orders.find(o=>o.id===state.selected),pickup=order?.fulfillmentMethod==='pickup';
 $('actionStage').innerHTML=['new','supplier_sent','supplier_accepted',pickup?'pickup_ready':'courier_accepted','delivered'].map(s=>`<option value="${s}">${esc(stageLabels[s])}</option>`).join('');
 $('actionAcknowledged').checked=false;$('actionError').hidden=true;$('actionDialog').showModal();
}
async function mutate(action,extra={}){
 const version=lockVersion;
 const o=state.orders.find(o=>o.id===state.selected);if(!o)throw Error('Encomenda não encontrada.');
 if(demo){
  o.operations=o.operations||{version:0,stage:'new',events:[]};const op=o.operations;
  if(action==='note')op.notes=extra.notes;else if(action==='confirm_payment')op.paymentConfirmation={at:new Date().toISOString(),by:'Equipa · demonstração',reference:extra.reference,amountCents:o.totalCents};else op.stage=action==='classify_history'?extra.stage:action;
  if(extra.tracking)op.tracking=extra.tracking;op.version++;op.events.push({action,at:new Date().toISOString(),by:'Equipa · demonstração',reference:extra.reference||''});saveDemo();
 }else{const data=await api('orders/'+encodeURIComponent(o.id),{action,version:o.operations?.version||0,...extra});if(version!==lockVersion)return;state.orders[state.orders.findIndex(x=>x.id===o.id)]=data.order;}
 render();renderDetail();toast(action==='note'?'Nota guardada.':'Confirmação guardada no histórico.');
}
function download(name,text,type='text/plain;charset=utf-8'){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function supplierText(o){
 const text=['ASHEERAH HAIR · PEDIDO AO FORNECEDOR',`Referência: ${o.id}`,`Data: ${date(o.createdAt)}`,'',...o.items.flatMap(i=>[`${i.qty} × ${i.title}`,options(i),'']),o.fulfillmentMethod==='pickup'?'ENTREGA PARA RECOLHA NA LOJA':'DADOS PARA ENTREGA',`Destinatária: ${o.customer.name}`,`Telefone: ${o.customer.phone||'—'}`,`Morada: ${o.fulfillmentAddress||[o.customer.address,o.customer.city,o.customer.postalCode,o.customer.country].filter(Boolean).join(', ')}`,'','Confirmar disponibilidade e aceitação do pedido.','Após entrega à transportadora, enviar confirmação e código de seguimento.','', 'Este resumo contém dados de entrega. Partilhar apenas com o fornecedor responsável.'].join('\n');
 return text;
}
async function supplierSummary(copy=false){const o=state.orders.find(o=>o.id===state.selected);if(!o||!paid(o))return;
 if(stage(o)==='needs_review'){toast('Confirma primeiro o estado anterior desta encomenda.');return;}
 if(copy){try{await navigator.clipboard.writeText(supplierText(o));toast('Resumo copiado. Partilha apenas com o fornecedor responsável.');}catch{toast('Não foi possível copiar. Usa a opção de download.');}}
 else{
  const button=$('supplierSummary'),version=lockVersion;
  if(button?.disabled)return;
  if(button){button.disabled=true;button.textContent='A preparar PDF…';}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   if(!window.AHSupplierPDF)throw Error('Não foi possível carregar o modelo PDF. Atualiza a página e tenta novamente.');
   const logo=await fetch('../assets/logo-sm.png',{signal:controller.signal});
   if(!logo.ok)throw Error('Não foi possível carregar o logótipo. Tenta novamente.');
   const pdf=await window.AHSupplierPDF.create(o,{logoBytes:new Uint8Array(await logo.arrayBuffer())});
   if(version!==lockVersion||state.selected!==o.id)return;
   download('Asheerah-pedido-fornecedor-'+o.id.slice(-8)+'.pdf',pdf,'application/pdf');
   toast('PDF descarregado. Envia-o manualmente e depois regista «Já enviei ao fornecedor».');
  }catch(err){if(version===lockVersion)toast(err.name==='AbortError'?'Não foi possível preparar o PDF a tempo. Tenta novamente.':err.message);}
  finally{clearTimeout(timer);if(button){button.disabled=false;button.innerHTML=icon('download')+'<span>Descarregar pedido em PDF</span>';}}
 }
}
function csvCell(value){const text=String(value);return '"'+(/^\s*[=+@\-\t\r\n]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';}
function exportCsv(){const rows=[['Referência','Data','Cliente','Produtos','Total EUR','Pagamento','Método','Estado de envio'],...filterOrders().map(o=>[o.id,o.createdAt,o.customer.name,o.items.map(i=>`${i.qty} × ${i.title}`).join(' / '),(o.totalCents/100).toFixed(2),paid(o)?'Confirmado':incomplete(o)?'Por concluir':'Pendente',o.method,next(o)])];download('Asheerah-encomendas.csv','\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8');}
$('today').textContent=new Date().toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);el.setAttribute('aria-hidden','true');});
const quickFilters=[['all','Todos'],['unpaid','Por pagar'],['new','Ao fornecedor'],['supplier_sent','A confirmar'],['courier_accepted','Em envio'],['needs_review','Anteriores']];
$('quickFilters').innerHTML=quickFilters.map(([value,label])=>`<button type="button" class="filter-chip" data-quick-filter="${value}" aria-pressed="false">${label}</button>`).join('');
$('quickFilters').addEventListener('click',e=>{const b=e.target.closest('[data-quick-filter]');if(b){$('statusFilter').value=b.dataset.quickFilter;render();}});
$('toggleFilters').onclick=()=>{const open=$('toggleFilters').getAttribute('aria-expanded')!=='true';$('toggleFilters').setAttribute('aria-expanded',String(open));document.querySelector('.toolbar').classList.toggle('filters-open',open);};
$('mobileOrderAction').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.action)beginAction(b.dataset.action);if(b.dataset.closeOrder)$('orderDialog').close();});
const historyFilter=document.createElement('option');historyFilter.value='needs_review';historyFilter.textContent='Estado anterior por confirmar';$('statusFilter').append(historyFilter);
$('demoBanner').hidden=!demo;$('logout').hidden=demo;$('logoutMobile').hidden=demo;
$('loginForm').onsubmit=async e=>{
 e.preventDefault();$('loginSubmit').disabled=true;$('loginError').hidden=true;
 try{
  if(!state.challenge){const result=await api('auth/start',{email:$('loginEmail').value.trim()});state.challenge=result.challenge;$('codeStep').hidden=false;$('loginCode').required=true;$('loginEmail').readOnly=true;$('loginSubmit').textContent='Entrar na minha área';$('newCode').hidden=false;$('loginCode').focus();}
  else{await api('auth/verify',{challenge:state.challenge,code:$('loginCode').value.trim()});state.challenge=null;$('loginCode').value='';await load();}
 }catch(err){$('loginError').textContent=err.message;$('loginError').hidden=false;}
 finally{$('loginSubmit').disabled=false;}
};
$('newCode').onclick=()=>{resetLogin();$('loginEmail').focus();};
$('logout').onclick=()=>window.AHSession.logout();
$('logoutMobile').onclick=()=>$('logout').click();
document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){state.view=b.dataset.view;$('statusFilter').value='all';render();if(matchMedia('(max-width:760px)').matches)window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}});
$('tasks').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){$('statusFilter').value=b.dataset.filter;render();document.querySelector('.orders-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}});
for(const id of ['search','statusFilter','period'])$(id).addEventListener(id==='search'?'input':'change',render);
$('ordersBody').addEventListener('click',e=>{const row=e.target.closest('[data-id]');if(row)openOrder(row.dataset.id);});
$('detail').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.action)beginAction(b.dataset.action);if(b.id==='supplierSummary')supplierSummary();if(b.id==='copySupplierSummary')supplierSummary(true);if(b.id==='saveNote'){b.disabled=true;try{await mutate('note',{notes:$('internalNote').value});}catch(err){toast(err.message);}finally{b.disabled=false;}}});
$('closeDetail').onclick=()=>$('orderDialog').close();for(const id of ['closeAction','cancelAction'])$(id).onclick=()=>$('actionDialog').close();
$('actionForm').onsubmit=async e=>{e.preventDefault();$('submitAction').disabled=true;try{await mutate(state.pendingAction,{reference:$('actionReference').value.trim(),tracking:$('actionTracking').value.trim(),stage:$('actionStage')?.value,acknowledged:true});$('actionDialog').close();const nextButton=matchMedia('(max-width:760px)').matches?$('mobileOrderAction').querySelector('button'):$('detail').querySelector('button[data-action]');nextButton?.focus({preventScroll:true});}catch(err){$('actionError').textContent=err.message;$('actionError').hidden=false;}finally{$('submitAction').disabled=false;}};
$('refresh').onclick=()=>load();$('loadMore').onclick=()=>load(true);$('export').onclick=exportCsv;$('clearFilters').onclick=()=>{$('search').value='';$('statusFilter').value='all';$('period').value='all';render();};
$('resetDemo').onclick=()=>{localStorage.removeItem(DEMO_KEY);load();};
load();setInterval(()=>{if(!demo&&!document.hidden&&!$('orderDialog').open&&!$('actionDialog').open&&!state.cursor)load(false,true);},60000);
})();
