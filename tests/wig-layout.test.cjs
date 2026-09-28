const test=require('node:test'); const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../assets/css/styles.css'),'utf8');

test('four wig option groups render in a single labelled vertical selector stack',()=>{
 const match=app.match(/function productOptionGroupsHTML\([\s\S]*?\n\}/);
 assert.ok(match,'helper should render option groups consistently');
 const context={optionGroupHTML:o=>`<section>${o.name}</section>`};
 vm.runInNewContext(match[0],context);
 const html=context.productOptionGroupsHTML([{name:'Length'},{name:'Lace'},{name:'Density'},{name:'Cap Size'}],{},'EUR');
 assert.match(html,/class="pd-option-groups"/);
 assert.equal((html.match(/<section>/g)||[]).length,4);
});

test('wig option selectors are vertically stacked and length choices use an adaptive grid',()=>{
 assert.match(css,/\.pd-option-groups\s*\{[^}]*display:\s*grid/);
 assert.match(css,/\.pd \.option-group--length \.pills\s*\{[^}]*grid-template-columns:/);
 assert.doesNotMatch(css,/\.pd-option-grid\s*\{[^}]*grid-template-columns/);
});
