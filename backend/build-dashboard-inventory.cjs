'use strict';
// Offline manifest authoring only. Reads saved pages; never reads live R2,
// creates an activation marker, changes flags or sends a message.
const fs=require('node:fs'),path=require('node:path');
const {buildManifest}=require('./dashboard-customer-inventory.cjs');
if(require.main===module){try{const input=process.argv[2];if(!input)throw Error('Usage: node backend/build-dashboard-inventory.cjs <saved-pages-array.json>');const manifest=buildManifest(JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')));const output=path.resolve(__dirname,'../output/dashboard-customer-inventory-manifest.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(manifest,null,2));console.log('Complete local manifest written: '+output);}catch(e){console.error(e.message);process.exitCode=1;}}
