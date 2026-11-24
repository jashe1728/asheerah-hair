'use strict';
// Whitelist only public UI assets into a disposable local test directory.
const fs=require('node:fs'),path=require('node:path');
const target=path.join(__dirname,'../tmp/dashboard-assets');
const files=['index.html','dashboard.js','dashboard.css','session.js','session.css','manual-order.js','manual-order.css','supplier-pdf.js','vendor/pdf-lib-1.17.1.min.js','customer-email.js','customer-email.css'];
for(const file of files){const dest=path.join(target,'gestao',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(__dirname,'../gestao',file),dest);}
fs.mkdirSync(path.join(target,'assets'),{recursive:true});fs.copyFileSync(path.join(__dirname,'../assets/logo-sm.png'),path.join(target,'assets/logo-sm.png'));
console.log('Prepared whitelisted real dashboard assets in tmp/dashboard-assets. No production data or credentials.');
