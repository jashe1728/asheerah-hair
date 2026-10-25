/* Lossless display copies. Original URLs remain the data source and fallback. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.AHImages=factory(root.document);
})(typeof window==='undefined'?globalThis:window,function(document){
  'use strict';
  const files=Object.freeze({
    'assets/img/chocolate-caramel-highlight-wig-2-fast-v2.png':'assets/img/chocolate-caramel-highlight-wig-2-fast-v2-lossless-v1.webp',
    'assets/img/chocolate-caramel-highlight-wig-3-fast-v2.png':'assets/img/chocolate-caramel-highlight-wig-3-fast-v2-lossless-v1.webp',
    'assets/img/pixie-curly-crochet-human-hair-desktop-v2.png':'assets/img/pixie-curly-crochet-human-hair-desktop-v2-lossless-v1.webp',
    'assets/img/water-wave-crochet-human-hair-desktop-v2.png':'assets/img/water-wave-crochet-human-hair-desktop-v2-lossless-v1.webp',
    'assets/img/water-curly-crochet-human-hair-desktop-v2.png':'assets/img/water-curly-crochet-human-hair-desktop-v2-lossless-v1.webp',
    'assets/img/burmese-curly-crochet-human-hair-desktop-v2.png':'assets/img/burmese-curly-crochet-human-hair-desktop-v2-lossless-v1.webp',
    'assets/img/hero-desktop-sharp-v2.png':'assets/img/hero-desktop-sharp-v2-lossless-v1.webp',
  });
  let supported;
  function url(src){
    if(!Object.prototype.hasOwnProperty.call(files,src))return src;
    if(supported===undefined){
      try{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;supported=canvas.toDataURL('image/webp').startsWith('data:image/webp');}
      catch{supported=false;}
    }
    return supported?files[src]:src;
  }
  function fallback(event){
    const image=event.target;if(image?.tagName!=='IMG')return;
    const picture=image.parentElement?.tagName==='PICTURE';
    let current;try{current=new URL(picture?(image.currentSrc||image.src):(image.src||image.currentSrc),document.baseURI).href;}catch{return;}
    for(const [original,optimized] of Object.entries(files)){
      if(new URL(optimized,document.baseURI).href!==current)continue;
      // A selected <source> must also be restored, otherwise it overrides img.src.
      if(picture){
        for(const source of image.parentElement.querySelectorAll('source')){
          if(source.srcset&&new URL(source.srcset,document.baseURI).href===current){source.srcset=original;source.removeAttribute('type');}
        }
      }
      image.src=original;return;
    }
  }
  document.addEventListener('error',fallback,true);
  return {url};
});
