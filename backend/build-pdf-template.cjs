// Build-time only: embed the unchanged original logo once, avoiding PNG decoding per order.
const fs=require('node:fs');const {PDFDocument,StandardFonts}=require('pdf-lib');
(async()=>{
  const p=await PDFDocument.create();const image=await p.embedPng(fs.readFileSync(require('node:path').join(__dirname,'../assets/logo-sm.png')));
  const page=p.addPage([595.28,841.89]);const d=image.scaleToFit(145,70);page.drawImage(image,{x:44,y:790-d.height,width:d.width,height:d.height});
  const regular=await p.embedFont(StandardFonts.Helvetica),bold=await p.embedFont(StandardFonts.HelveticaBold);
  await p.save({useObjectStreams:false});
  const glyphs={};for(const c of Array.from({length:65536},(_,i)=>String.fromCharCode(i))){try{const encoded=regular.encodeText(c).toString().slice(1,-1);glyphs[c]=[encoded,regular.widthOfTextAtSize(c,1),bold.widthOfTextAtSize(c,1)];}catch{}}
  const objects=p.context.enumerateIndirectObjects().map(([ref,obj])=>{const bytes=new Uint8Array(obj.sizeInBytes());obj.copyBytesInto(bytes,0);return [ref.objectNumber,Buffer.from(bytes).toString('base64')];});
  fs.writeFileSync(require('node:path').join(__dirname,'order-pdf-template.json'),JSON.stringify({objects,glyphs,imageId:image.ref.objectNumber,logoWidth:d.width,logoHeight:d.height}));
})();
