const test=require('node:test');
const assert=require('node:assert/strict');
const {createManualController}=require('../gestao/manual-order.js');
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),dump:()=>[...m.values()].join(' ')};}
test('ambiguous submission survives reload without retaining customer data or allowing a fresh key',async()=>{
 const s=storage(), sent=[]; const opts={storage:s,key:()=> 'a'.repeat(48),send:async(b,k)=>{sent.push(k);throw Error('offline')}};
 const c=createManualController(opts);c.review({customer:{name:'PRIVATE PERSON'}});await assert.rejects(c.submit());
 assert.ok(s.dump().includes('a'.repeat(48)));assert.doesNotMatch(s.dump(),/PRIVATE PERSON/);
 const reloaded=createManualController({...opts,key:()=> 'b'.repeat(48)});
 assert.throws(()=>reloaded.review({customer:{name:'other'}}),/pendente/i);
 assert.deepEqual(sent,['a'.repeat(48)]);
});

test('recovery clears only an authoritative committed result for the same key',async()=>{
 const s=storage(),key='c'.repeat(48);const c=createManualController({storage:s,key:()=>key,send:async()=>{throw Error('lost')}});c.review({name:'secret'});await assert.rejects(c.submit());c.reset();
 const r=createManualController({storage:s,key:()=> 'd'.repeat(48),send:async()=>({})});
 await assert.rejects(r.resolve(async()=>({status:'unknown'})),/pendente/i);assert.equal(r.recovery().key,key);
 assert.deepEqual(await r.resolve(async k=>({status:'committed',key:k,orderId:'order-1'})),{status:'committed',key,orderId:'order-1'});assert.equal(r.recovery(),null);
});

test('lock while in flight preserves the marker even after success',async()=>{
 const s=storage();let done;const c=createManualController({storage:s,key:()=> 'e'.repeat(48),send:()=>new Promise(r=>done=r)});c.review({name:'secret'});const p=c.submit();c.reset();done({order:{id:'1'}});await p;assert.equal(c.recovery().key,'e'.repeat(48));assert.throws(()=>c.review({}),/pendente/i);
});
test('storage failure blocks the request',async()=>{
 let sent=false;const s={getItem(){return null},setItem(){throw Error('denied')}};const c=createManualController({storage:s,key:()=> 'f'.repeat(48),send:()=>{sent=true}});c.review({});await assert.rejects(c.submit(),/Armazenamento/);assert.equal(sent,false);
});

test('quote rejection cannot clear an ambiguous marker',async()=>{
 const s=storage(),c=createManualController({storage:s,key:()=> 'a'.repeat(48),send:async()=>{const e=Error('expired');e.status=422;throw e}});c.review({});await assert.rejects(c.submit());assert.ok(c.recovery());
});
