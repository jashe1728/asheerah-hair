'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const security=require('../backend/public-security.cjs');
const source=fs.readFileSync(require.resolve('../backend/Code.gs'),'utf8');
const env={WORKER_GAS_SECRET:'synthetic-encoding-key'};
function verifier(encoding){
 const context={PropertiesService:{getScriptProperties:()=>({getProperty:()=>env.WORKER_GAS_SECRET})},Utilities:{computeHmacSha256Signature:(body,key)=>Array.from(crypto.createHmac('sha256',key).update(body,encoding).digest())}};
 vm.createContext(context);vm.runInContext(source,context);return context;
}
for(const encoding of ['utf8','latin1'])test(`signed Unicode probe preserves exact text with ${encoding} receiver bytes`,()=>{
 const payload={action:'security_probe',encodingProbe:'\u00e9\u2014\ud83e\uddea',name:'Jo\u00e3o',extra:'\u4e2d\u6587\ud83d\udc69\ud83c\udffd\u2028\u2029',escaped:'quotes " and \\ and \n',lone:'\ud800'};
 const wrapper=security.envelope(env,payload);
 assert.doesNotMatch(wrapper.payload,/[^\x00-\x7f]/,'signed wire payload must contain ASCII bytes only');
 assert.deepEqual(JSON.parse(wrapper.payload),payload,'JSON escapes must preserve customer text');
 const decoded=verifier(encoding).verifyWorkerPayload_(wrapper);
 assert.deepEqual(JSON.parse(JSON.stringify(decoded)),payload);
 assert.equal(crypto.createHmac('sha256',env.WORKER_GAS_SECRET).update(wrapper.payload,'utf8').digest('hex'),wrapper.signature);
});
test('a changed escaped Unicode value still fails strict authentication',()=>{
 const wrapper=security.envelope(env,{action:'security_probe',encodingProbe:'\u00e9\u2014'});
 wrapper.payload=wrapper.payload.replace('\\u00e9','\\u00e8');
 assert.equal(verifier('utf8').verifyWorkerPayload_(wrapper),null);
});
test('ASCII probes and existing action dispatch remain compatible',()=>{
 const wrapper=security.envelope(env,{action:'security_probe'});
 const context=verifier('utf8');
 const result=context.processWorkerPayload_(context.verifyWorkerPayload_(wrapper));
 assert.equal(result.ok,true);assert.equal(result.securityVersion,2);
});
