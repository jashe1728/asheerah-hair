// Lightweight PDF writer. The build-time template holds the original compressed logo
// and Helvetica metrics; per-order generation never decodes pixels or compresses data.
const template=require('./order-pdf-template.json');
const fmt=n=>Number(n.toFixed(4));
const rgb=(r,g,b)=>[r,g,b];
const StandardFonts={Helvetica:'Helvetica',HelveticaBold:'Helvetica-Bold'};
const glyph=c=>{const g=template.glyphs[c];if(!g)throw new Error('Unsupported glyph');return g;};
const font=name=>({name,encodeText:s=>Array.from(s).map(c=>glyph(c)[0]).join(''),widthOfTextAtSize:(s,size)=>Array.from(s).reduce((n,c)=>n+glyph(c)[name==='Helvetica'?1:2],0)*size});
const staticObjects=template.objects.map(([id,b64])=>[id,Buffer.from(b64,'base64')]);
function document(){
  const pages=[];let title='Asheerah Hair',author='Asheerah Hair';
  function addPage(){const commands=[];const page={commands,drawText(text,opts){commands.push(`BT /${opts.font.name==='Helvetica'?'F1':'F2'} ${fmt(opts.size)} Tf ${opts.color.join(' ')} rg 1 0 0 1 ${fmt(opts.x)} ${fmt(opts.y)} Tm <${opts.font.encodeText(text)}> Tj ET\n`);}};pages.push(page);return page;}
  const first=addPage();first.commands.push(`q ${fmt(template.logoWidth)} 0 0 ${fmt(template.logoHeight)} 44 ${fmt(790-template.logoHeight)} cm /Logo Do Q\n`);
  return {embedFont:async name=>font(name),addPage,getPage:i=>pages[i],setTitle:t=>{title=t;},setAuthor:a=>{author=a;},setCreationDate(){},setModificationDate(){},async save(){
    const objects=new Map(staticObjects);let next=Math.max(...objects.keys())+1;
    const f1=next++,f2=next++,root=next++,tree=next++,info=next++;
    objects.set(f1,Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
    objects.set(f2,Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
    const refs=[];
    for(const page of pages){const pageId=next++,streamId=next++;refs.push(pageId);const stream=Buffer.from(page.commands.join(''),'ascii');objects.set(streamId,Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),stream,Buffer.from('endstream')]));objects.set(pageId,Buffer.from(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << /Logo ${template.imageId} 0 R >> >> /Contents ${streamId} 0 R >>`));}
    objects.set(tree,Buffer.from(`<< /Type /Pages /Count ${pages.length} /Kids [${refs.map(i=>i+' 0 R').join(' ')}] >>`));objects.set(root,Buffer.from(`<< /Type /Catalog /Pages ${tree} 0 R >>`));
    const utf16=s=>'FEFF'+Array.from(String(s)).map(c=>{const cp=c.codePointAt(0);return cp<=65535?cp.toString(16).padStart(4,'0'):Buffer.from(c,'utf16le').swap16().toString('hex');}).join('');
    objects.set(info,Buffer.from(`<< /Title <${utf16(title)}> /Author <${utf16(author)}> >>`));
    const parts=[Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n','binary')],offsets={};let length=parts[0].length;
    for(const [id,bytes]of [...objects].sort((a,b)=>a[0]-b[0])){offsets[id]=length;const block=Buffer.concat([Buffer.from(id+' 0 obj\n'),bytes,Buffer.from('\nendobj\n')]);parts.push(block);length+=block.length;}
    const start=length;let xref=`xref\n0 ${next}\n0000000000 65535 f \n`;for(let i=1;i<next;i++)xref+=offsets[i]!==undefined?String(offsets[i]).padStart(10,'0')+' 00000 n \n':'0000000000 00000 f \n';
    parts.push(Buffer.from(xref+`trailer\n<< /Size ${next} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${start}\n%%EOF\n`));return Buffer.concat(parts);
  }};
}
module.exports={PDFDocument:{load:async()=>document()},StandardFonts,rgb};
