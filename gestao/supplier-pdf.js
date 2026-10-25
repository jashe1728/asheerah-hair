'use strict';
// Self-hosted PDF generation: order data stays in the authenticated browser.
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./vendor/pdf-lib-1.17.1.min.js'));
 else root.AHSupplierPDF=factory(root.PDFLib);
})(typeof window!=='undefined'?window:globalThis,function(PDFLib){
 function model(order){
  if(!order||(order.status!=='paid'&&!order.operations?.paymentConfirmation))throw Error('Confirma o pagamento antes de preparar o pedido.');
  if(order.operations?.stage==='needs_review')throw Error('Confirma primeiro o estado anterior desta encomenda.');
  if(!Array.isArray(order.items)||!order.items.length)throw Error('A encomenda não tem artigos.');
  const customer=order.customer||{};
  return {
   reference:String(order.id||''),createdAt:order.createdAt,pickup:order.fulfillmentMethod==='pickup',
   recipient:String(customer.name||''),phone:String(customer.phone||'Not provided'),
   address:String(order.fulfillmentAddress||[customer.address,customer.postalCode,customer.city,customer.country].filter(Boolean).join(', ')||'Not provided'),
   items:order.items.map(item=>{
    if(!Number.isSafeInteger(item.qty)||item.qty<1)throw Error('Quantidade inválida. Verifica a encomenda.');
    return {title:String(item.title||'Item'),variant:String(item.variant||Object.values(item.opts||{}).filter(Boolean).join(' · ')||'No additional options'),qty:item.qty};
   })
  };
 }
 async function create(order,{logoBytes,generatedAt=new Date()}={}){
  const data=model(order),{PDFDocument,StandardFonts,rgb}=PDFLib;
  const doc=await PDFDocument.create(),normal=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const logo=logoBytes?await doc.embedPng(logoBytes):null;
  const brown=rgb(.314,.208,.133),muted=rgb(.49,.38,.29),cream=rgb(.975,.941,.878),sand=rgb(.88,.82,.73);
  const clean=value=>Array.from(String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[\u00a0\u202f]/g,' ').replace(/″/g,'"').replace(/′/g,"'")).map(c=>{try{normal.encodeText(c);return c;}catch{return '?';}}).join('');
  const width=(s,size,font=normal)=>font.widthOfTextAtSize(clean(s),size);
  let page,y,pageNo=0;
  const text=(s,x,yy,size=10,font=normal,color=brown)=>page.drawText(clean(s),{x,y:yy,size,font,color});
  const rect=(x,yy,w,h,color)=>page.drawRectangle({x,y:yy,width:w,height:h,color});
  function wrap(value,max,size=10,font=normal){
   const lines=[];let line='';
   for(const word of clean(value).split(/\s+/)){
    if(line&&width(line+' '+word,size,font)>max){lines.push(line);line='';}
    for(const char of (line?' ':'')+word){if(line&&width(line+char,size,font)>max){lines.push(line);line='';}line+=char;}
   }
   if(line)lines.push(line);return lines;
  }
  function newPage(){
   page=doc.addPage([595.28,841.89]);pageNo++;
   rect(0,830,595.28,12,brown);rect(36,729,523,83,cream);
   if(logo){const h=61,w=h*logo.width/logo.height;page.drawImage(logo,{x:48,y:740,width:w,height:h});}
   text('ASHEERAH HAIR',143,785,11,bold);text('Supplier Order Request',143,758,21,bold);
   text('Ref. '+data.reference,36,710,9);
   rect(36,49,523,.6,sand);text('Share only with the supplier responsible for this order.',36,34,8,normal,muted);
   text('Page '+pageNo,510,34,8,normal,muted);y=681;
  }
  const ensure=height=>{if(y-height<69)newPage();};
  function block(s,size=10,font=normal,color=brown){for(const line of wrap(s,499,size,font)){ensure(size+5);text(line,48,y,size,font,color);y-=size+5;}}
  function section(s){ensure(51);rect(36,y-8,523,25,cream);text(s,48,y,11,bold);y-=30;}
  const date=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Lisbon'}):'Not provided';};
  newPage();
  if(order.id?.startsWith('00000000-')){block('SAMPLE - FICTIONAL ORDER DATA',10,bold);y-=8;}
  block('Order date: '+date(data.createdAt),9,normal,muted);
  block('Prepared on: '+date(generatedAt),9,normal,muted);y-=13;
  section('Items to prepare');
  for(const [index,item] of data.items.entries()){
   ensure(68);block((index+1)+'. '+item.title,12,bold);
   block('Selected options: '+item.variant,10);block('Quantity: '+item.qty,10,bold);
   ensure(16);rect(48,y-1,499,.5,sand);y-=19;
  }
  section(data.pickup?'Store collection details':'Delivery details');
  block('Recipient: '+data.recipient,10,bold);block('Phone: '+data.phone);
  block((data.pickup?'Collection location: ':'Delivery address: ')+data.address);y-=14;
  section('Supplier confirmation');
  block('Please confirm availability, selected options and quantities for all items.');
  block('Please provide the estimated preparation and dispatch dates.');
  block(data.pickup?'Please confirm when the order is available at the collection location.':'After handing the parcel to the carrier, please send confirmation and the tracking number.');y-=12;
  ensure(62);block('For order preparation only. This document is not an invoice.',9,normal,muted);
  block('Downloading this PDF does not send the order. Asheerah Hair sends it manually.',9,normal,muted);
  doc.setTitle('Asheerah Hair - Supplier Order Request '+data.reference);doc.setAuthor('Asheerah Hair');doc.setCreationDate(new Date(generatedAt));
  return doc.save();
 }
 return {create,model};
});
