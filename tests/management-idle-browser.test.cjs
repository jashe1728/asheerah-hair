const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function browser(){
 let now=1000000,serverActive=now,tick,listener,locked=0,revokes=0,activeCalls=0,offline=false;
 const els=new Map(),events={},element=id=>({id,open:false,value:'15',textContent:'',disabled:false,setAttribute(){},addEventListener(){},append(){},remove(){els.delete(this.id);},showModal(){this.open=true;},close(){this.open=false;},focus(){}});
 function make(){const el=element('');Object.defineProperty(el,'innerHTML',{set(html){for(const match of html.matchAll(/id="([^"]+)"/g))if(!els.has(match[1]))els.set(match[1],element(match[1]));}});return el;}
 const main={append(el){els.set(el.id,el);}},document={hidden:false,getElementById:id=>els.get(id),createElement:make,body:main,querySelector:()=>main,addEventListener:(name,fn)=>events[name]=fn};
 const channel={postMessage(){},set onmessage(fn){listener=fn;}};
 const context={document,window:{addEventListener(){}},Date:{now:()=>now},BroadcastChannel:function(){return channel;},setInterval:fn=>(tick=fn,1),clearInterval(){},fetch:async(path,opts)=>{
  if(path.endsWith('/logout')){revokes++;return {ok:true};}
  if(offline)throw Error('offline');
  const input=JSON.parse(opts.body);if(input.active){activeCalls++;serverActive=now;}
  return {ok:true,status:200,json:async()=>({remainingMs:serverActive+15*60000-now,idleMinutes:input.idleMinutes||15})};
 }};
 vm.runInNewContext(fs.readFileSync('gestao/session.js','utf8'),context);
 return {els,events,session:context.window.AHSession,start:()=>context.window.AHSession.start(()=>locked++),advance:ms=>{now+=ms;tick();},message:data=>listener({data}),offline:()=>offline=true,get locked(){return locked;},get revokes(){return revokes;},get activeCalls(){return activeCalls;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('passive polling does not extend UI timeout; warning appears and sleeping tab locks on return',async()=>{
 const b=browser();await b.start();b.advance(14*60000);await settle();assert.equal(b.els.get('sessionWarning').open,true);assert.equal(b.activeCalls,0);
 b.advance(61000);await settle();assert.equal(b.locked,1);assert.equal(b.revokes,1);
});
test('continue button explicitly renews session and closes warning',async()=>{
 const b=browser();await b.start();b.advance(14*60000);await settle();await b.els.get('sessionStay').onclick();
 assert.equal(b.activeCalls,1);assert.equal(b.els.get('sessionWarning').open,false);assert.equal(b.locked,0);
});
test('offline inactivity clears private UI; another tab logout locks immediately',async()=>{
 const b=browser();await b.start();b.offline();b.advance(16*60000);await settle();assert.equal(b.locked,1);
 const other=browser();await other.start();other.message({type:'logout'});assert.equal(other.locked,1);
});
test('real interaction renews; input arriving after expiry cannot revive a suspended tab',async()=>{
 const b=browser();await b.start();b.advance(31000);await settle();b.events.keydown({isTrusted:true});b.advance(30000);await settle();assert.equal(b.activeCalls,1);
 b.advance(16*60000);b.events.pointerdown({isTrusted:true});await settle();assert.equal(b.locked,1);assert.equal(b.activeCalls,1);
});
