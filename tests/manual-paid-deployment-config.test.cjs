'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('production enables the approved manual-email scheduler and transactional email together',()=>{
 const config=fs.readFileSync(path.join(__dirname,'../backend/wrangler.toml'),'utf8');
 const vars=config.match(/\[vars\]([\s\S]*?)(?=\n\[|$)/)?.[1];assert.ok(vars,'vars table');
 assert.match(vars,/^ORDER_EMAIL_ENABLED\s*=\s*"1"\s*$/m);
 assert.match(vars,/^MANUAL_PAID_SCHEDULER_ENABLED\s*=\s*"1"\s*$/m,'production scheduler must be explicitly enabled');
});
