const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../gestao/dashboard.js'),'utf8');

test('payment confirmation warns automatic email is disabled',()=>{
 const copy=source.match(/confirm_payment:\[([^\n]+)\]/)?.[1]||'';
 assert.match(copy,/e-mail.*desativado/i);
});
test('paid email states are distinct and never promise delivery',()=>{
 const match=source.match(/function paidEmailMessage\(order\)\{[^\n]*\}/);
 assert.ok(match,'status message helper exists');
 const status=vm.runInNewContext('('+source.match(/function paidEmailStatus\(o\)\{[^\n]*\}/)[0]+')');
 const message=vm.runInNewContext('('+match[0]+')',{paidEmailStatus:status});
 const values=['pending','accepted','needs_review'].map(status=>message({paidEmail:{status}}));
 assert.ok(values.every(Boolean));assert.equal(new Set(values).size,3);
 assert.match(values[0],/pendente|aguard/i);assert.match(values[1],/aceite/i);assert.match(values[2],/revis/i);
 assert.match(values[1],/não.*entrega/i);
 assert.equal(message({}), '');assert.equal(message({paidEmail:{status:'unknown'}}), '');
 assert.match(source,/paidEmailMessage\(o\)/);
});
