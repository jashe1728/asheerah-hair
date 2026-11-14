const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../gestao/dashboard.js'),'utf8');
function block(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
test('supplier summary includes delivery and variant information but excludes retail amounts and email',()=>{
 const context={date:()=> 'test-date',options:i=>i.variant};vm.createContext(context);vm.runInContext(block('function supplierText(','async function supplierSummary('),context);
 const text=context.supplierText({id:'synthetic-order',createdAt:'date',items:[{qty:2,title:'Synthetic wig',variant:'26 / 13x4 / 200%',unitCents:20000}],customer:{name:'Synthetic customer',phone:'test-phone',email:'private@example.com',address:'test-address',city:'test-city',country:'PT'},totalCents:40000,fulfillmentMethod:'delivery'});
 for(const value of ['Referência: #IC-ORDER','2 × Synthetic wig','26 / 13x4 / 200%','test-phone','test-address'])assert.ok(text.includes(value));
 assert.equal(text.includes('synthetic-order'),false);
 for(const value of ['private@example.com','40000','20000'])assert.equal(text.includes(value),false);
});
test('CSV exports the short reference and preserves the full ID separately',()=>{
 const order={id:'abc-1234abcd',createdAt:'2026-01-01',customer:{name:'Cliente'},items:[{qty:1,title:'Wig'}],totalCents:1000,method:'stripe'};
 let result;const context={filterOrders:()=>[order],paid:()=>true,next:()=> 'Novo',download:(name,text)=>{result=text}};
 vm.createContext(context);vm.runInContext(block('function csvCell(',"$('today')"),context);context.exportCsv();
 const rows=result.replace(/^\uFEFF/,'').split('\r\n').map(row=>row.split(';').map(cell=>cell.slice(1,-1)));
 assert.equal(rows[1][rows[0].indexOf('Referência')],'#1234ABCD');
 assert.equal(rows[1][rows[0].indexOf('ID completo')],order.id);
});
test('search accepts a displayed hash reference without losing full-ID search',()=>{
 const order={id:'abc-1234abcd',createdAt:'2026-01-01',customer:{name:'Cliente',email:'client@example.com'},items:[{title:'Wig'}]};
 const fields={search:{value:'#1234abcd'},statusFilter:{value:'all'}};
 const context={$:id=>fields[id],periodOrders:()=>[order],state:{view:'orders'},paid:()=>true,incomplete:()=>false,stage:()=> 'new'};
 vm.createContext(context);vm.runInContext(block('function filterOrders(','function render('),context);
 assert.equal(context.filterOrders()[0],order);
 fields.search.value=order.id;assert.equal(context.filterOrders()[0],order);
 fields.search.value='#00000000';assert.equal(context.filterOrders().length,0);
});
test('CSV cells quote embedded data and neutralize spreadsheet formulas including leading whitespace',()=>{
 const context={};vm.createContext(context);vm.runInContext(block('function csvCell(','function exportCsv('),context);
 for(const input of ['=HYPERLINK("test")','  =cmd','+SUM(1)','@SUM(1)','-1+2','\t=cmd'])assert.equal(context.csvCell(input).startsWith('"\''),true);
 assert.equal(context.csvCell('Normal name'),'"Normal name"');assert.equal(context.csvCell('a"b'),'"a""b"');
});
