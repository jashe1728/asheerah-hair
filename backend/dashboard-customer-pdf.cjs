'use strict';
// Dashboard-only document. Shared checkout/email renderers are deliberately untouched.
const {PDFDocument,StandardFonts}=require('./dashboard-pdf-writer.cjs');
const {copy,reference,options,formatter}=require('./dashboard-customer-i18n.cjs');
const {validateAmounts}=require('./dashboard-customer-amounts.cjs');
const glyphs=require('./order-pdf-template.json').glyphs;
const COLORS={carob:[.22,.13,.10],gold:[.66,.48,.23],ivory:[.98,.96,.91]};
async function makeCustomerPdf(order,tracking,correction=false){
 validateAmounts(order);
 const c=copy(order.language),ref=reference(order.id);
 const doc=await PDFDocument.load(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),editorial=await doc.embedFont(StandardFonts.TimesItalic);
 doc.setTitle('Asheerah Hair '+ref);
 let page,y,pageNumber=0;
 const clean=s=>{const text=String(s??'').normalize('NFC').replace(/[\r\n\t\u00a0\u202f]/g,' ').replace(/″/g,'"').replace(/′/g,"'").replace(/−/g,'-');if(Array.from(text).some(c=>!glyphs[c]))throw Error('O PDF não suporta um dos caracteres fornecidos. Revê os dados antes de aprovar.');return text;};
 const start=()=>{page=doc.addPage();pageNumber++;y=650;page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:COLORS.ivory});page.drawLogo({x:36,y:710,width:112});page.drawText('Asheerah Hair',{x:180,y:765,size:34,font:editorial,color:COLORS.carob});page.drawText(c.tagline,{x:182,y:735,size:9,font:regular,color:COLORS.gold});page.drawRectangle({x:36,y:694,width:523,height:1,color:COLORS.gold});page.drawText(c.footer,{x:36,y:30,size:9,font:regular,color:COLORS.carob});page.drawText(String(pageNumber),{x:547,y:30,size:9,font:regular,color:COLORS.gold});};
 // The lightweight writer starts with one page; use it for the first page.
 const add=doc.addPage.bind(doc);let first=true;doc.addPage=()=>{if(first){first=false;return doc.getPage(0)}return add()};
 start();
 const wrap=(value,size,font)=>{const lines=[];let current='';for(const word of clean(value).split(/\s+/)){if(current&&font.widthOfTextAtSize(current+' '+word,size)>515){lines.push(current);current='';}for(const ch of (current?' ':'')+word){if(current&&font.widthOfTextAtSize(current+ch,size)>515){lines.push(current);current='';}current+=ch;}}if(current)lines.push(current);return lines;};
 const line=(text,size=11,strong=false)=>{const font=strong?bold:regular;for(const textLine of wrap(text,size,font)){if(y<65)start();page.drawText(textLine,{x:36,y,size,font,color:COLORS.carob});y-=size+9;}y-=3;};
 const height=(text,size=11,strong=false)=>wrap(text,size,strong?bold:regular).length*(size+9)+3;
 const keepTogether=needed=>{if(needed<585&&y-needed<65)start();};
 line(correction?c.correctedHeading:c.heading,25,true);y-=12;
 line(c.reference+': '+ref);line(c.greeting+' '+order.customer.name+'.');
 line(correction?c.correctionIntro:c.receiptIntro);y-=12;
 for(const item of order.items){const title=item.qty+' x '+item.title,variant=options(item);keepTogether(height(title,13,true)+height(variant));line(title,13,true);line(variant);}
 const money=n=>formatter(order.language).format(n/100);
 line(c.subtotal+': '+money(order.subtotalCents));line(c.discount+': '+money(order.discountCents||0));line(c.shipping+': '+money(order.shippingCents||0));line(c.total+': '+money(order.totalCents),16,true);y-=12;
 line(order.fulfillmentMethod==='pickup'?c.pickup+': '+(order.fulfillmentAddress||'Midana Beauty, Amadora'):c.delivery+': '+(order.fulfillmentAddress||[order.customer.address,order.customer.postalCode,order.customer.city,order.customer.country].filter(Boolean).join(', ')));
 if(tracking){const code=tracking.carrier+' | '+c.code+': '+tracking.code,instruction=c.instruction;keepTogether(height(c.tracking,10,true)+height(code,14,true)+height(tracking.url,10)+height(instruction));line(c.tracking,10,true);line(code,14,true);line(tracking.url,10);line(instruction);}
 return Buffer.from(await doc.save());
}
module.exports={makeCustomerPdf,COLORS};
