const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../gestao/dashboard.js'),'utf8');
function block(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
test('supplier summary includes delivery and variant information but excludes retail amounts and email',()=>{
 const context={date:()=> 'test-date',options:i=>i.variant};vm.createContext(context);vm.runInContext(block('function supplierText(','async function supplierSummary('),context);
 const text=context.supplierText({id:'synthetic-order',createdAt:'date',items:[{qty:2,title:'Synthetic wig',variant:'26 / 13x4 / 200%',unitCents:20000}],customer:{name:'Synthetic customer',phone:'test-phone',email:'private@example.com',address:'test-address',city:'test-city',country:'PT'},totalCents:40000,fulfillmentMethod:'delivery'});
 for(const value of ['synthetic-order','2 × Synthetic wig','26 / 13x4 / 200%','test-phone','test-address'])assert.ok(text.includes(value));
 for(const value of ['private@example.com','40000','20000'])assert.equal(text.includes(value),false);
});
test('CSV cells quote embedded data and neutralize spreadsheet formulas including leading whitespace',()=>{
 const context={};vm.createContext(context);vm.runInContext(block('function csvCell(','function exportCsv('),context);
 for(const input of ['=HYPERLINK("test")','  =cmd','+SUM(1)','@SUM(1)','-1+2','\t=cmd'])assert.equal(context.csvCell(input).startsWith('"\''),true);
 assert.equal(context.csvCell('Normal name'),'"Normal name"');assert.equal(context.csvCell('a"b'),'"a""b"');
});
