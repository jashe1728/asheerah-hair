'use strict';
const {makeCustomerPdf}=require('./dashboard-customer-pdf.cjs');
const {copy,reference}=require('./dashboard-customer-i18n.cjs');
const brand=require('./dashboard-brand-assets.json');
const {FROM,REPLY}=require('./order-email.cjs');
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function render(order,tracking,kind){
 const c=copy(order.language),ref=reference(order.id),intro=c[kind+'Intro'];
 const text=[`${c.greeting} ${order.customer.name}.`,intro,`${c.reference}: ${ref}`,...(tracking?[`${c.carrier}: ${tracking.carrier}`,`${c.code}: ${tracking.code}`,tracking.url,c.instruction]:[]),c.attachment,c.signoff].join('\n');
 const pdf=await makeCustomerPdf(order,tracking,kind==='correction');
 return {from:FROM,to:[order.customer.email],reply_to:REPLY,subject:c[kind+'Subject']+' '+ref+' | Asheerah Hair',text,html:'<div lang="'+c.lang+'" style="background:#faf5e8;color:#382119;padding:32px;font:16px Georgia,serif;overflow-wrap:anywhere"><img src="cid:asheerah-logo" width="112" height="100" alt="Asheerah Hair" style="display:block;object-fit:contain"><h1 style="font-family:Georgia,Times,serif;font-style:italic;font-weight:400;font-size:34px;line-height:1.2">Asheerah Hair</h1>'+text.split('\n').map(s=>'<p>'+esc(s)+'</p>').join('')+'</div>',attachments:[{filename:'Asheerah-Hair-'+ref.slice(1)+'.pdf',content:pdf.toString('base64')},{filename:'asheerah-logo.png',content:brand.png,content_type:'image/png',content_id:'asheerah-logo'}]};
}
module.exports={render};
