'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const create=require('../assets/js/lossless-images.js');
function page({webp=true,blocked=false,baseURI='https://asheerahhair.com/'}={}){
 const listeners={};let probes=0;
 const doc={baseURI,addEventListener(name,fn,capture){assert.equal(capture,true);listeners[name]=fn;},createElement(){probes++;if(blocked)throw Error('Canvas blocked');return {toDataURL:()=>webp?'data:image/webp;base64,test':'data:image/png;base64,test'};}};
 const images=create(doc);return {images,listeners,get probes(){return probes;}};
}
const original='assets/img/chocolate-caramel-highlight-wig-2-fast-v2.png';
test('lossless display leaves order URLs untouched and only selects supported smaller copies',()=>{
 const p=page(),unknown='assets/img/x-onika-ginger-bombshell-1.png';
 assert.equal(p.images.url(unknown),unknown);assert.equal(p.probes,0);
 assert.match(p.images.url(original),/-lossless-v1\.webp$/);
 p.images.url(original);assert.equal(p.probes,1);
 const data={image:original};p.images.url(data.image);assert.equal(data.image,original);
});
test('unsupported or blocked canvas preserves existing original image URLs',()=>{
 for(const opts of [{webp:false},{blocked:true}])assert.equal(page(opts).images.url(original),original);
});
test('a failed optimized image restores the original and does not retry indefinitely',()=>{
 const p=page(),image={tagName:'IMG',src:new URL(p.images.url(original),'https://asheerahhair.com/').href,currentSrc:''};
 p.listeners.error({target:image});assert.equal(image.src,original);
 p.listeners.error({target:image});assert.equal(image.src,original);
 const stale={tagName:'IMG',src:new URL(p.images.url(original),'https://asheerahhair.com/').href,currentSrc:'https://asheerahhair.com/assets/img/previous.jpg'};
 p.listeners.error({target:stale});assert.equal(stale.src,original);
});
test('picture fallback restores the selected desktop artwork, not the mobile image',()=>{
 const p=page({baseURI:'https://example.com/store/'}),desktop='assets/img/water-curly-crochet-human-hair-desktop-v2.png';
 const optimized=p.images.url(desktop),source={srcset:optimized,removeAttribute(name){this.removed=name;}};
 const image={tagName:'IMG',currentSrc:new URL(optimized,'https://example.com/store/').href,src:'assets/img/mobile.jpg',parentElement:{tagName:'PICTURE',querySelectorAll:()=>[source]}};
 p.listeners.error({target:image});assert.equal(source.srcset,desktop);assert.equal(image.src,desktop);assert.equal(source.removed,'type');
});
