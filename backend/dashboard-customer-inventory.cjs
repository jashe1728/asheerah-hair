'use strict';
const crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const DOMAIN='asheerah/dashboard-customer/full-inventory/v1';
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digestEntries=entries=>hash(canonical(entries));
function buildManifest(pages){
 if(!Array.isArray(pages)||!pages.length)throw Error('Provide all inventory pages in cursor order.');
 let expected=null;const cursors=new Set(),events=new Set(),entries=[];
 for(const [index,page]of pages.entries()){
  if(page.schemaVersion!==1||page.kind!=='dashboard-customer-inventory-page'||page.requestedCursor!==expected||!Array.isArray(page.entries)||page.pageDigest!==digestEntries(page.entries))throw Error('Invalid page, page digest or cursor chain.');
  if(expected!==null){if(cursors.has(expected))throw Error('Repeated inventory cursor.');cursors.add(expected);}
  for(const item of page.entries){const key=JSON.stringify([item.channel,item.id,item.eventId]);if(events.has(key))throw Error('Repeated event; inventory changed during pagination. Restart collection.');events.add(key);entries.push(item);}
  expected=page.cursor;if(index<pages.length-1&&expected===null)throw Error('Pages after the terminal page are not allowed.');
 }
 if(expected!==null)throw Error('Incomplete inventory: more cursor pages are required.');
 entries.sort((a,b)=>{const x=JSON.stringify([a.channel,a.id,a.eventId]),y=JSON.stringify([b.channel,b.id,b.eventId]);return x<y?-1:x>y?1:0;});
 return {schemaVersion:1,kind:'dashboard-customer-full-inventory',complete:true,pageCount:pages.length,entryCount:entries.length,consistency:'paginated-observation-not-atomic-snapshot',entries,inventoryHash:hash(canonical([DOMAIN,entries]))};
}
module.exports={buildManifest,digestEntries};
