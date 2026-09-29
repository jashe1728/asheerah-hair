const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../assets/js/app.js'),'utf8');

function evaluateReviewMarkup(){
  const block=app.match(/function productReviewsHTML\(p\)\{[\s\S]*?\n\}/)?.[0];
  if(!block)throw new Error('productReviewsHTML not found');
  const context={productReviews:()=>[],productReviewListHTML:()=>'<p class="reviews-empty">reviews_empty</p>',starsHTML:()=>'',uiTxt:key=>key,escapeHTML:value=>String(value),CONFIG:{reviewAPIURL:'',reviewTurnstileSiteKey:''}};
  vm.runInNewContext(`${block}\nglobalThis.renderReviews=productReviewsHTML;`,context);
  return context.renderReviews({handle:'straight-wig'});
}

test('product review form offers safe image and video attachment choices',()=>{
  const html=evaluateReviewMarkup();
  assert.match(html,/type="file"/);
  assert.match(html,/accept="image\/jpeg,image\/png,image\/webp,video\/mp4,video\/webm"/);
  assert.match(html,/multiple/);
});

test('product review form explains local-only storage and upload setup',()=>{
  const html=evaluateReviewMarkup();
  assert.match(html,/review_media_label/);
  assert.match(html,/review_upload_setup/);
  assert.match(html,/review_note/);
});
