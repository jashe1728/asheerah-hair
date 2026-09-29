const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../backend/Code.gs'),'utf8');
function rowFor(coupon){
  const context={Utilities:{formatDate:()=> '2026-09-29T12:00:00Z'},Session:{getScriptTimeZone:()=> 'UTC'}};
  vm.createContext(context);vm.runInContext(source,context);
  return context.buildOrderRow_({coupon,items:[],method:'pending',customer:{}});
}

test('order records attribution for an allowed ambassador coupon in the Items field',()=>{
  const row=rowFor('ONIKA10');
  assert.match(row[6],/^Ambassador coupon: ONIKA10/);
});

test('order does not record an unrecognized coupon as ambassador attribution',()=>{
  const row=rowFor('MALICIOUS-CODE');
  assert.doesNotMatch(row[6],/MALICIOUS-CODE/);
});
