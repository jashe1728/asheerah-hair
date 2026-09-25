const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const root=path.join(__dirname,'../assets/data');
const kb=JSON.parse(fs.readFileSync(path.join(root,'chatbot-kb.json'),'utf8'));
const loc=JSON.parse(fs.readFileSync(path.join(root,'chatbot-locales.json'),'utf8'));
const faq=fs.readFileSync(path.join(__dirname,'../faq.html'),'utf8');
const answer=id=>kb.entries.find(x=>x.id===id).answer;
test('FAQ and chatbot use current wig, crochet, lace, and delivery options',()=>{
 assert.match(answer('P04'),/16–32/); assert.match(answer('P04'),/16–22/);
 assert.match(answer('CU18'),/5×5/); assert.doesNotMatch(answer('CU18'),/Transparent/i);
 assert.match(answer('S10'),/6–10 business days/i); assert.match(answer('S10'),/7–15 days/i); assert.match(answer('S10'),/3–7 days/i);
 for(const lang of ['pt','es','de','fr','it']){
  assert.match(loc[lang].entries.P04.answer,/16–32/); assert.match(loc[lang].entries.P04.answer,/16–22/);
  assert.match(loc[lang].entries.CU18.answer,/5×5/); assert.doesNotMatch(loc[lang].entries.CU18.answer,/Transparent/i);
  assert.match(loc[lang].entries.S10.answer,/6–10/); assert.match(loc[lang].entries.S10.answer,/7–15/); assert.match(loc[lang].entries.S10.answer,/3–7/);
 }
 assert.match(faq,/16–32/); assert.match(faq,/5x5/); assert.doesNotMatch(faq,/Transparent/i);
});