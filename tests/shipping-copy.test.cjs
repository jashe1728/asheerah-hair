const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const i18n=fs.readFileSync(path.join(__dirname,'../assets/js/i18n.js'),'utf8');
const shipping=fs.readFileSync(path.join(__dirname,'../pages/shipping.html'),'utf8');
test('shipping page has the supplied regional estimates translated in all six languages',()=>{
 const c={document:{addEventListener(){}},localStorage:{getItem(){return null}},navigator:{language:'en'},window:{}}; vm.runInNewContext(i18n,c);
 for(const key of ['shipping_europe','shipping_africa','shipping_americas','shipping_countries']) for(const lang of c.LANGS){
  assert.ok(c.I18N[key]?.[lang],`${key} missing ${lang}`);
 }
 for(const key of ['shipping_europe','shipping_africa','shipping_americas','shipping_countries']) assert.match(shipping,new RegExp(`data-i18n="${key}"`));
 assert.match(c.I18N.shipping_europe.en,/6–10 business days/i);
 assert.match(c.I18N.shipping_africa.en,/7–15 days/i);
 assert.match(c.I18N.shipping_americas.en,/3–7 days/i);
});
