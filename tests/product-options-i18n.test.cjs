const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
const i18n=fs.readFileSync(path.join(__dirname,'../assets/js/i18n.js'),'utf8');
test('wig option labels and cap sizes are translated in all six site languages',()=>{
 const context={document:{addEventListener(){}},localStorage:{getItem(){return null}},navigator:{language:'en'},window:{},escapeHTML:x=>String(x)};
 vm.runInNewContext(i18n,context);
 const helper=app.match(/function optionDisplayLabel\([\s\S]*?\n\}/)?.[0];
 assert.ok(helper,'option label helper exists'); vm.runInNewContext(helper,context);
 for(const lang of ['pt','en','es','de','fr','it']){
  context.LANG=lang; assert.ok(context.optionDisplayLabel('Cap Size')); assert.ok(context.optionDisplayLabel('SMALL'));
 }
});
