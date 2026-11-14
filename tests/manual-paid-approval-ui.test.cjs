'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../gestao/dashboard.js'),'utf8');
test('manual paid email has an explicit review action and safe status messages',()=>{
 const match=source.match(/function paidEmailStatus\(o\)\{[^\n]*\}/);assert.ok(match,'status helper');
 const status=vm.runInNewContext('('+match[0]+')');
 assert.equal(status({method:'manual_dashboard',operations:{paymentConfirmation:{}}}),'not_sent');
 for(const s of ['not_sent','pending','accepted','needs_review'])assert.equal(status({method:'manual_dashboard',operations:{paidEmail:{status:s}}}),s);
 assert.match(source,/data-action="approve_paid_email"/);
 assert.match(source,/reviewPaidEmail\(order\)/);
 assert.match(source,/action==='approve_paid_email'\?reviewed\?\.version/);
});
test('review escapes recipient, product, options and delivery details',()=>{
 const esc=vm.runInNewContext(source.match(/const esc=s=>[^\n]+/)[0].replace('const esc=',''));
 const review=vm.runInNewContext('('+source.match(/function reviewPaidEmail\(order\)\{[^\n]*\}/)[0]+')',{esc,options:i=>i.variant,money:n=>String(n)});
 const x='<img src=x onerror=alert(1)>';
 const html=review({id:x,customer:{name:x,email:x,address:x},items:[{title:x,variant:x,qty:x,unitCents:1}],totalCents:1});
 assert.ok(!html.includes(x));assert.match(html,/&lt;img/);
});
