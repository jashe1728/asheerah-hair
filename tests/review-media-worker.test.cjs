const test=require('node:test');
const assert=require('node:assert/strict');
const {handleRequest}=require('../backend/stripe-worker.cjs');

function memoryBucket(){
  const objects=new Map();
  return {
    objects,
    async put(key,value,options={}){objects.set(key,{value,options});},
    async get(key){
      const saved=objects.get(key);if(!saved)return null;
      return {text:async()=>Buffer.from(saved.value).toString(),arrayBuffer:async()=>Buffer.from(saved.value),httpMetadata:saved.options.httpMetadata||{}};
    },
    async list({prefix}){return {objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false};},
    async delete(key){objects.delete(key);},
  };
}
const envFor=REVIEW_MEDIA=>({SITE_ORIGINS:'https://asheerahhair.com,https://jashe1728.github.io',TURNSTILE_SECRET:'turnstile-secret',REVIEW_ADMIN_TOKEN:'review-admin-token',REVIEW_MEDIA});

test('review uploads are pending until admin approval; only approved media and reviews are public',async()=>{
  const bucket=memoryBucket(),env=envFor(bucket),oldFetch=global.fetch;
  global.fetch=async(url)=>{
    if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:true,hostname:'asheerahhair.com'});
    throw new Error(`Unexpected fetch ${url}`);
  };
  try{
    const form=new FormData();form.set('productHandle','straight-wig');form.set('name','Mara');form.set('rating','5');form.set('text','Beautiful and soft.');form.set('turnstileToken','valid-token');
    form.append('media',new File([Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],'review.png',{type:'image/png'}));
    const post=await handleRequest(new Request('https://worker.example/reviews',{method:'POST',headers:{Origin:'https://asheerahhair.com'},body:form}),env);
    assert.equal(post.status,201);const created=await post.json();assert.equal(created.status,'pending');
    const mediaKey=[...bucket.objects.keys()].find(key=>key.startsWith('media/'));
    const hiddenMedia=await handleRequest(new Request(`https://worker.example/review-media/${encodeURIComponent(mediaKey)}`,{headers:{Origin:'https://asheerahhair.com'}}),env);
    assert.equal(hiddenMedia.status,404);
    const publicBefore=await handleRequest(new Request('https://worker.example/reviews?product=straight-wig',{headers:{Origin:'https://asheerahhair.com'}}),env);
    assert.deepEqual(await publicBefore.json(),{reviews:[]});
    const pending=await handleRequest(new Request('https://worker.example/reviews/pending',{headers:{Origin:'https://asheerahhair.com',Authorization:'Bearer review-admin-token'}}),env);
    assert.equal(pending.status,200);const queue=await pending.json();assert.equal(queue.reviews.length,1);assert.equal(queue.reviews[0].id,created.id);assert.equal(queue.reviews[0].media.length,1);
    const adminMedia=await handleRequest(new Request(`https://worker.example/review-media/${encodeURIComponent(mediaKey)}`,{headers:{Origin:'https://asheerahhair.com',Authorization:'Bearer review-admin-token'}}),env);
    assert.equal(adminMedia.status,200);
    const unauth=await handleRequest(new Request('https://worker.example/reviews/moderate',{method:'POST',headers:{Origin:'https://asheerahhair.com','Content-Type':'application/json'},body:JSON.stringify({reviewId:created.id,decision:'approve'})}),env);
    assert.equal(unauth.status,401);
    const approve=await handleRequest(new Request('https://worker.example/reviews/moderate',{method:'POST',headers:{Origin:'https://asheerahhair.com',Authorization:'Bearer review-admin-token','Content-Type':'application/json'},body:JSON.stringify({reviewId:created.id,decision:'approve'})}),env);
    assert.equal(approve.status,200);
    const publicAfter=await handleRequest(new Request('https://worker.example/reviews?product=straight-wig',{headers:{Origin:'https://asheerahhair.com'}}),env);
    const reviews=await publicAfter.json();assert.equal(reviews.reviews.length,1);assert.equal(reviews.reviews[0].name,'Mara');assert.equal(reviews.reviews[0].media.length,1);
    const publicMedia=await handleRequest(new Request(reviews.reviews[0].media[0].url,{headers:{Origin:'https://asheerahhair.com'}}),env);
    assert.equal(publicMedia.status,200);assert.equal(publicMedia.headers.get('content-type'),'image/png');
    const mediaWithoutOrigin=await handleRequest(new Request(reviews.reviews[0].media[0].url),env);
    assert.equal(mediaWithoutOrigin.status,200);
  }finally{global.fetch=oldFetch;}
});

test('review upload rejects unsupported media and missing anti-bot token',async()=>{
  const bucket=memoryBucket(),env=envFor(bucket),oldFetch=global.fetch;
  global.fetch=async()=>Response.json({success:false});
  try{
    const badFile=new FormData();badFile.set('productHandle','straight-wig');badFile.set('name','Mara');badFile.set('rating','5');badFile.set('text','Review text');badFile.set('turnstileToken','valid-token');badFile.append('media',new File(['bad'],'file.exe',{type:'application/octet-stream'}));
    const bad=await handleRequest(new Request('https://worker.example/reviews',{method:'POST',headers:{Origin:'https://asheerahhair.com'},body:badFile}),env);assert.equal(bad.status,415);
    const noToken=new FormData();noToken.set('productHandle','straight-wig');noToken.set('name','Mara');noToken.set('rating','5');noToken.set('text','Review text');
    const noCaptcha=await handleRequest(new Request('https://worker.example/reviews',{method:'POST',headers:{Origin:'https://asheerahhair.com'},body:noToken}),env);assert.equal(noCaptcha.status,403);
  }finally{global.fetch=oldFetch;}
});
