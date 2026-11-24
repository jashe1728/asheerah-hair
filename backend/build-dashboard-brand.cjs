'use strict';
// Offline build tool only. Never imported by the Worker or sender.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PDFDocument,StandardFonts}=require('pdf-lib');
async function main(){
 const png=fs.readFileSync(path.join(__dirname,'../assets/logo-sm.png'));
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.TimesRomanItalic);
 const titleGlyphWidths={};for(const c of new Set('Asheerah Hair'))titleGlyphWidths[c]=font.widthOfTextAtSize(c,1);
 fs.writeFileSync(path.join(__dirname,'dashboard-brand-assets.json'),JSON.stringify({source:'assets/logo-sm.png',sha256:crypto.createHash('sha256').update(png).digest('hex'),png:png.toString('base64'),titleGlyphWidths}));
 fs.copyFileSync(path.join(__dirname,'node_modules/@pdf-lib/standard-fonts/LICENSE.md'),path.join(__dirname,'dashboard-brand-LICENSE.txt'));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
