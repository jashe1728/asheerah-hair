'use strict';
// Immutable compatibility fixture, copied verbatim from the approved GitHub base
// 6911e1c840765f0e87d95344d970a32aec530a09 (business-dashboard.cjs helpers and applyAction).
// This protects code-rollback compatibility without depending on checkout HEAD.
const orderDigest=order=>require('node:crypto').createHash('sha256').update(JSON.stringify(order)).digest('hex');
const immutableManual=order=>order.method==='manual_dashboard'&&order.version===1&&/^[a-f0-9]{64}$/.test(order.manualRequestHash||'');
function applyAction(order,previous,input,by,at=new Date().toISOString()){
 if(!input||!Number.isSafeInteger(input.version)||input.version!==previous.version)throw Error('Este pedido foi atualizado por outra pessoa. Atualiza a página antes de continuar.');
 if(previous.removed)throw Error('Esta encomenda já foi removida.');
 const op=structuredClone(previous),action=input.action;
 const reference=input.reference??'',tracking=input.tracking??'';
 if(typeof reference!=='string'||reference.length>200||typeof tracking!=='string'||tracking.length>100)throw Error('Referência demasiado longa.');
 if((op.events||[]).length>=1000)throw Error('O histórico desta encomenda precisa de revisão técnica.');
 if(action==='note'){
  if(typeof input.notes!=='string'||input.notes.length>2000)throw Error('A nota deve ter até 2000 caracteres.');
  op.notes=input.notes.trim();
 }else{
  if(input.acknowledged!==true)throw Error('Confirma a ação antes de guardar.');
  const paid=order.status==='paid'||!!op.paymentConfirmation;
  if(action==='confirm_payment'){
   if(!['orange_money','manual_dashboard'].includes(order.method)||order.status!=='awaiting_payment'||paid||!reference.trim())throw Error('Só é possível confirmar um pagamento Orange Money pendente, com referência.');
   if(order.method==='manual_dashboard'&&(!immutableManual(order)||input.expectedOrderDigest!==orderDigest(order)))throw Error('A encomenda mudou ou não é imutável. Atualiza e revê antes de confirmar.');
   op.paymentConfirmation={at,by,reference:reference.trim(),amountCents:order.totalCents};
   if(order.method==='manual_dashboard')op.paymentConfirmation.orderDigest=orderDigest(order);
  }else if(action==='approve_paid_email'){
   if(!immutableManual(order)||order.status!=='awaiting_payment'||!op.paymentConfirmation||op.paymentConfirmation.orderDigest!==orderDigest(order)||input.expectedOrderDigest!==orderDigest(order)||typeof order.customer?.email!=='string'||!order.customer.email.trim()||input.recipient!==order.customer.email||typeof input.idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{32,128}$/.test(input.idempotencyKey)||op.paidEmail)throw Error('Revê a encomenda e o destinatário antes de aprovar o email.');
   op.paidEmail={status:'pending',eventId:require('node:crypto').randomUUID(),createdAt:at,confirmedSnapshot:structuredClone(order),approvalKeyHash:require('node:crypto').createHash('sha256').update(input.idempotencyKey).digest('hex')};
  }else if(action==='remove_manual_order'){
   if(order.method!=='manual_dashboard'||!immutableManual(order)||order.status!=='awaiting_payment'||paid||op.paidEmail||op.stage&&op.stage!=='new')throw Error('Só é possível remover pedidos manuais ainda não pagos.');
   if(input.expectedOrderDigest!==orderDigest(order))throw Error('A encomenda mudou ou não é imutável. Atualiza e revê antes de confirmar.');
   op.removed=true;op.removedAt=at;op.removedBy=by;
  }else if(action==='classify_history'){
   const stages=['new','supplier_sent','supplier_accepted',order.fulfillmentMethod==='pickup'?'pickup_ready':'courier_accepted','delivered'];
   if(!paid||op.stage!=='needs_review'||!stages.includes(input.stage)||!reference.trim())throw Error('Confirma o pagamento e o estado real deste pedido anterior, com uma observação.');
   op.stage=input.stage;
  }else{
   if(!paid)throw Error('Confirma o pagamento antes de avançar com a encomenda.');
   const next={new:'supplier_sent',supplier_sent:'supplier_accepted',supplier_accepted:order.fulfillmentMethod==='pickup'?'pickup_ready':'courier_accepted',courier_accepted:'delivered',pickup_ready:'delivered'}[op.stage];
   if(action!==next)throw Error('Esta ação não corresponde ao próximo passo da encomenda.');
   op.stage=action;
   if(action==='courier_accepted')op.tracking=tracking.trim();
  }
 }
 op.version++;op.updatedAt=at;op.events.push({action,at,by,stage:op.stage,reference:action==='note'?'':reference.trim()});return op;
}
module.exports={applyAction};
