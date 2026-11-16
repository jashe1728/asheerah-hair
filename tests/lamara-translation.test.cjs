const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const vm=require('node:vm');
test('Lamara collection title is translated on load and remains translatable',()=>{
 const html=fs.readFileSync('shop.html','utf8'); const src=fs.readFileSync('assets/js/i18n.js','utf8');
 const init=html.match(/document\.addEventListener\('DOMContentLoaded', \(\)=>\{[\s\S]*?\n\}\);/)[0];
 for(const lang of ['pt','en','es','de','fr','it']){
  const obj=src.match(/lamara_collection:\s*\{([^}]+)\}/); assert.ok(obj,'translation key exists');
  const phrases=vm.runInNewContext('({'+obj[1]+'})'); assert.ok(phrases[lang],lang);
  const title={attrs:{'data-i18n':'shop_all'},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},textContent:''}; let cb;
  const context={document:{addEventListener:(e,fn)=>cb=fn,getElementById:()=>title},location:{search:'?collection=lamara'},URLSearchParams,window:{uiTxt:k=>phrases[lang]},uiTxt:k=>phrases[lang]};
  vm.runInNewContext(init,context); cb(); assert.equal(title.attrs['data-i18n'],'lamara_collection'); assert.equal(title.textContent,phrases[lang]);
 }
});
