'use strict';
(function(root){
function createManualController({key,send,storage,locks=typeof navigator!=='undefined'?navigator.locks:null}){
 if(storage===undefined){try{storage=typeof window!=='undefined'?window.localStorage:null;}catch{storage=null;}}
 const slot='ah-manual-order-pending-v1';
 async function exclusive(fn){
  if(!locks||typeof locks.request!=='function')throw Error('Bloqueio entre separadores indisponível; não é seguro continuar.');
  return locks.request(slot,{mode:'exclusive',ifAvailable:true},async lock=>{if(!lock)throw Error('Bloqueio ocupado; pedido em curso noutro separador.');return fn();});
 }
 let body, token, pending, attempted=false;
 // Only a random key and fixed status are stored; never store the request or its hash.
 function read(){try{if(!storage)throw Error();return storage.getItem(slot)||null;}catch{throw Error('Armazenamento indisponível; não é seguro criar encomendas.');}}
 function save(value){try{if(!storage)throw Error();storage.setItem(slot,value);if(storage.getItem(slot)!==value)throw Error();}catch{throw Error('Armazenamento indisponível; não é seguro criar encomendas.');}}
 function clear(){try{if(!storage)throw Error();storage.removeItem(slot);if(storage.getItem(slot)!==null)throw Error();}catch{throw Error('Não foi possível atualizar o estado pendente.');}}
 function blocked(){const message='Existe uma encomenda pendente com resultado desconhecido. Confirma na gestão antes de criar outra; não repitas silenciosamente.';if(typeof window!=='undefined'&&window.alert)window.alert(message);throw Error(message);}
 return {
  reset(){body=null;token=null;attempted=false;},
  review(input){if(pending)throw Error('Pedido em curso.');if(read())blocked();body=structuredClone(input);token=key();attempted=false;},
  submit(){
   if(pending)return pending;if(!body)throw Error('Revê o pedido primeiro.');
   const requestBody=body,requestToken=token,record=JSON.stringify({key:requestToken,status:'unknown'});
   pending=exclusive(async()=>{
    if(body!==requestBody)throw Error('Pedido cancelado.');
    const existing=read();if(existing&&(!attempted||existing!==record))blocked();
    const firstAttempt=!attempted;save(record);attempted=true;
    try{
     const value=await send(requestBody,requestToken);
     if(body===requestBody&&read()===record)clear();return value;
    }catch(error){
     if(firstAttempt&&error?.definitiveQuoteRejection===true&&body===requestBody&&read()===record){clear();error.safeToReviewAgain=true;}
     throw error;
    }
   }).finally(()=>{pending=null;});return pending;
  },
  recovery(){const raw=read();if(!raw)return null;try{const value=JSON.parse(raw);if(value.status==='unknown'&&/^[a-zA-Z0-9_-]{32,128}$/.test(value.key))return value;}catch{}throw Error('Estado pendente inválido; requer verificação manual.');},
  async resolve(check){
   if(pending)throw Error('Pedido em curso.');return exclusive(async()=>{const record=read(),entry=this.recovery();if(!entry)throw Error('Sem encomenda pendente.');
   const result=await check(entry.key);
   if(result?.status!=='committed'||result.key!==entry.key||typeof result.orderId!=='string'||!result.orderId)throw Error('Resultado pendente; verifica novamente.');
   if(read()!==record)throw Error('O estado pendente foi alterado.');clear();return result;});
  }
 };
}
function variantItem(product,index,quantity){
 const variant=product.variants?.[index];if(!variant||!Number.isInteger(quantity)||quantity<1||quantity>10)throw Error('Seleciona uma variante e quantidade válida (1–10).');
 const options={};for(const k of ['opt1','opt2','opt3','opt4'])if(variant[k])options[k]=String(variant[k]);
 return {handle:product.handle,options,quantity};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createManualController,variantItem};
else root.AHManualOrder={createManualController,variantItem};
})(globalThis);
