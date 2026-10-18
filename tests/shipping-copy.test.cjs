const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const i18n=fs.readFileSync(path.join(__dirname,'../assets/js/i18n.js'),'utf8');
const shipping=fs.readFileSync(path.join(__dirname,'../pages/shipping.html'),'utf8');
test('shipping page has the supplied regional estimates and €5.99 EU / €20 international shipping rules translated in all six languages',()=>{
 const c={document:{addEventListener(){}},localStorage:{getItem(){return null}},navigator:{language:'en'},window:{}}; vm.runInNewContext(i18n,c);
 for(const key of ['shipping_europe','shipping_africa','shipping_americas','shipping_countries','shipping_fee_policy','shipping_select_country','country_search_ph']) for(const lang of c.LANGS){
  assert.ok(c.I18N[key]?.[lang],`${key} missing ${lang}`);
 }
 for(const key of ['shipping_europe','shipping_africa','shipping_americas','shipping_countries','shipping_fee_policy']) assert.match(shipping,new RegExp(`data-i18n="${key}"`));
 assert.match(c.I18N.shipping_fee_policy.en,/€5\.99.*€20/i);
 assert.equal(c.I18N.shipping_select_country.en,'Select your country to calculate shipping.');
 assert.match(c.I18N.shipping_europe.en,/6–10 business days/i);
 assert.match(c.I18N.shipping_africa.en,/7–15 days/i);
 assert.match(c.I18N.shipping_americas.en,/3–7 days/i);
});
