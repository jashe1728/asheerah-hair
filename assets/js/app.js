/* Asheerah Hair — shared app logic: catalog, cart, currency, pricing, checkout, search.
 * Loaded AFTER config.js and i18n.js.
 * Single source of truth for pricing lives in variantPricing() — used by shop,
 * product, cart and checkout so every surface shows the same amounts.
 */
'use strict';

let checkoutSubmitting = false; // guards against double order submission

const CONFIG = window.CONFIG || {
  currency:'EUR', rates:{EUR:1,USD:1.08,XOF:660}, shipping:null, shippingEta:'6–10 days', taxRate:0,
  coupons:{}, payment:{ pending:{configured:false} },
  whatsapp:'351914522508', email:'asheerahhair@gmail.com',
  backendURL:'', stripeCheckoutURL:'', stripePublishable:'', paypalClientId:'', mbwayKey:'',
  reviewAPIURL:'', reviewTurnstileSiteKey:'',
};

const CURRENCIES = {
  EUR: { symbol: '€', label: 'EUR' },
  USD: { symbol: '$', label: 'USD' },
  XOF: { symbol: 'FCFA ', label: 'FCFA' },
};

if (typeof I18N === 'object') Object.assign(I18N, {
  review_choose_product:{pt:'Escolhe o produto que queres avaliar',en:'Choose the product you want to review',es:'Elige el producto que quieres valorar',de:'Wähle das Produkt für deine Bewertung',fr:'Choisissez le produit à évaluer',it:'Scegli il prodotto da recensire'},
  review_media_label:{pt:'Adicionar fotos ou vídeo',en:'Add photos or video',es:'Añadir fotos o vídeo',de:'Fotos oder Video hinzufügen',fr:'Ajouter des photos ou une vidéo',it:'Aggiungi foto o video'},
  review_upload_setup:{pt:'O carregamento de imagens e vídeos está a ser configurado.',en:'Photo and video uploads are being set up.',es:'La carga de fotos y vídeos se está configurando.',de:'Der Foto- und Video-Upload wird eingerichtet.',fr:'Le téléversement des photos et vidéos est en cours de configuration.',it:'Il caricamento di foto e video è in configurazione.'},
  review_moderation_note:{pt:'As fotos e os vídeos serão revistos antes de aparecerem publicamente.',en:'Photos and videos are reviewed before appearing publicly.',es:'Las fotos y los vídeos se revisan antes de mostrarse públicamente.',de:'Fotos und Videos werden vor der öffentlichen Anzeige geprüft.',fr:'Les photos et vidéos sont vérifiées avant leur publication.',it:'Foto e video vengono controllati prima della pubblicazione.'},
  review_media_alt:{pt:'Imagem ou vídeo da avaliação',en:'Review photo or video',es:'Foto o vídeo de la opinión',de:'Bewertungsfoto oder -video',fr:'Photo ou vidéo de l’avis',it:'Foto o video della recensione'},
  review_submit_error:{pt:'Não foi possível enviar a avaliação. Tenta novamente mais tarde.',en:'Could not submit the review. Please try again later.',es:'No se pudo enviar la opinión. Inténtalo de nuevo más tarde.',de:'Die Bewertung konnte nicht gesendet werden. Bitte später erneut versuchen.',fr:'Impossible d’envoyer l’avis. Réessayez plus tard.',it:'Impossibile inviare la recensione. Riprova più tardi.'},
  review_pending:{pt:'Avaliação enviada. Será publicada após aprovação.',en:'Review submitted. It will appear after approval.',es:'Opinión enviada. Se publicará tras su aprobación.',de:'Bewertung gesendet. Sie erscheint nach der Freigabe.',fr:'Avis envoyé. Il sera publié après approbation.',it:'Recensione inviata. Sarà pubblicata dopo l’approvazione.'},
  review_media_limit:{pt:'Até 3 ficheiros: máximo de 8 MB por ficheiro e 20 MB no total.',en:'Up to 3 files: maximum 8 MB per file and 20 MB total.',es:'Hasta 3 archivos: máximo 8 MB por archivo y 20 MB en total.',de:'Bis zu 3 Dateien: maximal 8 MB pro Datei und 20 MB insgesamt.',fr:'Jusqu’à 3 fichiers : 8 Mo maximum par fichier et 20 Mo au total.',it:'Fino a 3 file: massimo 8 MB per file e 20 MB in totale.'},
});

const REMOTE_PRODUCT_REVIEWS = Object.create(null);
const REMOTE_PRODUCT_REVIEWS_LOADED = new Set();

// ---------- Catalog ----------
let CATALOG = null;
const SEEDED_PRODUCT_REVIEWS = [
  { productHandle:'straight-bundles', name:'Ciaraly', rating:5, text:'Amazing, love it. Alta qualidade.' },
  { productHandle:'burmese-curly-bundles', name:'Deivaforbs', rating:5, text:'Best hair of my life, super soft, smooth and shiny.' },
];
async function loadCatalog(){
  if (CATALOG) return CATALOG;
  const r = await fetch('catalog.json');
  CATALOG = await r.json();
  return CATALOG;
}
function findProduct(handle){
  if (!CATALOG) return null;
  return CATALOG.products.find(p => p.handle === handle);
}

// ---------- Currency & money ----------
function curSym(code){ const c = CURRENCIES[code]; return c ? c.symbol : code; }
function curCode(){ const saved=localStorage.getItem('ash_cur'); return CURRENCIES[saved] ? saved : (CURRENCIES[CONFIG.currency] ? CONFIG.currency : 'EUR'); }
function money(priceEur, cur){
  const rate = CONFIG.rates[cur] || 1;
  const sym = (CURRENCIES[cur] || CURRENCIES.EUR).symbol;
  if (cur === 'XOF') return sym + new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Math.round(priceEur * rate));
  return sym + (priceEur * rate).toFixed(2).replace(/\.00$/,'');
}
/* Price in cents (minimum monetary unit) to avoid float rounding issues. */
function toCents(eur){ return Math.round((Number(eur)||0) * 100); }
function fromCents(c){ return c / 100; }
function round2(x){ return Math.round((Number(x)||0) * 100) / 100; }

/* ---- Single pricing source. Given a product + chosen options, returns the
 * authoritative price for that variant and any promo (compare) price.
 * `found:false` means the exact combination has no price in the catalog —
 * the frontend must NOT show a made-up price and must not allow purchase. ---- */
function variantPricing(p, opts){
  const v = matchVariant(p, opts || {});
  const found = !!v;
  const priceEur = v ? (v.price_eur || 0) : 0;
  const compareEur = v && v.compare_eur ? v.compare_eur : null;
  const hasPromo = found && !!(compareEur && compareEur > priceEur);
  return {
    v, found, priceEur, compareEur,
    hasPromo,
    savingsEur: hasPromo ? round2(compareEur - priceEur) : 0,
  };
}

/* HTML for a price, showing original (strikethrough) + sale when a promo exists,
 * otherwise just the current price. Accessible via visually-hidden text. */
function priceHTML(priceEur, compareEur, cur){
  const hasPromo = !!compareEur && compareEur > priceEur;
  if (!hasPromo){
    return `<span class="now">${money(priceEur, cur)}</span>`;
  }
  const sr = `<span class="sr-only">${uiTxt('original_price')} ${money(compareEur,cur)} · ${uiTxt('sale_price')} ${money(priceEur,cur)}</span>`;
  return `${sr}<del class="was">${money(compareEur, cur)}</del> <span class="now">${money(priceEur, cur)}</span>`;
}

// ---------- Variants ----------
function matchVariant(p, opts){
  if (!p.variants) return null;
  return p.variants.find(v =>
    String(v.opt1||'')===String(opts.opt1||'') &&
    String(v.opt2||'')===String(opts.opt2||'') &&
    String(v.opt3||'')===String(opts.opt3||'') &&
    String(v.opt4||'')===String(opts.opt4||'')) || null;
}

// ---------- Cart (localStorage) ----------
function getCart(){ try { return JSON.parse(localStorage.getItem('ash_cart')||'[]'); } catch(e){ return []; } }
function saveCart(c){ localStorage.setItem('ash_cart', JSON.stringify(c)); }
function cartCount(){ return getCart().reduce((n,i)=>n+i.qty,0); }

/* Per-item pricing from stored variant values. */
function itemOriginalEur(i){ const o = i.compareEur && i.compareEur > i.priceEur ? i.compareEur : i.priceEur; return o; }

/* Cart financial summary (all in EUR, integer cents internally). */
function cartTotals(coupon, shippingAmount=CONFIG.shipping){
  const cart = getCart();
  let subtotalOriginal = 0, itemDiscount = 0;
  cart.forEach(i => {
    const orig = itemOriginalEur(i);
    subtotalOriginal += orig * i.qty;
    itemDiscount += (orig - i.priceEur) * i.qty;
  });
  subtotalOriginal = round2(subtotalOriginal);
  itemDiscount = round2(itemDiscount);

  const merchandiseSubtotal = round2(subtotalOriginal - itemDiscount);
  let couponDiscount = 0;
  if (coupon){
    if (coupon.type === 'percent'){
      couponDiscount = round2(merchandiseSubtotal * coupon.value / 100);
    } else if (coupon.type === 'fixed'){
      couponDiscount = round2(Math.min(coupon.value, merchandiseSubtotal));
    }
  }
  const totalDiscount = round2(itemDiscount + couponDiscount);
  const subtotalFinal = round2(subtotalOriginal - totalDiscount);
  const shippingKnown = !cart.length || Number.isFinite(shippingAmount);
  const shipping = cart.length ? (shippingKnown ? shippingAmount : null) : 0;
  const taxes = round2(subtotalFinal * (CONFIG.taxRate || 0));
  const totalFinal = round2(subtotalFinal + (shippingKnown ? shipping : 0) + taxes);
  return { subtotalOriginal, itemDiscount, couponDiscount, totalDiscount, subtotalFinal, shipping, shippingKnown, taxes, totalFinal };
}

function stripeWorkerURL(path){
  if (!CONFIG.stripeCheckoutURL) return '';
  try { const url=new URL(CONFIG.stripeCheckoutURL,window.location.href); url.pathname='/'+path; url.search=''; url.hash=''; return url.href; }
  catch { return ''; }
}

function addToCart(handle, opts, qty){
  const p = findProduct(handle); if (!p) return;
  const cart = getCart();
  const key = handle + '|' + JSON.stringify(opts);
  const existing = cart.find(i => i.key === key);
  const pricing = variantPricing(p, opts);
  if (!pricing.found) return; // no exact variant price — never add a guessed price
  if (existing){
    existing.qty += qty;
    // keep the freshest price from the catalog
    existing.priceEur = pricing.priceEur;
    existing.compareEur = pricing.compareEur;
  } else {
    cart.push({
      key, handle, title:p.title, image:p.images[0], category:p.category,
      optionNames:(p.options||[]).map(o=>o.name), opts, qty,
      priceEur: pricing.priceEur, compareEur: pricing.compareEur,
      currency: CONFIG.currency,
    });
  }
  saveCart(cart);
  updateCartUI();
}

function changeQty(key, delta){
  let cart = getCart();
  const item = cart.find(i => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.key !== key);
  saveCart(cart); updateCartUI();
}
function clearCart(){ saveCart([]); updateCartUI(); }

// ---------- Coupons ----------
function getAppliedCoupon(){
  try {
    const raw = localStorage.getItem('ash_coupon');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.code) {
      localStorage.removeItem('ash_coupon');
      return null;
    }
    const def = lookupCoupon(parsed.code);
    if (!def) {
      localStorage.removeItem('ash_coupon');
      return null;
    }
    const valid = { code: String(parsed.code).trim().toUpperCase(), type: def.type, value: def.value };
    if (parsed.type !== def.type || parsed.value !== def.value) {
      localStorage.setItem('ash_coupon', JSON.stringify(valid));
    }
    return valid;
  } catch(e){
    try { localStorage.removeItem('ash_coupon'); } catch(e2){}
    return null;
  }
}
function lookupCoupon(code){
  const c = CONFIG.coupons || {};
  const key = String(code||'').trim().toUpperCase();
  return c[key] || null;
}
function applyCoupon(code){
  const def = lookupCoupon(code);
  if (!def) return { ok:false, msgKey:'coupon_invalid' };
  const totals = cartTotals(null);
  if (def.minSubtotalEur && totals.subtotalOriginal < def.minSubtotalEur){
    return { ok:false, msgKey:'coupon_invalid' };
  }
  localStorage.setItem('ash_coupon', JSON.stringify({ code:String(code).trim().toUpperCase(), type:def.type, value:def.value }));
  return { ok:true, msgKey:'coupon_applied' };
}
function removeCoupon(){ localStorage.removeItem('ash_coupon'); }

// ---------- Cart drawer / page UI ----------
function updateCartUI(){
  document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = cartCount());
  const page = document.body && document.body.dataset.page;
  if (page === 'cart'){ renderCartPage(); return; }
  if (page === 'checkout'){ renderCheckoutPage(); return; }
  renderCartDrawer();
}
function optionLabel(i, idx){
  const name = (i.optionNames && i.optionNames[idx]) || ('op' + (idx+1));
  const val = i.opts ? i.opts['opt' + (idx+1)] : '';
  return { name, val };
}
function itemMetaHTML(i){
  const parts = [];
  for (let k=1;k<=4;k++){
    const o = i.opts ? i.opts['opt'+k] : '';
    if (o) parts.push({ name:(i.optionNames&&i.optionNames[k-1])||'', val:o });
  }
  return parts.map(p=>`<span class="meta-line"><b>${escapeHTML(optionDisplayLabel(p.name))}:</b> ${escapeHTML(optionDisplayLabel(p.val))}</span>`).join('');
}
function escapeHTML(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderCartDrawer(){
  const el = document.getElementById('cartItems');
  if (!el) return;
  const cart = getCart();
  const cur = curCode();
  if (!cart.length){
    el.innerHTML = '<p class="cart-empty-note">'+uiTxt('cart_empty')+'</p>';
    return;
  }
  el.innerHTML = cart.map(i => {
    const orig = itemOriginalEur(i);
    const unit = priceHTML(i.priceEur, i.compareEur, cur);
    const subtotal = money(i.priceEur * i.qty, cur);
    const meta = itemMetaHTML(i);
    const cat = uiTxt(catKey(i.category));
    return `<div class="cart-item">
      <img src="${i.image}" alt="${escapeHTML(i.title)}">
      <div class="ci-info">
        <h4>${escapeHTML(i.title)}</h4>
        ${cat ? `<div class="ci-cat">${escapeHTML(cat)}</div>` : ''}
        <div class="meta">${meta}</div>
        <div class="ci-unit">
          <span class="ci-unit-price">${unit}</span>
          <span class="ci-unit-sub">${uiTxt('line_subtotal')}: <b>${subtotal}</b></span>
        </div>
        <div class="qty ci-qty">
          <button type="button" data-cart-key="${escapeHTML(i.key)}" data-cart-qty="-1" aria-label="${uiTxt('quantity')} −">−</button>
          <span aria-live="polite">${i.qty}</span>
          <button type="button" data-cart-key="${escapeHTML(i.key)}" data-cart-qty="1" aria-label="${uiTxt('quantity')} +">+</button>
        </div>
      </div>
      <button type="button" class="remove" data-cart-key="${escapeHTML(i.key)}" data-cart-remove="true" aria-label="${uiTxt('remove_item')}">×</button>
    </div>`;
  }).join('');
  el.querySelectorAll('button[data-cart-qty]').forEach(button => {
    button.addEventListener('click', () => changeQty(button.dataset.cartKey, Number(button.dataset.cartQty)));
  });
  el.querySelectorAll('button[data-cart-remove]').forEach(button => {
    button.addEventListener('click', () => changeQty(button.dataset.cartKey, -999));
  });
}

// ---------- Nav ----------
function initNav(){
  const burger = document.querySelector('.header-burger');
  const links = document.querySelector('.header-nav');
  if (burger && links){
    burger.addEventListener('click', ()=> links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', ()=> links.classList.remove('open')));
  }
  const page = document.body.dataset.page;
  if (page && links){
    links.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (page==='home' && (href==='index.html' || href==='../index.html')) a.classList.add('active');
      else if (href.includes('faq') && page==='faq') a.classList.add('active');
      else if (href.includes('contact') && page==='contact') a.classList.add('active');
      else if (page==='shop' && new URL(href,location.href).searchParams.get('cat') === new URLSearchParams(location.search).get('cat') && href.includes('shop')) a.classList.add('active');
    });
  }
}

// ---------- Currency & language state (single source: localStorage) ----------
function setCurrency(code){
  if (!CURRENCIES[code]) return;
  localStorage.setItem('ash_cur', code);
  if (window.renderShop) renderShop();
  if (window.renderProduct) renderProduct();
  if (window.renderCartPage) renderCartPage();
  if (window.renderCheckoutPage) renderCheckoutPage();
  if (window.updateCartUI) updateCartUI();
  if (window.updateCurrencyDropdown) updateCurrencyDropdown();
  if (window.syncMenuControls) syncMenuControls();
  syncCurrencyButtons();
}
function catKey(cat){
  return { wigs:'cat_wigs', bundles:'cat_bundles', crochet:'cat_crochet' }[cat] || '';
}

/* Header currency dropdown */
function buildCurrencyDropdown(){
  const wrap = document.getElementById('currencyDropdown');
  if (!wrap) return;
  wrap.innerHTML = '';
  const cur = curCode();
  const btn = document.createElement('button');
  btn.className = 'currency-btn';
  btn.setAttribute('aria-haspopup','listbox');
  btn.setAttribute('aria-expanded','false');
  btn.innerHTML = '<span class="cur-sym">'+curSym(cur)+'</span>'+(cur==='XOF'?'':'<span>'+cur+'</span>')+'<span class="chev">⌄</span>';
  const menu = document.createElement('div');
  menu.className = 'currency-menu';
  menu.setAttribute('role','listbox');
  Object.keys(CURRENCIES).forEach(code => {
    const c = CURRENCIES[code];
    const opt = document.createElement('button');
    opt.className = 'currency-opt' + (code===cur?' active':'');
    opt.setAttribute('role','option');
    opt.setAttribute('data-cur', code);
    opt.innerHTML = '<span class="cur-sym">'+c.symbol+'</span>'+(code==='XOF'?'':'<span>'+c.label+'</span>') + (code===cur?' ✓':'');
    opt.addEventListener('click', (e)=>{ e.stopPropagation(); setCurrency(code); closeCur(); });
    menu.appendChild(opt);
  });
  wrap.appendChild(btn);
  wrap.appendChild(menu);
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); const open = menu.classList.toggle('open'); btn.setAttribute('aria-expanded', open?'true':'false'); });
  document.addEventListener('click', ()=>{ closeCur(); });
  function closeCur(){ menu.classList.remove('open'); btn.setAttribute('aria-expanded','false'); }
  window.updateCurrencyDropdown = buildCurrencyDropdown;
}

/* Legacy .currency-switch buttons (removed from pages, kept for safety): reflect the global state. */
function syncCurrencyButtons(){
  const cur = curCode();
  document.querySelectorAll('[data-currency]').forEach(b => b.classList.toggle('active', b.dataset.currency===cur));
}
function initCurrencyButtons(){
  document.querySelectorAll('[data-currency]').forEach(b => {
    b.textContent = (CURRENCIES[b.dataset.currency]||{}).symbol;
    b.addEventListener('click', ()=> setCurrency(b.dataset.currency));
  });
  syncCurrencyButtons();
}

/* Mobile menu: inject language + currency selectors near the end of the nav. */
function buildMenuControls(){
  const nav = document.querySelector('.header-nav');
  if (!nav) return;
  if (document.getElementById('menu-controls')) return;

  const box = document.createElement('div');
  box.className = 'menu-controls';
  box.id = 'menu-controls';

  const langTitle = document.createElement('div');
  langTitle.className = 'menu-ctl-label';
  langTitle.textContent = uiTxt('lang_title');
  const langSel = document.createElement('div');
  langSel.className = 'menu-ctl-opts';
  LANGS.forEach(code => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.lang = code;
    b.className = (code===LANG?'active':'');
    b.innerHTML = '<span class="flag">'+ (FLAGS[code]||FLAGS.pt) +'</span><span>'+LANG_NAMES[code]+'</span>';
    b.addEventListener('click', ()=>{ setLang(code); syncMenuControls(); });
    langSel.appendChild(b);
  });

  const curTitle = document.createElement('div');
  curTitle.className = 'menu-ctl-label';
  curTitle.textContent = uiTxt('currency_title');
  const curSel = document.createElement('div');
  curSel.className = 'menu-ctl-opts';
  Object.keys(CURRENCIES).forEach(code => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.currency = code;
    b.className = (code===curCode()?'active':'');
    b.innerHTML = '<span class="cur-sym">'+CURRENCIES[code].symbol+'</span>'+(code==='XOF'?'':'<span>'+CURRENCIES[code].label+'</span>');
    b.addEventListener('click', ()=>{ setCurrency(code); syncMenuControls(); });
    curSel.appendChild(b);
  });

  box.appendChild(langTitle); box.appendChild(langSel);
  box.appendChild(curTitle); box.appendChild(curSel);
  nav.appendChild(box);
}
function syncMenuControls(){
  const box = document.getElementById('menu-controls');
  if (!box) return;
  box.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang===LANG));
  box.querySelectorAll('[data-currency]').forEach(b => b.classList.toggle('active', b.dataset.currency===curCode()));
}
window.syncMenuControls = syncMenuControls;

// ---------- Search drawer (slides in from the LEFT) ----------
let searchActiveEl = null;
function buildSearchDrawer(){
  if (document.getElementById('searchDrawer')) return;
  const el = document.createElement('div');
  el.id = 'searchDrawer';
  el.className = 'search-drawer';
  el.setAttribute('role','dialog');
  el.setAttribute('aria-modal','true');
  el.setAttribute('aria-label', uiTxt('search_title'));
  el.innerHTML = `
    <div class="search-overlay" data-close-search></div>
    <div class="search-panel" role="document">
      <div class="search-head">
        <h2 id="searchTitle">${uiTxt('search_title')}</h2>
        <button type="button" class="search-close" data-close-search aria-label="${uiTxt('search_close')}">×</button>
      </div>
      <div class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <input id="searchInput" type="search" placeholder="${uiTxt('search_placeholder')}" autocomplete="off" aria-controls="searchResults">
      </div>
      <ul id="searchResults" class="search-results" role="listbox"></ul>
      <p id="searchEmpty" class="search-empty" hidden></p>
    </div>`;
  document.body.appendChild(el);

  const drawer = el;
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  const empty = document.getElementById('searchEmpty');

  function open(){
    // close the mobile menu if it is open
    const nav = document.querySelector('.header-nav');
    if (nav) nav.classList.remove('open');
    searchActiveEl = document.activeElement; // remember trigger for focus return
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
    // focus the field after the panel has rendered (rAF)
    requestAnimationFrame(()=>{ input.focus(); });
    input.value = '';
    results.innerHTML = '';
    empty.hidden = true;
  }
  function close(){
    drawer.classList.remove('open');
    document.body.style.overflow = '';
    if (searchActiveEl && searchActiveEl.focus) searchActiveEl.focus();
    searchActiveEl = null;
  }

  function render(query){
    const q = (query||'').trim().toLowerCase();
    results.innerHTML = '';
    if (!q){ empty.hidden = true; return; }
    const matches = CATALOG ? CATALOG.products.filter(p =>
      (p.title||'').toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q)) : [];
    if (!matches.length){
      empty.hidden = false;
      empty.textContent = `${uiTxt('search_no_results')} “${query}”.`;
      return;
    }
    empty.hidden = true;
    matches.forEach(p => {
      const li = document.createElement('li');
      li.setAttribute('role','option');
      li.innerHTML = `<a href="product.html?h=${encodeURIComponent(p.handle)}" class="search-result">
        <img src="${p.images[0]||''}" alt="" loading="lazy">
        <span class="sr-only">${escapeHTML(p.title)}</span>
        <span class="search-result-txt">${escapeHTML(p.title)}</span>
      </a>`;
      li.addEventListener('click', ()=> close()); // closes on navigation
      results.appendChild(li);
    });
  }

  input.addEventListener('input', ()=> render(input.value));
  input.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape'){ e.preventDefault(); close(); }
  });
  drawer.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape'){ e.preventDefault(); close(); }
    if (e.key === 'Tab'){ trapFocus(e, drawer); }
  });
  drawer.querySelectorAll('[data-close-search]').forEach(el2 => el2.addEventListener('click', close));

  window.openSearch = open;
  window.closeSearch = close;
}
/* Simple focus trap for the drawer: keep Tab within the panel's focusables. */
function trapFocus(e, container){
  const focusables = container.querySelectorAll('button, a, input, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length-1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
function initSearchBtn(){
  const sb = document.getElementById('searchBtn');
  if (!sb) return;
  sb.addEventListener('click', ()=>{ buildSearchDrawer(); window.openSearch && window.openSearch(); });
}

// ---------- Reveal on scroll ----------
function initReveal(){
  document.documentElement.classList.add('js');
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    return;
  }
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(en => { if (en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
}

// ---------- Newsletter ----------
function initNewsletter(){
  const form = document.getElementById('nlForm');
  if (!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = (document.getElementById('nlEmail')?.value || '').trim();
    const msg = document.getElementById('nlMsg');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      if (msg){ msg.textContent = uiTxt('fld_email'); msg.style.display='block'; }
      return;
    }
    try {
      const list = JSON.parse(localStorage.getItem('ash_subscribers')||'[]');
      if (!list.includes(email)) list.push(email);
      localStorage.setItem('ash_subscribers', JSON.stringify(list));
    } catch(err){}
    if (CONFIG && CONFIG.backendURL){
      try {
        await fetch(CONFIG.backendURL, {
          method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
          body: JSON.stringify({ type:'subscribe', email })
        });
      } catch(err){ /* offline/local — saved locally anyway */ }
    }
    if (msg){ msg.textContent = uiTxt('nl_ok'); msg.style.display = 'block'; }
    if (form.querySelector('input')) form.querySelector('input').value = '';
  });
}

// ---------- Page init ----------
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initSearchBtn();
  buildMenuControls();
  buildCurrencyDropdown();
  initNewsletter();
  initReveal();
  initCurrencyButtons();
  updateCartUI();
  const cur = curCode();
  document.querySelectorAll('[data-currency]').forEach(b => {
    b.classList.toggle('active', b.dataset.currency===cur);
    b.textContent = (CURRENCIES[b.dataset.currency]||{}).symbol;
  });
  try { await loadCatalog(); } catch(e) { console.warn('catalog load failed', e); }
  const page = document.body.dataset.page;
  if (page === 'home') renderFeatured();
  if (page === 'shop') renderShop();
  if (page === 'reviews') renderReviewPage();
  if (page === 'product') renderProduct();
  if (page === 'cart') renderCartPage();
  if (page === 'checkout') renderCheckoutPage();
});

// ---------- Shop grid ----------
function renderFeatured(){
  const grid = document.getElementById('featuredGrid'); if (!grid || !CATALOG) return;
  const cur = curCode();
  const preferred = ['wigs','bundles','crochet'];
  const pools = Object.fromEntries(preferred.map(cat => [cat, CATALOG.products.filter(p => p.category === cat && p.images && p.images[0])]));
  // Keep the homepage as a four-card static edit: one item from each category,
  // then a second wig, with the full catalogue one click away below.
  const list = preferred.map(cat => pools[cat][0]).filter(Boolean);
  for (const cat of preferred){
    if (list.length >= 4) break;
    if (pools[cat][1]) list.push(pools[cat][1]);
  }
  grid.innerHTML = list.slice(0,4).map(p => {
    const pricing = variantPricing(p, defaultOpts(p));
    const price = priceHTML(pricing.priceEur, pricing.hasPromo ? pricing.compareEur : null, cur);
    return `<a class="product-card featured-card" data-category="${escapeHTML(p.category)}" href="product.html?h=${encodeURIComponent(p.handle)}">
      <div class="img"><img src="${p.images[0]}" alt="${escapeHTML(p.title)}" loading="lazy"></div>
      <div class="info"><span class="featured-category">${escapeHTML(p.category)}</span><h3>${escapeHTML(p.title)}</h3><div class="price">${price}</div><span class="buy-btn">${uiTxt('view_product')}</span></div>
    </a>`;
  }).join('');
}
const CROCHET_DESKTOP_IMAGES = Object.freeze({
  'pixie-curly-crochet-human-hair':'assets/img/pixie-curly-crochet-human-hair-desktop-v2.png',
  'water-wave-crochet-human-hair':'assets/img/water-wave-crochet-human-hair-desktop-v2.png',
  'water-curly-crochet-human-hair':'assets/img/water-curly-crochet-human-hair-desktop-v2.png',
  'burmese-curly-crochet-human-hair':'assets/img/burmese-curly-crochet-human-hair-desktop-v2.png',

});
function shopCardImageHTML(p){
  const original=`<img src="${escapeHTML(p.images[0]||'')}" alt="${escapeHTML(p.title)}" loading="lazy">`;
  const desktop=CROCHET_DESKTOP_IMAGES[p.handle];
  return desktop?`<picture><source media="(min-width: 641px)" srcset="${desktop}">${original}</picture>`:original;
}
function renderShop(){
  const grid = document.getElementById('shopGrid'); if (!grid) return;
  const cur = curCode();
  const cat = new URLSearchParams(location.search).get('cat');
  let list = CATALOG.products;
  if (cat) list = list.filter(p => p.category === cat);
  grid.innerHTML = list.map(p => {
    const pricing = variantPricing(p, defaultOpts(p));
    const priceHTMLstr = priceHTML(pricing.priceEur, pricing.hasPromo ? pricing.compareEur : null, cur);
    return `<a class="product-card shop-card" data-category="${escapeHTML(p.category)}" href="product.html?h=${p.handle}">
      <div class="img">${shopCardImageHTML(p)}</div>
      <div class="info">
        <h3>${escapeHTML(p.title)}</h3>
        <div class="price">${priceHTMLstr}</div>
        <span class="buy-btn">${uiTxt('btn_shop')}</span>
      </div>
    </a>`;
  }).join('');
}
function defaultOpts(p){
  const o = {};
  (p.options||[]).forEach((op,i)=>{ o['opt'+(i+1)] = op.values[0]; });
  return o;
}

function reviewAPIEndpoint(path){
  try{const url=new URL(CONFIG.reviewAPIURL);if(url.protocol!=='https:')return null;url.pathname=path;url.search='';return url;}
  catch{return null;}
}
function productReviews(p){
  let saved=[];
  try{ saved=JSON.parse(localStorage.getItem('ash_product_reviews')||'[]'); }catch(e){ saved=[]; }
  return SEEDED_PRODUCT_REVIEWS.filter(r=>r.productHandle===p.handle)
    .concat(saved.filter(r=>r.productHandle===p.handle),REMOTE_PRODUCT_REVIEWS[p.handle]||[]);
}
function starsHTML(rating){
  const n=Math.max(1,Math.min(5,Number(rating)||5));
  return '★★★★★'.slice(0,n)+'<span class="stars-muted">'+'★★★★★'.slice(0,5-n)+'</span>';
}
function productReviewMediaHTML(media){
  const html=(media||[]).map(item=>{
    const type=String(item.contentType||''),src=String(item.url||'');
    if(!src.startsWith('https://'))return '';
    const url=escapeHTML(src),alt=escapeHTML(uiTxt('review_media_alt'));
    if(['image/jpeg','image/png','image/webp'].includes(type))return `<img src="${url}" alt="${alt}" loading="lazy">`;
    if(['video/mp4','video/webm'].includes(type))return `<video controls preload="metadata" aria-label="${alt}"><source src="${url}" type="${escapeHTML(type)}"></video>`;
    return '';
  }).join('');
  return html?`<div class="product-review-media">${html}</div>`:'';
}
function productReviewListHTML(reviews){
  return reviews.length
    ? reviews.map(r=>`<article class="product-review"><div class="review-stars" aria-label="${Number(r.rating)||5} out of 5 stars">${starsHTML(r.rating)}</div><p>${escapeHTML(r.text)}</p>${productReviewMediaHTML(r.media)}<strong>${escapeHTML(r.name)}</strong><span class="review-source">${uiTxt('customer_review')}</span></article>`).join('')
    : `<p class="reviews-empty">${uiTxt('reviews_empty')}</p>`;
}
async function loadRemoteProductReviews(handle){
  const endpoint=reviewAPIEndpoint('/reviews');
  if(!endpoint||REMOTE_PRODUCT_REVIEWS_LOADED.has(handle))return;
  REMOTE_PRODUCT_REVIEWS_LOADED.add(handle);endpoint.searchParams.set('product',handle);
  try{
    const response=await fetch(endpoint.href,{headers:{Accept:'application/json'},credentials:'omit'});
    if(!response.ok)throw new Error('Review fetch failed');
    const body=await response.json();REMOTE_PRODUCT_REVIEWS[handle]=Array.isArray(body.reviews)?body.reviews:[];
    if(window._product&&window._product.handle===handle){const list=document.querySelector('.product-review-list');if(list)list.innerHTML=productReviewListHTML(productReviews(window._product));}
  }catch{REMOTE_PRODUCT_REVIEWS_LOADED.delete(handle);}
}
function productReviewsHTML(p){
  const reviews=productReviews(p);
  const list=productReviewListHTML(reviews);
  const mediaEnabled=Boolean(CONFIG.reviewAPIURL&&CONFIG.reviewTurnstileSiteKey);
  return `<section id="productReviews" class="product-reviews" aria-labelledby="productReviewsTitle">
    <div class="section-head"><span class="eyebrow">${uiTxt('reviews_label')}</span><h2 id="productReviewsTitle">${uiTxt('product_reviews')}</h2></div>
    <form id="reviewForm" class="review-form" onsubmit="submitProductReview(event)">
      <h3>${uiTxt('leave_review')}</h3>
      <div class="review-form-grid"><input aria-label="${uiTxt('review_name_ph')}" name="reviewName" maxlength="80" placeholder="${uiTxt('review_name_ph')}" required><select name="reviewRating" aria-label="${uiTxt('review_rating')}" required><option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option></select></div>
      <textarea aria-label="${uiTxt('review_text_ph')}" name="reviewText" maxlength="500" rows="4" placeholder="${uiTxt('review_text_ph')}" required></textarea>
      <label class="review-media-label" for="reviewMedia">${uiTxt('review_media_label')}</label>
      <p id="reviewMediaLimits" class="review-upload-note">${uiTxt('review_media_limit')} JPEG, PNG, WebP, MP4, WebM.</p>
      <input aria-describedby="reviewMediaLimits" id="reviewMedia" class="review-media-input" name="reviewMedia" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple ${mediaEnabled?'':'disabled'}>
      ${mediaEnabled?'<input type="hidden" name="turnstileToken" value=""><div class="review-turnstile" id="reviewTurnstile"></div>':`<p class="review-upload-note">${uiTxt('review_upload_setup')}</p>`}
      <button class="btn-primary review-submit" type="submit">${uiTxt('submit_review')}</button>
      <p class="review-note">${uiTxt(mediaEnabled?'review_moderation_note':'review_note')}</p>
      <p class="review-status" role="status" aria-live="polite"></p>
    </form>
    <div class="product-review-list">${list}</div>
  </section>`;
}
function recommendedProducts(p){
  if(!CATALOG)return [];
  const same=CATALOG.products.filter(x=>x.handle!==p.handle&&x.category===p.category&&x.images&&x.images[0]);
  const rest=CATALOG.products.filter(x=>x.handle!==p.handle&&x.category!==p.category&&x.images&&x.images[0]);
  return same.concat(rest).slice(0,4);
}
function recommendationsHTML(p){
  const list=recommendedProducts(p);
  if(!list.length)return '';
  return `<section class="product-recommendations" aria-labelledby="recommendedTitle"><div class="section-head"><span class="eyebrow">${uiTxt('you_may_also_like')}</span><h2 id="recommendedTitle">${uiTxt('recommended_hair')}</h2></div><div class="recommended-grid">${list.map(x=>{const pricing=variantPricing(x,defaultOpts(x));const price=priceHTML(pricing.priceEur,pricing.hasPromo?pricing.compareEur:null,curCode());return `<a class="product-card shop-card recommended-card" data-category="${escapeHTML(x.category)}" href="product.html?h=${encodeURIComponent(x.handle)}"><div class="img"><img src="${x.images[0]}" alt="${escapeHTML(x.title)}" loading="lazy"></div><div class="info"><h3>${escapeHTML(x.title)}</h3><div class="price">${price}</div><span class="buy-btn">${uiTxt('btn_shop')}</span></div></a>`;}).join('')}</div></section>`;
}
function reviewAPIEndpoint(path){
  try{const url=new URL(CONFIG.reviewAPIURL);if(url.protocol!=='https:')return null;url.pathname=path;url.search='';return url;}
  catch{return null;}
}
async function loadRemoteProductReviews(handle){
  const endpoint=reviewAPIEndpoint('/reviews');
  if(!endpoint||REMOTE_PRODUCT_REVIEWS_LOADED.has(handle))return;
  REMOTE_PRODUCT_REVIEWS_LOADED.add(handle);endpoint.searchParams.set('product',handle);
  try{
    const response=await fetch(endpoint.href,{headers:{Accept:'application/json'},credentials:'omit'});
    if(!response.ok)throw new Error('Review fetch failed');
    const body=await response.json();REMOTE_PRODUCT_REVIEWS[handle]=Array.isArray(body.reviews)?body.reviews:[];
    if(window._product&&window._product.handle===handle){const list=document.querySelector('.product-review-list');if(list)list.innerHTML=productReviewListHTML(productReviews(window._product));}
  }catch{REMOTE_PRODUCT_REVIEWS_LOADED.delete(handle);}
}
let REVIEW_TURNSTILE_WIDGET=null;
function mountReviewTurnstile(){
  if(!CONFIG.reviewAPIURL||!CONFIG.reviewTurnstileSiteKey)return;
  const target=document.getElementById('reviewTurnstile');if(!target||target.dataset.mounted==='true')return;
  if(window.turnstile){
    target.dataset.mounted='true';
    REVIEW_TURNSTILE_WIDGET=window.turnstile.render(target,{sitekey:CONFIG.reviewTurnstileSiteKey,callback:token=>{const field=document.querySelector('[name="turnstileToken"]');if(field)field.value=token;},'expired-callback':()=>{const field=document.querySelector('[name="turnstileToken"]');if(field)field.value='';}});
    return;
  }
  if(document.getElementById('reviewTurnstileScript'))return;
  const script=document.createElement('script');script.id='reviewTurnstileScript';script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=mountReviewTurnstile';script.async=true;script.defer=true;document.head.appendChild(script);
}
window.mountReviewTurnstile=mountReviewTurnstile;
window.submitProductReview = async event => {
  event.preventDefault();
  const form=event.currentTarget,data=new FormData(form),name=String(data.get('reviewName')||'').trim(),text=String(data.get('reviewText')||'').trim(),status=form.querySelector('.review-status');
  if(!name||!text||!window._product)return;
  const rating=Math.max(1,Math.min(5,Number(data.get('reviewRating'))||5));
  const media=Array.from(data.getAll('reviewMedia')).filter(file=>file&&Number(file.size)>0);
  if(media.length>3||media.some(file=>file.size>8*1024*1024)||media.reduce((sum,file)=>sum+file.size,0)>20*1024*1024){if(status)status.textContent=uiTxt('review_media_limit');return;}
  if(media.length&&!(CONFIG.reviewAPIURL&&CONFIG.reviewTurnstileSiteKey)){if(status)status.textContent=uiTxt('review_upload_setup');return;}
  if(CONFIG.reviewAPIURL&&CONFIG.reviewTurnstileSiteKey){
    const token=String(data.get('turnstileToken')||''),endpoint=reviewAPIEndpoint('/reviews');
    if(!token||!endpoint){if(status)status.textContent=uiTxt('review_submit_error');return;}
    const button=form.querySelector('.review-submit');if(button)button.disabled=true;
    try{
      const payload=new FormData();payload.append('productHandle',window._product.handle);payload.append('name',name);payload.append('rating',String(rating));payload.append('text',text);payload.append('turnstileToken',token);
      media.forEach(file=>payload.append('media',file,file.name));
      const response=await fetch(endpoint.href,{method:'POST',body:payload,credentials:'omit'});
      if(!response.ok)throw new Error('Review submission failed');
      form.reset();if(window.turnstile&&REVIEW_TURNSTILE_WIDGET!==null)window.turnstile.reset(REVIEW_TURNSTILE_WIDGET);
      if(status)status.textContent=uiTxt('review_pending');
      REMOTE_PRODUCT_REVIEWS_LOADED.delete(window._product.handle);loadRemoteProductReviews(window._product.handle);
    }catch{if(status)status.textContent=uiTxt('review_submit_error');}
    finally{if(button)button.disabled=false;}
    return;
  }
  let saved=[];try{saved=JSON.parse(localStorage.getItem('ash_product_reviews')||'[]');}catch(e){saved=[];}
  saved.push({productHandle:window._product.handle,name,rating,text,createdAt:new Date().toISOString()});
  localStorage.setItem('ash_product_reviews',JSON.stringify(saved.slice(-50)));
  if(document.body.dataset.page==='reviews')renderReviewPage();else renderProduct();
};


function renderReviewPage(){
  const select=document.getElementById('reviewProduct'),root=document.getElementById('reviewRoot');
  if(!select||!root||!CATALOG)return;
  const selected=select.value;
  select.innerHTML='<option value="">'+uiTxt('review_choose_product')+'</option>'+CATALOG.products.map(p=>`<option value="${escapeHTML(p.handle)}">${escapeHTML(p.title)}</option>`).join('');
  select.value=selected;
  select.onchange=()=>{
    if(window.turnstile&&REVIEW_TURNSTILE_WIDGET!==null){window.turnstile.remove(REVIEW_TURNSTILE_WIDGET);REVIEW_TURNSTILE_WIDGET=null;}
    const p=findProduct(select.value);window._product=p;
    root.innerHTML=p?productReviewsHTML(p):'';
    if(p){mountReviewTurnstile();loadRemoteProductReviews(p.handle);}
  };
  select.onchange();
}

// ---------- Product page ----------
function renderProduct(){
  const handle = new URLSearchParams(location.search).get('h');
  const p = findProduct(handle);
  const root = document.getElementById('productRoot'); if (!root) return;
  if (!p){ root.innerHTML = '<p style="text-align:center">'+uiTxt('not_found')+'</p>'; return; }
  const cur = curCode();
  const opts = p.options || [];
  let sel = {}; opts.forEach(o => sel[o.name] = o.values[0]);
  window._sel = sel; window._product = p;
  document.querySelectorAll('.header-nav a').forEach(a => {
    const active = new URL(a.href).searchParams.get('cat') === p.category;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });

  const render = () => {
    const pricing = variantPricing(p, cartOpts(sel, opts));
    const price = pricing.priceEur;
    const was = pricing.hasPromo ? pricing.compareEur : null;
    const savings = pricing.savingsEur;
    const priceRow = pricing.found
      ? `<div class="price-row"><span class="now">${money(price,cur)}</span>${was?`<s>${money(was,cur)}</s>`:''}${savings>0?`<span class="save-chip">${uiTxt('you_save')} ${money(savings,cur)}</span>`:''}</div>`
      : `<div class="combo-unavailable" role="status">${uiTxt('combo_unavailable')}</div>`;
    const addBtn = pricing.found
      ? `<button class="btn-primary add-btn" onclick="addCurrentToCart()">${uiTxt('add_to_cart')}</button>`
      : `<button class="btn-primary add-btn" disabled>${uiTxt('add_to_cart')}</button>`;
    root.innerHTML = `
      <div class="pd">
        <div class="gallery" data-category="${escapeHTML(p.category)}">
          <div class="main-img"><img id="mainImg" src="${escapeHTML(p.images[0]||'')}" alt="${escapeHTML(p.title)}"></div>
          <div class="thumbs" role="group" aria-label="Product images">${p.images.slice(0,6).map((im,i)=>`<button type="button" class="thumb ${i===0?'active':''}" data-src="${escapeHTML(im)}" data-alt="${escapeHTML(p.title)} image ${i+1}" aria-label="View ${escapeHTML(p.title)} image ${i+1}" aria-pressed="${i===0?'true':'false'}"><img src="${escapeHTML(im)}" alt="" loading="lazy"></button>`).join('')}</div>
          ${(p.videos||[]).map(src=>`<video class="product-video" controls playsinline preload="none" poster="${escapeHTML(p.images[0]||'')}" aria-label="${escapeHTML(p.title)} video"><source src="${escapeHTML(src)}" type="video/mp4"></video>`).join('')}
        </div>
        <div class="buy">
          <div class="product-heading">
          <h1>${escapeHTML(p.title)}</h1>
          ${priceRow}
          <a class="review-jump" href="#reviewForm">★ ${uiTxt('leave_review')}</a>
          </div>
          ${productOptionGroupsHTML(opts, sel, cur)}
          <div class="qty">
            <span class="sr-only">${uiTxt('quantity')}</span>
            <button type="button" onclick="qtyChange(-1)" aria-label="${uiTxt('quantity')} −">−</button>
            <span id="qtyVal" aria-live="polite">${window.qtyVal||1}</span>
            <button type="button" onclick="qtyChange(1)" aria-label="${uiTxt('quantity')} +">+</button>
          </div>
          ${addBtn}
          <div class="desc"><h3>${uiTxt('description')}</h3><p>${p.description}</p></div>
        </div>
      </div>
      <div class="mobile-purchase-bar">
        <span class="mobile-purchase-price">${pricing.found ? money(price,cur) : uiTxt('combo_unavailable')}</span>
        <button class="btn-primary" type="button" onclick="addCurrentToCart()" ${pricing.found?'':'disabled'}>${uiTxt('add_to_cart')}</button>
      </div>
      ${productReviewsHTML(p)}
      ${recommendationsHTML(p)}`;
    loadRemoteProductReviews(p.handle);
    mountReviewTurnstile();
    root.querySelectorAll('.thumbs button').forEach(thumb => {
      thumb.addEventListener('click', () => window.setMain(thumb.dataset.src, thumb));
    });
    // wire lace comparison if present
    opts.forEach((o,i)=>{ if (isLaceOption(o)) wireLaceTable(i); });
  };
  render();

  window.qtyVal = 1;
  window.selectOpt = (i,val) => {
    const o = opts[i]; _sel[o.name]=val;
    render();
  };
  window.qtyChange = d => { window.qtyVal = Math.max(1, (window.qtyVal||1)+d); const e=document.getElementById('qtyVal'); if(e)e.textContent=window.qtyVal; };
  window.setMain = (src,el) => {
    const image = document.getElementById('mainImg');
    if (!image || !el) return;
    image.src = src;
    image.alt = el.dataset.alt || _product.title;
    document.querySelectorAll('.thumbs button').forEach(t=>{
      const active = t === el;
      t.classList.toggle('active', active);
      t.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };
  window.addCurrentToCart = () => {
    const o = cartOpts(sel, opts);
    if (!variantPricing(p, o).found) return; // combo unavailable — do not add
    addToCart(handle, o, window.qtyVal||1);
    const t = document.querySelector('.add-btn');
    if (t){ t.textContent = uiTxt('added'); setTimeout(()=>{ t.textContent = uiTxt('add_to_cart'); }, 1400); }
  };
}
function productOptionGroupsHTML(opts, sel, cur){
  const groups = (opts || []).map((o,i)=>optionGroupHTML(o,sel,i,cur)).join('');
  return `<div class="pd-option-groups">${groups}</div>`;
}
function modelOptionLabel(name, value){
  if (window._product?.model_options?.[name] !== value) return '';
  const labels={pt:'modelo',en:'model',es:'modelo',de:'Model',fr:'modèle',it:'modella'};
  return ` <small class="model-option">(${labels[document.documentElement.lang.slice(0,2)]||'modelo'})</small>`;
}
function cartOpts(sel, opts){
  return {
    opt1: sel[opts[0]?.name||'']||'',
    opt2: sel[opts[1]?.name||'']||'',
    opt3: sel[opts[2]?.name||'']||'',
    opt4: sel[opts[3]?.name||'']||'',
  };
}
function isLaceOption(o){ return /lace/i.test(o.name||''); }

/* Render one option group. Lace options on wigs render as a 2-column
 * Transparent | HD comparison by size; everything else renders as pills. */
function optionDisplayLabel(value){
  const raw = String(value == null ? '' : value);
  const names = {
    'Hair Length':'option_hair_length','Lace':'option_lace','Hair Density':'option_hair_density',
    'Cap Size':'option_cap_size','Weight':'option_weight','Bundle Weight':'option_bundle_weight',
  };
  const values = { SMALL:'cap_small', MEDIUM:'cap_medium', LARGE:'cap_large' };
  const key = names[raw] || values[raw.toUpperCase()];
  return key ? (uiTxt(key) || raw) : raw;
}
function optionGroupHTML(o, sel, idx, cur){
  const label = escapeHTML(optionDisplayLabel(o.name));
  const kind = /length/i.test(o.name) ? 'length' : /density/i.test(o.name) ? 'density' : /cap/i.test(o.name) ? 'cap-size' : 'standard';
  if (isLaceOption(o) && hasLaceTypes(o.values)){
    const { transparent, hd } = laceColumns(o.values);
    const curVal = sel[o.name];
    const btn = (val) => {
      const active = val === curVal;
      return `<button type="button" class="lace-cell${active?' active':''}" onclick="selectOpt(${idx},'${escapeAttr(val)}')" aria-pressed="${active}">${escapeHTML(val)}</button>`;
    };
    const rows = Object.keys(transparent).map(size => `
      <div class="lace-row">
        <div class="lace-col">${btn(transparent[size])}</div>
        <div class="lace-col">${btn(hd[size])}</div>
      </div>`).join('');
    return `<div class="option-group option-group--lace">
      <label>${label}</label>
      <div class="lace-cmp" role="group" aria-label="${escapeHTML(label)}">
        <div class="lace-head">
          <span class="lace-head-t">${uiTxt('lace_transparent')}</span>
          <span class="lace-head-h">${uiTxt('lace_hd')}</span>
        </div>
        ${rows}
      </div>
    </div>`;
  }
  return `<div class="option-group option-group--${kind}">
    <label>${label}</label>
    <div class="pills">
      ${o.values.map(vl=>`<button type="button" class="pill ${sel[o.name]===vl?'active':''}" onclick="selectOpt(${idx},'${escapeAttr(vl)}')" aria-pressed="${sel[o.name]===vl}">${escapeHTML(optionDisplayLabel(vl))}${kind==='length' && /^\d+$/.test(vl) ? '″' : ''}${modelOptionLabel(o.name,vl)}</button>`).join('')}
    </div>
  </div>`;
}
function escapeAttr(s){ return String(s).replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

/* Group lace values into Transparent / HD columns by normalized size. */
function laceColumns(values){
  const norm = s => String(s).toLowerCase().replace(/[×x]/g,'x').replace(/\s+/g,' ').trim();
  const transparent = {}, hd = {};
  values.forEach(v => {
    const n = norm(v);
    let size = n, type = '';
    if (n.indexOf('transparent') !== -1){ type='t'; size = n.replace('transparent','').trim(); }
    else if (/hd$/.test(n)){ type='h'; size = n.replace(/\s*hd$/,'').trim(); }
    if (type==='t') transparent[size]=v;
    else if (type==='h') hd[size]=v;
  });
  return { transparent, hd };
}
function hasLaceTypes(values){
  const j = values.join(' ').toLowerCase();
  return j.indexOf('transparent') !== -1 && /hd/.test(j);
}
function wireLaceTable(idx){
  // lace cells are buttons with onclick="selectOpt(idx,...)" — nothing extra needed,
  // but ensure clicking updates ARIA state by re-render (handled in selectOpt→render).
}

// ---------- Cart page ----------
function renderCartPage(){
  const root = document.getElementById('cartRoot'); if (!root) return;
  const cur = curCode();
  const cart = getCart();
  const t = cartTotals(getAppliedCoupon());
  const hasItems = cart.length > 0;

  root.innerHTML = `
    <div id="cartItems"></div>
    ${hasItems ? `
    <div class="summary">
      <div class="row"><span>${uiTxt('subtotal')}</span><span>${money(t.subtotalOriginal,cur)}</span></div>
      ${t.itemDiscount>0?`<div class="row disc"><span>${uiTxt('discount_total')}</span><span>−${money(t.itemDiscount,cur)}</span></div>`:''}
      <div class="row"><span>${uiTxt('shipping')}</span><span>${t.shippingKnown?money(t.shipping,cur):uiTxt('shipping_calc_checkout')}</span></div>
      <div class="shipping-eta">${escapeHTML(uiTxt('shipping_delivery_summary'))}</div>
      <div class="row total"><span>${uiTxt('total')}</span><span>${t.shippingKnown?money(t.totalFinal,cur):uiTxt('shipping_calc_checkout')}</span></div>
      <a href="checkout.html" class="btn-primary" style="width:100%;text-align:center;margin-top:1rem">${uiTxt('checkout')}</a>
    </div>
    <div class="cart-actions"><a href="shop.html" class="btn-ghost">${uiTxt('continue_shopping')}</a></div>
    ` : `
    <div class="cart-empty">
      <p>${uiTxt('cart_empty')}</p>
      <a href="shop.html" class="btn-primary">${uiTxt('continue_shopping')}</a>
    </div>`}`;
  renderCartDrawer();
}

// ---------- Checkout ----------
const EUROPE_COUNTRY_CODES = Object.freeze([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  'AD','AL','BA','BY','CH','GB','GI','GG','IM','IS','JE','LI','MC','MD','ME','MK','NO','RS','RU','SM','UA','VA','XK','AX','FO','SJ'
]);
const EU_COUNTRY_CODES = EUROPE_COUNTRY_CODES;
const EUROPE_SHIPPING_CENTS = 799;
const EU_SHIPPING_CENTS = 799;
const INTL_SHIPPING_CENTS = 2000;
const PICKUP_SHIPPING_CENTS = 0;

const PICKUP_LOCATION = Object.freeze({
  name: 'Midana Beauty',
  facility: 'Centro Comercial da Amadora',
  address: 'Rua Elias Garcia, n.º 229',
  apt: '1.º andar, Loja E',
  zip: '2700-319',
  city: 'Amadora',
  country: 'PT',
  fullAddress: 'Midana Beauty, Centro Comercial da Amadora; Rua Elias Garcia, n.º 229, 2700-319 Amadora, Portugal; 1.º andar, Loja E'
});
const CHECKOUT_COUNTRY_ENTRIES = [["AD","Andorra","Andorre"],["AE","United Arab Emirates","Emirados Árabes Unidos","Emiratos Árabes Unidos","Vereinigte Arabische Emirate","Émirats arabes unis","Emirati Arabi Uniti"],["AF","Afghanistan","Afeganistão","Afganistán"],["AG","Antigua & Barbuda","Antigua and Barbuda","Antígua e Barbuda","Antigua y Barbuda","Antigua und Barbuda","Antigua-et-Barbuda","Antigua e Barbuda"],["AI","Anguilla","Anguila"],["AL","Albania","Albânia","Albanien","Albanie"],["AM","Armenia","Armênia","Armenien","Arménie"],["AO","Angola"],["AQ","Antarctica","Antártida","Antarktis","Antarctique","Antartide"],["AR","Argentina","Argentinien","Argentine"],["AT","Austria","Áustria","Österreich","Autriche"],["AU","Australia","Austrália","Australien","Australie"],["AW","Aruba"],["AX","Åland Islands","Ilhas Aland","Islas Aland","Ålandinseln","Îles Åland","Isole Åland"],["AZ","Azerbaijan","Azerbaijão","Azerbaiyán","Aserbaidschan","Azerbaïdjan","Azerbaigian"],["BA","Bosnia & Herzegovina","Bosnia and Herzegovina","Bósnia e Herzegovina","Bosnia y Herzegovina","Bosnien und Herzegowina","Bosnie-Herzégovine","Bosnia ed Erzegovina"],["BB","Barbados","Barbade"],["BD","Bangladesh","Bangladés","Bangladesch"],["BE","Belgium","Bélgica","Belgien","Belgique","Belgio"],["BF","Burkina Faso","Burquina Faso"],["BG","Bulgaria","Bulgária","Bulgarien","Bulgarie"],["BH","Bahrain","Barein","Baréin","Bahreïn","Bahrein"],["BI","Burundi"],["BJ","Benin","Benín","Bénin"],["BL","St. Barthélemy","São Bartolomeu","San Bartolomé","Saint-Barthélemy"],["BM","Bermuda","Bermudas","Bermudes"],["BN","Brunei","Brunéi","Brunei Darussalam"],["BO","Bolivia","Bolívia","Bolivien","Bolivie"],["BQ","Caribbean Netherlands","Países Baixos Caribenhos","Caribe neerlandés","Karibische Niederlande","Pays-Bas caribéens","Caraibi Olandesi"],["BR","Brazil","Brasil","Brasilien","Brésil","Brasile"],["BS","Bahamas"],["BT","Bhutan","Butão","Bután","Bhoutan"],["BV","Bouvet Island","Ilha Bouvet","Isla Bouvet","Bouvetinsel","Île Bouvet","Isola Bouvet"],["BW","Botswana","Botsuana"],["BY","Belarus","Bielorrússia","Bielorrusia","Biélorussie","Bielorussia"],["BZ","Belize","Belice"],["CA","Canada","Canadá","Kanada"],["CD","Congo - Kinshasa","República Democrática del Congo","Kongo-Kinshasa","Congo-Kinshasa"],["CF","Central African Republic","República Centro-Africana","República Centroafricana","Zentralafrikanische Republik","République centrafricaine","Repubblica Centrafricana"],["CG","Congo - Brazzaville","República do Congo","Congo","Kongo-Brazzaville","Congo-Brazzaville"],["CH","Switzerland","Suíça","Suiza","Schweiz","Suisse","Svizzera"],["CI","Côte d’Ivoire","Costa do Marfim","Costa d’Avorio","Ivory Coast","Cote d Ivoire","Costa de Marfil","Elfenbeinküste"],["CK","Cook Islands","Ilhas Cook","Islas Cook","Cookinseln","Îles Cook","Isole Cook"],["CL","Chile","Chili","Cile"],["CM","Cameroon","Camarões","Camerún","Kamerun","Cameroun","Camerun"],["CN","China","Chine","Cina"],["CO","Colombia","Colômbia","Kolumbien","Colombie"],["CR","Costa Rica"],["CV","Cape Verde","Cabo Verde","Cap-Vert","Capo Verde","Kap Verde"],["CW","Curaçao","Curazao"],["CY","Cyprus","Chipre","Zypern","Chypre","Cipro"],["CZ","Czechia","Tchéquia","Chequia","Tschechien","Tchéquie","Cechia","Czech Republic","Chéquia","República Checa","Repubblica Ceca"],["DE","Germany","Alemanha","Alemania","Deutschland","Allemagne","Germania"],["DJ","Djibouti","Djibuti","Yibuti","Dschibuti","Gibuti"],["DK","Denmark","Dinamarca","Dänemark","Danemark","Danimarca"],["DM","Dominica","Dominique"],["DO","Dominican Republic","República Dominicana","Dominikanische Republik","République dominicaine","Repubblica Dominicana"],["DZ","Algeria","Argélia","Argelia","Algerien","Algérie"],["EC","Ecuador","Equador","Équateur"],["EE","Estonia","Estônia","Estland","Estonie"],["EG","Egypt","Egito","Egipto","Ägypten","Égypte","Egitto"],["EH","Western Sahara","Saara Ocidental","Sáhara Occidental","Westsahara","Sahara occidental","Sahara Occidentale"],["ER","Eritrea","Eritreia","Érythrée"],["ES","Spain","Espanha","España","Spanien","Espagne","Spagna"],["ET","Ethiopia","Etiópia","Etiopía","Äthiopien","Éthiopie","Etiopia"],["FI","Finland","Finlândia","Finlandia","Finnland","Finlande"],["FJ","Fiji","Fiyi","Fidschi","Fidji","Figi"],["FK","Falkland Islands","Ilhas Malvinas","Islas Malvinas","Falklandinseln","Îles Malouines","Isole Falkland"],["FO","Faroe Islands","Ilhas Faroé","Islas Feroe","Färöer","Îles Féroé","Isole Fær Øer"],["FR","France","França","Francia","Frankreich"],["GA","Gabon","Gabão","Gabón","Gabun"],["GB","United Kingdom","Reino Unido","Vereinigtes Königreich","Royaume-Uni","Regno Unito","UK","Great Britain","Britain","England","Scotland","Wales","Northern Ireland","Grande-Bretagne","Grossbritannien","Großbritannien"],["GD","Grenada","Granada","Grenade"],["GE","Georgia","Geórgia","Georgien","Géorgie"],["GF","French Guiana","Guiana Francesa","Guayana Francesa","Französisch-Guayana","Guyane française","Guyana Francese"],["GG","Guernsey","Guernesey"],["GH","Ghana","Gana"],["GI","Gibraltar","Gibilterra"],["GL","Greenland","Groenlândia","Groenlandia","Grönland","Groenland"],["GM","Gambia","Gâmbia","Gambie"],["GN","Guinea","Guiné","Guinée"],["GP","Guadeloupe","Guadalupe","Guadalupa"],["GQ","Equatorial Guinea","Guiné Equatorial","Guinea Ecuatorial","Äquatorialguinea","Guinée équatoriale","Guinea Equatoriale"],["GR","Greece","Grécia","Grecia","Griechenland","Grèce"],["GS","South Georgia & South Sandwich Islands","South Georgia and South Sandwich Islands","Ilhas Geórgia do Sul e Sandwich do Sul","Islas Georgia del Sur y Sandwich del Sur","Südgeorgien und die Südlichen Sandwichinseln","Géorgie du Sud-et-les Îles Sandwich du Sud","Georgia del Sud e Sandwich Australi"],["GT","Guatemala"],["GU","Guam"],["GW","Guinea-Bissau","Guiné-Bissau","Guinea-Bisáu","Guinée-Bissau"],["GY","Guyana","Guiana"],["HK","Hong Kong SAR China","Hong Kong, RAE da China","RAE de Hong Kong (China)","Sonderverwaltungsregion Hongkong","R.A.S. chinoise de Hong Kong","RAS di Hong Kong"],["HN","Honduras"],["HR","Croatia","Croácia","Croacia","Kroatien","Croatie","Croazia"],["HT","Haiti","Haití","Haïti"],["HU","Hungary","Hungria","Hungría","Ungarn","Hongrie","Ungheria"],["ID","Indonesia","Indonésia","Indonesien","Indonésie"],["IE","Ireland","Irlanda","Irland","Irlande"],["IL","Israel","Israël","Israele"],["IM","Isle of Man","Ilha de Man","Isla de Man","Île de Man","Isola di Man"],["IN","India","Índia","Indien","Inde"],["IQ","Iraq","Iraque","Irak"],["IS","Iceland","Islândia","Islandia","Island","Islande","Islanda"],["IT","Italy","Itália","Italia","Italien","Italie"],["JE","Jersey"],["JM","Jamaica","Jamaika","Jamaïque","Giamaica"],["JO","Jordan","Jordânia","Jordania","Jordanien","Jordanie","Giordania"],["JP","Japan","Japão","Japón","Japon","Giappone"],["KE","Kenya","Quênia","Kenia"],["KG","Kyrgyzstan","Quirguistão","Kirguistán","Kirgisistan","Kirghizstan","Kirghizistan"],["KH","Cambodia","Camboja","Camboya","Kambodscha","Cambodge","Cambogia"],["KI","Kiribati","Quiribati"],["KM","Comoros","Comores","Comoras","Komoren","Comore"],["KN","St. Kitts & Nevis","St. Kitts and Nevis","São Cristóvão e Névis","San Cristóbal y Nieves","St. Kitts und Nevis","Saint-Christophe-et-Niévès","Saint Kitts e Nevis"],["KR","South Korea","Coreia do Sul","Corea del Sur","Südkorea","Corée du Sud","Corea del Sud"],["KW","Kuwait","Koweït"],["KY","Cayman Islands","Ilhas Cayman","Islas Caimán","Kaimaninseln","Îles Caïmans","Isole Cayman"],["KZ","Kazakhstan","Cazaquistão","Kazajistán","Kasachstan","Kazakistan"],["LA","Laos"],["LB","Lebanon","Líbano","Libanon","Liban","Libano"],["LC","St. Lucia","Santa Lúcia","Santa Lucía","Sainte-Lucie","Saint Lucia"],["LI","Liechtenstein"],["LK","Sri Lanka"],["LR","Liberia","Libéria"],["LS","Lesotho","Lesoto"],["LT","Lithuania","Lituânia","Lituania","Litauen","Lituanie"],["LU","Luxembourg","Luxemburgo","Luxemburg","Lussemburgo"],["LV","Latvia","Letônia","Letonia","Lettland","Lettonie","Lettonia"],["LY","Libya","Líbia","Libia","Libyen","Libye"],["MA","Morocco","Marrocos","Marruecos","Marokko","Maroc","Marocco"],["MC","Monaco","Mônaco","Mónaco"],["MD","Moldova","Moldávia","Moldavia","Republik Moldau","Moldavie"],["ME","Montenegro","Monténégro"],["MF","St. Martin","São Martinho","San Martín","Saint-Martin","Saint Martin"],["MG","Madagascar","Madagaskar"],["MK","North Macedonia","Macedônia do Norte","Macedonia del Norte","Nordmazedonien","Macédoine du Nord","Macedonia del Nord"],["ML","Mali"],["MM","Myanmar (Burma)","Mianmar (Birmânia)","Myanmar (Birmania)","Myanmar","Myanmar (Birmanie)"],["MN","Mongolia","Mongólia","Mongolei","Mongolie"],["MO","Macao SAR China","Macau, RAE da China","RAE de Macao (China)","Sonderverwaltungsregion Macau","R.A.S. chinoise de Macao","RAS di Macao"],["MQ","Martinique","Martinica"],["MR","Mauritania","Mauritânia","Mauretanien","Mauritanie"],["MS","Montserrat"],["MT","Malta","Malte"],["MU","Mauritius","Maurício","Mauricio","Maurice"],["MV","Maldives","Maldivas","Malediven","Maldive"],["MW","Malawi","Malaui"],["MX","Mexico","México","Mexiko","Mexique","Messico"],["MY","Malaysia","Malásia","Malasia","Malaisie"],["MZ","Mozambique","Moçambique","Mosambik","Mozambico"],["NA","Namibia","Namíbia","Namibie"],["NC","New Caledonia","Nova Caledônia","Nueva Caledonia","Neukaledonien","Nouvelle-Calédonie","Nuova Caledonia"],["NE","Niger","Níger"],["NG","Nigeria","Nigéria"],["NI","Nicaragua","Nicarágua"],["NL","Netherlands","Países Baixos","Países Bajos","Niederlande","Pays-Bas","Paesi Bassi","The Netherlands","Holland","Holanda"],["NO","Norway","Noruega","Norwegen","Norvège","Norvegia"],["NP","Nepal","Népal"],["NR","Nauru"],["NU","Niue"],["NZ","New Zealand","Nova Zelândia","Nueva Zelanda","Neuseeland","Nouvelle-Zélande","Nuova Zelanda"],["OM","Oman","Omã","Omán"],["PA","Panama","Panamá"],["PE","Peru","Perú","Pérou","Perù"],["PF","French Polynesia","Polinésia Francesa","Polinesia Francesa","Französisch-Polynesien","Polynésie française","Polinesia Francese"],["PG","Papua New Guinea","Papua-Nova Guiné","Papúa Nueva Guinea","Papua-Neuguinea","Papouasie-Nouvelle-Guinée","Papua Nuova Guinea"],["PH","Philippines","Filipinas","Philippinen","Filippine"],["PK","Pakistan","Paquistão","Pakistán"],["PL","Poland","Polônia","Polonia","Polen","Pologne"],["PM","St. Pierre & Miquelon","St. Pierre and Miquelon","São Pedro e Miquelão","San Pedro y Miquelón","St. Pierre und Miquelon","Saint-Pierre-et-Miquelon","Saint-Pierre e Miquelon"],["PN","Pitcairn Islands","Ilhas Pitcairn","Islas Pitcairn","Pitcairninseln","Îles Pitcairn","Isole Pitcairn"],["PR","Puerto Rico","Porto Rico","Portorico"],["PS","Palestinian Territories","Territórios palestinos","Territorios Palestinos","Palästinensische Autonomiegebiete","Territoires palestiniens","Territori Palestinesi"],["PT","Portugal","Portogallo"],["PY","Paraguay","Paraguai"],["QA","Qatar","Catar","Katar"],["RE","Réunion","Reunião","Reunión","La Réunion","Riunione"],["RO","Romania","Romênia","Rumanía","Rumänien","Roumanie"],["RS","Serbia","Sérvia","Serbien","Serbie"],["RU","Russia","Rússia","Rusia","Russland","Russie"],["RW","Rwanda","Ruanda"],["SA","Saudi Arabia","Arábia Saudita","Arabia Saudí","Saudi-Arabien","Arabie saoudite","Arabia Saudita"],["SB","Solomon Islands","Ilhas Salomão","Islas Salomón","Salomonen","Îles Salomon","Isole Salomone"],["SC","Seychelles","Seicheles","Seychellen"],["SE","Sweden","Suécia","Suecia","Schweden","Suède","Svezia"],["SG","Singapore","Singapura","Singapur","Singapour"],["SH","St. Helena","Santa Helena","Santa Elena","Sainte-Hélène","Sant’Elena"],["SI","Slovenia","Eslovênia","Eslovenia","Slowenien","Slovénie"],["SJ","Svalbard & Jan Mayen","Svalbard and Jan Mayen","Svalbard e Jan Mayen","Svalbard y Jan Mayen","Spitzbergen und Jan Mayen","Svalbard et Jan Mayen"],["SK","Slovakia","Eslováquia","Eslovaquia","Slowakei","Slovaquie","Slovacchia"],["SL","Sierra Leone","Serra Leoa","Sierra Leona"],["SM","San Marino","Saint-Marin"],["SN","Senegal","Sénégal"],["SO","Somalia","Somália","Somalie"],["SR","Suriname","Surinam"],["SS","South Sudan","Sudão do Sul","Sudán del Sur","Südsudan","Soudan du Sud","Sud Sudan"],["ST","São Tomé & Príncipe","São Tomé and Príncipe","São Tomé e Príncipe","Santo Tomé y Príncipe","São Tomé und Príncipe","Sao Tomé-et-Principe","Sao Tome and Principe"],["SV","El Salvador","Salvador"],["SX","Sint Maarten","Saint-Martin (partie néerlandaise)"],["SZ","Eswatini","Essuatíni","Esuatini"],["TA","Tristan da Cunha","Tristão da Cunha","Tristán de Acuña"],["TC","Turks & Caicos Islands","Turks and Caicos Islands","Ilhas Turcas e Caicos","Islas Turcas y Caicos","Turks- und Caicosinseln","Îles Turques-et-Caïques","Isole Turks e Caicos"],["TD","Chad","Chade","Tschad","Tchad","Ciad"],["TF","French Southern Territories","Territórios Franceses do Sul","Territorios Australes Franceses","Französische Süd- und Antarktisgebiete","Terres australes françaises","Terre Australi Francesi"],["TG","Togo"],["TH","Thailand","Tailândia","Tailandia","Thaïlande","Thailandia"],["TJ","Tajikistan","Tadjiquistão","Tayikistán","Tadschikistan","Tadjikistan","Tagikistan"],["TK","Tokelau"],["TL","Timor-Leste","Timor oriental","Timor Est"],["TM","Turkmenistan","Turcomenistão","Turkmenistán","Turkménistan"],["TN","Tunisia","Tunísia","Túnez","Tunesien","Tunisie"],["TO","Tonga"],["TR","Türkiye","Turquia","Turquía","Türkei","Turquie","Turchia"],["TT","Trinidad & Tobago","Trinidad and Tobago","Trinidad e Tobago","Trinidad y Tobago","Trinidad und Tobago","Trinité-et-Tobago"],["TV","Tuvalu"],["TW","Taiwan","Taiwán","Taïwan"],["TZ","Tanzania","Tanzânia","Tansania","Tanzanie"],["UA","Ukraine","Ucrânia","Ucrania","Ucraina"],["UG","Uganda","Ouganda"],["US","United States","Estados Unidos","Vereinigte Staaten","États-Unis","Stati Uniti","USA","United States of America","U.S.","U.S.A."],["UY","Uruguay","Uruguai"],["UZ","Uzbekistan","Uzbequistão","Uzbekistán","Usbekistan","Ouzbékistan"],["VA","Vatican City","Cidade do Vaticano","Ciudad del Vaticano","Vatikanstadt","État de la Cité du Vatican","Città del Vaticano"],["VC","St. Vincent & Grenadines","St. Vincent and Grenadines","São Vicente e Granadinas","San Vicente y las Granadinas","St. Vincent und die Grenadinen","Saint-Vincent-et-les Grenadines","Saint Vincent e Grenadine"],["VE","Venezuela"],["VG","British Virgin Islands","Ilhas Virgens Britânicas","Islas Vírgenes Británicas","Britische Jungferninseln","Îles Vierges britanniques","Isole Vergini Britanniche"],["VN","Vietnam","Vietnã","Viêt Nam"],["VU","Vanuatu"],["WF","Wallis & Futuna","Wallis and Futuna","Wallis e Futuna","Wallis y Futuna","Wallis und Futuna","Wallis-et-Futuna"],["WS","Samoa"],["XK","Kosovo"],["YE","Yemen","Iêmen","Jemen","Yémen"],["YT","Mayotte"],["ZA","South Africa","África do Sul","Sudáfrica","Südafrika","Afrique du Sud","Sudafrica"],["ZM","Zambia","Zâmbia","Sambia","Zambie"],["ZW","Zimbabwe","Zimbábue","Zimbabue","Simbabwe"]];
function normalizeCountryKey(value){
  return String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
const CHECKOUT_COUNTRY_LOOKUP = Object.fromEntries(
  CHECKOUT_COUNTRY_ENTRIES.flatMap(([code, ...names]) => [
    [normalizeCountryKey(code), code],
    ...names.map(name => [normalizeCountryKey(name), code]),
  ])
);
function resolveCountryCode(value){
  return CHECKOUT_COUNTRY_LOOKUP[normalizeCountryKey(value)] || '';
}
function shippingRateForCountry(value, fulfillmentMethod = 'delivery'){
  const code = resolveCountryCode(value);
  if (!code) return null;
  const isEurope = EUROPE_COUNTRY_CODES.includes(code);
  const isPT = code === 'PT';
  const method = (isPT && fulfillmentMethod === 'pickup') ? 'pickup' : 'delivery';
  return {
    countryCode: code,
    region: isEurope ? 'EU' : 'INTL',
    fulfillmentMethod: method,
    shippingCents: method === 'pickup' ? PICKUP_SHIPPING_CENTS : (isEurope ? EUROPE_SHIPPING_CENTS : INTL_SHIPPING_CENTS),
  };
}
function countryDisplayName(code, lang){
  const cleanCode = resolveCountryCode(code);
  if (!cleanCode) return '';
  const activeLang = lang || (typeof LANG === 'string' && LANG ? LANG : 'pt');
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'){
      const dn = new Intl.DisplayNames([activeLang === 'pt' ? 'pt-PT' : activeLang, 'en'], { type:'region' });
      const label = dn.of(cleanCode);
      if (label) return label;
    }
  } catch(e){}
  const entry = CHECKOUT_COUNTRY_ENTRIES.find(x => x[0] === cleanCode);
  return entry ? entry[1] : cleanCode;
}
function getCountryCatalog(lang){
  const activeLang = lang || (typeof LANG === 'string' && LANG ? LANG : 'pt');
  return CHECKOUT_COUNTRY_ENTRIES.map(([code, ...aliases]) => {
    const label = countryDisplayName(code, activeLang);
    const searchText = [code, label, ...aliases].map(normalizeCountryKey).join(' ');
    return { code, label, searchText };
  }).sort((a, b) => a.label.localeCompare(b.label, activeLang));
}

const CHECKOUT_DRAFT_KEY = 'ash_checkout_draft';
function loadCheckoutDraft(){
  try {
    const raw = sessionStorage.getItem(CHECKOUT_DRAFT_KEY) || localStorage.getItem(CHECKOUT_DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch(e){ return {}; }
}
function saveCheckoutDraft(patch){
  try {
    const next = Object.assign({}, loadCheckoutDraft(), patch || {});
    const raw = JSON.stringify(next);
    try { sessionStorage.setItem(CHECKOUT_DRAFT_KEY, raw); } catch(e){}
    try { localStorage.setItem(CHECKOUT_DRAFT_KEY, raw); } catch(e){}
  } catch(e){}
}
function clearCheckoutDraft(){
  try { sessionStorage.removeItem(CHECKOUT_DRAFT_KEY); } catch(e){}
  try { localStorage.removeItem(CHECKOUT_DRAFT_KEY); } catch(e){}
}

function renderCheckoutPage(){
  const root = document.getElementById('checkoutRoot'); if (!root) return;
  const paymentReturn = new URLSearchParams(window.location.search).get('payment');
  if (paymentReturn === 'success') {
    root.innerHTML = `<div class="order-confirm"><h2>Payment submitted</h2><p>We are verifying your payment with Stripe. This page is not a payment receipt. Please do not submit the order again while confirmation is pending.</p><p>If the order is not confirmed after a few minutes, contact Asheerah Hair before retrying payment.</p><a href="pages/contact.html" class="btn-primary">Contact Asheerah Hair</a></div>`;
    return;
  }
  const cur = curCode();
  const cart = getCart();

  if (!cart.length){
    root.innerHTML = `<div class="checkout-empty">
      <h2>${uiTxt('checkout')}</h2>
      <p>${uiTxt('empty_cart_checkout')}</p>
      <a href="shop.html" class="btn-primary">${uiTxt('continue_shopping')}</a>
    </div>`;
    return;
  }

  const draft = loadCheckoutDraft();
  let activePay = draft.pay;
  if (!activePay || ['paypal', 'mbway'].includes(activePay) || !['stripe', 'orange_money'].includes(activePay) || (activePay === 'orange_money' && resolveCountryCode(draft.country) !== 'GW')) {
    activePay = 'stripe';
    if (draft.pay && draft.pay !== 'stripe') {
      saveCheckoutDraft({ pay: 'stripe' });
    }
  }
  const savedCountryCode = resolveCountryCode(draft.country || '');
  const isInitialPT = savedCountryCode === 'PT';
  const initialMethod = (isInitialPT && draft.fulfillmentMethod === 'pickup') ? 'pickup' : 'delivery';
  const initialQuote = savedCountryCode ? shippingRateForCountry(savedCountryCode, initialMethod) : null;
  const t = cartTotals(getAppliedCoupon(), initialQuote ? initialQuote.shippingCents / 100 : null);
  const selectCountryPrompt = uiTxt('shipping_select_country') || 'Select your country to calculate shipping.';

  const itemsHTML = cart.map(i => {
    const subtotal = money(i.priceEur * i.qty, cur);
    return `<div class="co-item">
      <img src="${i.image}" alt="${escapeHTML(i.title)}">
      <div class="co-item-info">
        <div class="co-item-title">${escapeHTML(i.title)}</div>
        <div class="co-item-meta">${itemMetaHTML(i)}</div>
        <div class="co-item-qty">${uiTxt('quantity')}: ${i.qty}</div>
      </div>
      <div class="co-item-price">${priceHTML(i.priceEur, i.compareEur, cur)}<div class="co-item-sub">${subtotal}</div></div>
    </div>`;
  }).join('');

  root.innerHTML = `
  <form id="checkoutForm" class="checkout" novalidate>
    <div class="co-col co-form">
      <fieldset>
        <legend>${uiTxt('contact_info')}</legend>
        <div class="fld">
          <label for="coEmail">${uiTxt('email_tracking')} *</label>
          <input id="coEmail" name="email" type="email" autocomplete="email" required>
          <p class="ferr" data-for="email"></p>
        </div>
        <div class="fld">
          <label for="coPhone">${uiTxt('phone_required')} *</label>
          <input id="coPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+351 …" required>
          <p class="ferr" data-for="phone"></p>
        </div>
      </fieldset>

      <fieldset>
        <legend>${uiTxt('delivery_address')}</legend>
        <div class="fld-row">
          <div class="fld"><label for="coFirst">${uiTxt('first_name')} *</label><input id="coFirst" name="first" autocomplete="given-name" required><p class="ferr" data-for="first"></p></div>
          <div class="fld"><label for="coLast">${uiTxt('last_name')} *</label><input id="coLast" name="last" autocomplete="family-name" required><p class="ferr" data-for="last"></p></div>
        </div>
        <div class="fld fld-country">
          <label id="coCountryLabel" for="coCountrySearch">${uiTxt('country_region')} *</label>
          <div class="country-combobox" id="coCountryCombobox">
            <input id="coCountrySearch" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="coCountryList" aria-labelledby="coCountryLabel" autocomplete="off" placeholder="${escapeHTML(uiTxt('country_search_ph') || 'Search or select country…')}" required>
            <button type="button" class="country-combobox-toggle" id="coCountryToggle" tabindex="-1" aria-label="${escapeHTML(uiTxt('country_region'))}">⌄</button>
            <input id="coCountry" name="country" type="hidden" value="${escapeHTML(savedCountryCode)}">
            <ul id="coCountryList" class="country-combobox-list" role="listbox" aria-labelledby="coCountryLabel" hidden></ul>
          </div>
          <p class="ferr" data-for="country"></p>
        </div>

        <fieldset id="coFulfillmentGroup" class="co-fulfillment-group" role="radiogroup" aria-labelledby="coFulfillmentLegend"${isInitialPT ? '' : ' hidden'}>
          <legend id="coFulfillmentLegend">${escapeHTML(uiTxt('fulfillment_method') || 'Método de envio')}</legend>
          <div class="fulfillment-options">
            <label class="fulfillment-opt${initialMethod === 'delivery' ? ' active' : ''}" for="coFulfillDelivery">
              <input type="radio" id="coFulfillDelivery" name="fulfillmentMethod" value="delivery"${initialMethod === 'delivery' ? ' checked' : ''}>
              <span class="f-radio"></span>
              <span class="f-label">${escapeHTML(uiTxt('delivery_home_pt') || 'Entrega em casa — 7,99 €')}</span>
            </label>
            <label class="fulfillment-opt${initialMethod === 'pickup' ? ' active' : ''}" for="coFulfillPickup">
              <input type="radio" id="coFulfillPickup" name="fulfillmentMethod" value="pickup"${initialMethod === 'pickup' ? ' checked' : ''}>
              <span class="f-radio"></span>
              <span class="f-label">${escapeHTML(uiTxt('delivery_pickup_pt') || 'Ponto de recolha — Grátis')}</span>
            </label>
          </div>
          <div id="coPickupLocationCard" class="pickup-location-card"${initialMethod === 'pickup' ? '' : ' hidden'}>
            <div class="pickup-badge">${escapeHTML(uiTxt('pickup_store_title') || 'Ponto de recolha fixo')}</div>
            <div class="pickup-name"><strong>Midana Beauty</strong> — Centro Comercial da Amadora</div>
            <div class="pickup-addr">Rua Elias Garcia, n.º 229, 2700-319 Amadora, Portugal</div>
            <div class="pickup-floor">1.º andar, Loja E</div>
            <div class="pickup-cost">${escapeHTML(uiTxt('pickup_free_badge') || 'Grátis')}</div>
          </div>
        </fieldset>

        <div id="coHomeAddressFields">
          <div class="fld"><label for="coAddr">${uiTxt('address_line')} *</label><input id="coAddr" name="address" autocomplete="street-address" required><p class="ferr" data-for="address"></p></div>
          <div class="fld"><label for="coApt">${uiTxt('apartment')}</label><input id="coApt" name="apt" autocomplete="address-line2"></div>
          <div class="fld-row">
            <div class="fld"><label for="coZip">${uiTxt('postal_code')} *</label><input id="coZip" name="zip" autocomplete="postal-code" required><p class="ferr" data-for="zip"></p></div>
            <div class="fld"><label for="coCity">${uiTxt('city')} *</label><input id="coCity" name="city" autocomplete="address-level2" required><p class="ferr" data-for="city"></p></div>
          </div>
          <div class="fld"><label for="coDistrict">${uiTxt('district')}</label><input id="coDistrict" name="district" autocomplete="address-level1"></div>
          <div class="fld"><label for="coNotes">${uiTxt('delivery_notes')}</label><textarea id="coNotes" name="notes" rows="2"></textarea></div>
        </div>
      </fieldset>

      <fieldset>
        <legend>${uiTxt('payment_method')}</legend>
        <p class="payment-intro">${uiTxt('payment_choose')}</p>
        <div class="methods" id="payMethods">
          ${paymentMethodsForCountry(savedCountryCode).map((m,idx)=> paymentMethodHTML(m,idx,activePay)).join('')}
        </div>
        <div id="payArea" class="pay-area" aria-live="polite"></div>
      </fieldset>

      <div class="coupon-box">
        <label for="coCoupon">${uiTxt('coupon_label')}</label>
        <div class="coupon-row">
          <input id="coCoupon" name="coupon" autocomplete="off" placeholder="EXEMPLO01">
          <button type="button" id="couponApply" class="btn-secondary">${uiTxt('apply')}</button>
        </div>
        <p id="couponMsg" class="coupon-msg"></p>
        <p class="coupon-hint">${uiTxt('apply_coupon_hint')}</p>
      </div>

      <p class="sec-note">${uiTxt('secure_checkout_note')}</p>
      <button type="submit" id="placeOrderBtn" class="btn-primary co-submit">${activePay === 'orange_money' ? uiTxt('submit_om_request') : uiTxt('pay_with_stripe')}</button>
      <p id="orderNote" class="order-note" role="status"></p>
    </div>

    <div class="co-col co-summary">
      <div class="summary">
        <h2>${uiTxt('items_summary')}</h2>
        ${itemsHTML}
        <div class="totals">
          <div class="row"><span>${uiTxt('subtotal_original')}</span><span id="coSubtotalOriginal">${money(t.subtotalOriginal,cur)}</span></div>
          ${t.totalDiscount>0?`<div class="row disc"><span>${uiTxt('discount_total')}</span><span id="coDiscountTotal">−${money(t.totalDiscount,cur)}</span></div>`:''}
          <div class="row"><span>${uiTxt('merchandise_subtotal') || uiTxt('subtotal')}</span><span id="coMerchandiseSubtotal">${money(t.subtotalFinal,cur)}</span></div>
          <div class="row"><span>${uiTxt('shipping')}</span><span id="coShippingAmount">${t.shippingKnown?(t.shipping===0?(uiTxt('free')||'Grátis'):money(t.shipping,cur)):selectCountryPrompt}</span></div>
      <div class="shipping-eta">${uiTxt('shipping_eta')}: ${escapeHTML(savedCountryCode ? (EUROPE_COUNTRY_CODES.includes(savedCountryCode) ? (CONFIG.shippingEta || '6–10 days') : uiTxt('shipping_eta_international')) : uiTxt('shipping_delivery_summary'))}</div>
          ${t.taxes>0?`<div class="row"><span>${uiTxt('taxes')}</span><span>${money(t.taxes,cur)}</span></div>`:''}
          <div class="row total"><span>${uiTxt('final_total')}</span><span id="coGrandTotal">${t.shippingKnown?money(t.totalFinal,cur):selectCountryPrompt}</span></div>
        </div>
      </div>
    </div>
  </form>`;

  // ---- Restore persisted customer details ----
  const form = document.getElementById('checkoutForm');
  const baseTextFields = ['email','phone','first','last','notes'];
  const homeFields = ['address','apt','zip','city','district'];

  const initialHomeDraft = Object.assign({
    address: draft.address || '',
    apt: draft.apt || '',
    zip: draft.zip || '',
    city: draft.city || '',
    district: draft.district || '',
  }, draft.homeDraft || {});

  baseTextFields.forEach(name => {
    const field = form.querySelector(`[name="${name}"]`);
    if (field && typeof draft[name] === 'string') field.value = draft[name];
    if (field) {
      field.addEventListener('input', () => saveCheckoutDraft({ [name]: field.value }));
      field.addEventListener('change', () => saveCheckoutDraft({ [name]: field.value }));
    }
  });

  // ---- Searchable Country Combobox + Destination-based shipping quote ----
  const countryInput = document.getElementById('coCountry');
  const countrySearch = document.getElementById('coCountrySearch');
  const countryToggle = document.getElementById('coCountryToggle');
  const countryList = document.getElementById('coCountryList');
  const countryBox = document.getElementById('coCountryCombobox');
  const shippingAmount = document.getElementById('coShippingAmount');
  const grandTotal = document.getElementById('coGrandTotal');
  const countryCatalog = getCountryCatalog();
  let filteredCountries = countryCatalog.slice();
  let activeOptionIndex = -1;
  let quoteSequence = 0;
  let currentQuoteIdentity = null;

  const fulfillmentGroup = document.getElementById('coFulfillmentGroup');
  const pickupCard = document.getElementById('coPickupLocationCard');
  const addrField = document.getElementById('coAddr');
  const aptField = document.getElementById('coApt');
  const zipField = document.getElementById('coZip');
  const cityField = document.getElementById('coCity');
  const districtField = document.getElementById('coDistrict');

  function getFulfillmentMethod(){
    const country = resolveCountryCode(countryInput ? countryInput.value : '');
    if (country !== 'PT') return 'delivery';
    const checked = form.querySelector('input[name="fulfillmentMethod"]:checked');
    return (checked && checked.value === 'pickup') ? 'pickup' : 'delivery';
  }

  homeFields.forEach(name => {
    const field = form.querySelector(`[name="${name}"]`);
    if (field) {
      field.addEventListener('input', () => {
        if (getFulfillmentMethod() === 'delivery') {
          initialHomeDraft[name] = field.value;
          saveCheckoutDraft({ [name]: field.value, homeDraft: initialHomeDraft });
        }
      });
      field.addEventListener('change', () => {
        if (getFulfillmentMethod() === 'delivery') {
          initialHomeDraft[name] = field.value;
          saveCheckoutDraft({ [name]: field.value, homeDraft: initialHomeDraft });
        }
      });
    }
  });

  function updateFulfillmentUI(method, isPT){
    const eta = form.querySelector('.shipping-eta');
    if (eta) eta.hidden = isPT && method === 'pickup';
    if (!isPT) {
      if (fulfillmentGroup) fulfillmentGroup.hidden = true;
      if (pickupCard) pickupCard.hidden = true;
      if (addrField && addrField.disabled) {
        addrField.disabled = false; addrField.required = true; addrField.value = initialHomeDraft.address || '';
        if (aptField) { aptField.disabled = false; aptField.value = initialHomeDraft.apt || ''; }
        if (zipField) { zipField.disabled = false; zipField.required = true; zipField.value = initialHomeDraft.zip || ''; }
        if (cityField) { cityField.disabled = false; cityField.required = true; cityField.value = initialHomeDraft.city || ''; }
        if (districtField) { districtField.disabled = false; districtField.value = initialHomeDraft.district || ''; }
      }
      saveCheckoutDraft({ fulfillmentMethod: 'delivery' });
      return;
    }

    if (fulfillmentGroup) fulfillmentGroup.hidden = false;
    const deliveryRadio = document.getElementById('coFulfillDelivery');
    const pickupRadio = document.getElementById('coFulfillPickup');
    if (deliveryRadio) deliveryRadio.checked = (method === 'delivery');
    if (pickupRadio) pickupRadio.checked = (method === 'pickup');
    if (deliveryRadio) deliveryRadio.closest('.fulfillment-opt')?.classList.toggle('active', method === 'delivery');
    if (pickupRadio) pickupRadio.closest('.fulfillment-opt')?.classList.toggle('active', method === 'pickup');

    if (method === 'pickup') {
      if (pickupCard) pickupCard.hidden = false;
      if (addrField && !addrField.disabled) {
        initialHomeDraft.address = addrField.value;
        if (aptField) initialHomeDraft.apt = aptField.value;
        if (zipField) initialHomeDraft.zip = zipField.value;
        if (cityField) initialHomeDraft.city = cityField.value;
        if (districtField) initialHomeDraft.district = districtField.value;
      }
      if (addrField) { addrField.value = PICKUP_LOCATION.address; addrField.disabled = true; addrField.required = false; }
      if (aptField) { aptField.value = PICKUP_LOCATION.apt; aptField.disabled = true; }
      if (zipField) { zipField.value = PICKUP_LOCATION.zip; zipField.disabled = true; zipField.required = false; }
      if (cityField) { cityField.value = PICKUP_LOCATION.city; cityField.disabled = true; cityField.required = false; }
      if (districtField) { districtField.value = ''; districtField.disabled = true; }
      ['address','zip','city'].forEach(k => {
        const input = form.querySelector(`[name="${k}"]`);
        const errEl = form.querySelector(`.ferr[data-for="${k}"]`);
        if (input) { input.classList.remove('invalid'); input.setAttribute('aria-invalid', 'false'); }
        if (errEl) { errEl.textContent = ''; errEl.removeAttribute('role'); }
      });
      saveCheckoutDraft({ fulfillmentMethod: 'pickup', homeDraft: initialHomeDraft });
    } else {
      if (pickupCard) pickupCard.hidden = true;
      if (addrField) { addrField.disabled = false; addrField.required = true; addrField.value = initialHomeDraft.address || ''; }
      if (aptField) { aptField.disabled = false; aptField.value = initialHomeDraft.apt || ''; }
      if (zipField) { zipField.disabled = false; zipField.required = true; zipField.value = initialHomeDraft.zip || ''; }
      if (cityField) { cityField.disabled = false; cityField.required = true; cityField.value = initialHomeDraft.city || ''; }
      if (districtField) { districtField.disabled = false; districtField.value = initialHomeDraft.district || ''; }
      saveCheckoutDraft({ fulfillmentMethod: 'delivery', homeDraft: initialHomeDraft });
    }
  }

  // Restore home values before pickup captures them on reload or coupon rerender.
  homeFields.forEach(name => {
    const field = form.querySelector(`[name="${name}"]`);
    if (field && typeof initialHomeDraft[name] === 'string') field.value = initialHomeDraft[name];
  });
  updateFulfillmentUI(initialMethod, isInitialPT);

  if (fulfillmentGroup) {
    fulfillmentGroup.querySelectorAll('input[name="fulfillmentMethod"]').forEach(r => {
      r.addEventListener('change', () => {
        const isPT = resolveCountryCode(countryInput.value) === 'PT';
        updateFulfillmentUI(r.value, isPT);
        refreshShippingQuote();
      });
    });
  }

  if (savedCountryCode) {
    countryInput.value = savedCountryCode;
    countrySearch.value = countryDisplayName(savedCountryCode);
  }

  function clearCountryError(){
    const errEl = form.querySelector('.ferr[data-for="country"]');
    countryInput.classList.remove('invalid');
    countryInput.setAttribute('aria-invalid', 'false');
    countrySearch.classList.remove('invalid');
    countrySearch.setAttribute('aria-invalid', 'false');
    if (errEl) { errEl.textContent = ''; errEl.removeAttribute('role'); }
  }

  function applyTotalsDisplay(shippingCents, method = getFulfillmentMethod()){
    const pending = uiTxt('shipping_select_country') || uiTxt('shipping_calc_checkout') || 'Select your country to calculate shipping.';
    if (!Number.isInteger(shippingCents) || shippingCents < 0) {
      shippingAmount.textContent = pending;
      grandTotal.textContent = pending;
      return;
    }
    const totals = cartTotals(getAppliedCoupon(), shippingCents / 100);
    if (method === 'pickup' || shippingCents === 0) {
      shippingAmount.textContent = uiTxt('free') || 'Grátis';
    } else {
      shippingAmount.textContent = money(totals.shipping, cur);
    }
    grandTotal.textContent = money(totals.totalFinal, cur);
  }

  async function refreshShippingQuote(){
    const rawValue = countryInput.value.trim();
    const code = resolveCountryCode(rawValue);
    syncPaymentMethods(code);
    const eta = form.querySelector('.shipping-eta');
    if (eta) eta.textContent = code ? uiTxt('shipping_eta') + ': ' + (EUROPE_COUNTRY_CODES.includes(code) ? (CONFIG.shippingEta || '6–10 days') : uiTxt('shipping_eta_international')) : uiTxt('shipping_delivery_summary');
    const method = (code === 'PT') ? getFulfillmentMethod() : 'delivery';
    const sequence = ++quoteSequence;
    const currentRequestId = `${code}:${method}:${sequence}`;
    currentQuoteIdentity = currentRequestId;

    const pending = uiTxt('shipping_select_country') || uiTxt('shipping_calc_checkout') || 'Select your country to calculate shipping.';
    if (!code) {
      applyTotalsDisplay(null, method);
      return;
    }
    if (countryInput.value !== code) countryInput.value = code;
    const localRate = shippingRateForCountry(code, method);
    if (localRate) {
      applyTotalsDisplay(localRate.shippingCents, method);
    }
    const endpoint = stripeWorkerURL('shipping-quote');
    if (!endpoint) return;
    try {
      const response = await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({country:code, fulfillmentMethod:method})
      });
      const quote = await response.json();
      if (currentQuoteIdentity !== currentRequestId) return;
      if (!response.ok || quote.currency !== 'EUR' || !Number.isInteger(quote.shippingCents) || quote.shippingCents < 0) {
        if (!localRate) { shippingAmount.textContent = uiTxt('shipping_unavailable'); grandTotal.textContent = '—'; }
        return;
      }
      const respMethod = quote.fulfillmentMethod || method;
      applyTotalsDisplay(quote.shippingCents, respMethod);
    } catch {
      if (currentQuoteIdentity === currentRequestId && !localRate) {
        shippingAmount.textContent = pending;
        grandTotal.textContent = pending;
      }
    }
  }

  function renderCountryOptions(query, keepOpen){
    const normQ = normalizeCountryKey(query);
    filteredCountries = normQ
      ? countryCatalog.filter(c => c.searchText.includes(normQ) || normalizeCountryKey(c.code) === normQ)
      : countryCatalog.slice();
    // Sort exact code/prefix matches first when searching
    if (normQ) {
      filteredCountries.sort((a, b) => {
        const aExact = normalizeCountryKey(a.code) === normQ || normalizeCountryKey(a.label).startsWith(normQ) ? 0 : 1;
        const bExact = normalizeCountryKey(b.code) === normQ || normalizeCountryKey(b.label).startsWith(normQ) ? 0 : 1;
        return aExact - bExact || a.label.localeCompare(b.label);
      });
    }
    if (!filteredCountries.length) {
      activeOptionIndex = -1;
      countryList.innerHTML = `<li class="country-combobox-empty" role="presentation">${escapeHTML(uiTxt('country_no_results') || 'No matching country found')}</li>`;
    } else {
      const currentCode = countryInput.value;
      const selectedIdx = filteredCountries.findIndex(c => c.code === currentCode);
      activeOptionIndex = normQ ? 0 : (selectedIdx >= 0 ? selectedIdx : 0);
      countryList.innerHTML = filteredCountries.map((c, idx) => {
        const isSelected = c.code === currentCode;
        const isActive = idx === activeOptionIndex;
        return `<li id="coCountryOpt-${c.code}" class="country-combobox-opt${isSelected?' selected':''}${isActive?' active':''}" role="option" aria-selected="${isSelected?'true':'false'}" data-country-code="${c.code}" data-country-label="${escapeHTML(c.label)}"><span class="country-opt-name">${escapeHTML(c.label)}</span><span class="country-opt-code">${c.code}</span></li>`;
      }).join('');
      if (activeOptionIndex >= 0 && filteredCountries[activeOptionIndex]) {
        countrySearch.setAttribute('aria-activedescendant', `coCountryOpt-${filteredCountries[activeOptionIndex].code}`);
      }
    }
    if (keepOpen) openCountryDropdown();
  }

  function openCountryDropdown(){
    countryList.hidden = false;
    countrySearch.setAttribute('aria-expanded', 'true');
    countryBox.classList.add('open');
  }

  function closeCountryDropdown(){
    countryList.hidden = true;
    countrySearch.setAttribute('aria-expanded', 'false');
    countrySearch.removeAttribute('aria-activedescendant');
    countryBox.classList.remove('open');
  }

  function selectCountryByCode(code, closeMenu = true){
    const cleanCode = resolveCountryCode(code);
    if (!cleanCode) {
      countryInput.value = '';
      saveCheckoutDraft({ country: '' });
      updateFulfillmentUI('delivery', false);
      refreshShippingQuote();
      if (closeMenu) closeCountryDropdown();
      return;
    }
    const label = countryDisplayName(cleanCode);
    countryInput.value = cleanCode;
    countrySearch.value = label;
    clearCountryError();
    saveCheckoutDraft({ country: cleanCode });
    const isPT = cleanCode === 'PT';
    const currentMethod = isPT ? (loadCheckoutDraft().fulfillmentMethod || 'delivery') : 'delivery';
    updateFulfillmentUI(currentMethod, isPT);
    if (closeMenu) closeCountryDropdown();
    refreshShippingQuote();
  }

  function updateActiveOption(nextIdx){
    if (!filteredCountries.length) return;
    activeOptionIndex = (nextIdx + filteredCountries.length) % filteredCountries.length;
    const opts = countryList.querySelectorAll('.country-combobox-opt');
    opts.forEach((el, i) => {
      const active = i === activeOptionIndex;
      el.classList.toggle('active', active);
      if (active) {
        countrySearch.setAttribute('aria-activedescendant', el.id);
        if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  countrySearch.addEventListener('focus', () => {
    renderCountryOptions('', true);
  });
  countrySearch.addEventListener('click', () => {
    if (countryList.hidden) renderCountryOptions('', true);
  });
  countryToggle.addEventListener('click', (e) => {
    e.preventDefault();
    if (countryList.hidden) {
      renderCountryOptions('', true);
      countrySearch.focus();
    } else {
      closeCountryDropdown();
    }
  });
  countrySearch.addEventListener('input', () => {
    const typed = countrySearch.value;
    if (!typed.trim()) {
      countryInput.value = '';
      saveCheckoutDraft({ country: '' });
      updateFulfillmentUI('delivery', false);
      refreshShippingQuote();
      renderCountryOptions('', true);
      return;
    }
    // Check if typed text is an exact match for a country name or ISO code
    const exactCode = resolveCountryCode(typed);
    if (exactCode) {
      countryInput.value = exactCode;
      clearCountryError();
      saveCheckoutDraft({ country: exactCode });
      const isPT = exactCode === 'PT';
      const currentMethod = isPT ? (loadCheckoutDraft().fulfillmentMethod || 'delivery') : 'delivery';
      updateFulfillmentUI(currentMethod, isPT);
      refreshShippingQuote();
    } else {
      countryInput.value = '';
      saveCheckoutDraft({ country: '' });
      updateFulfillmentUI('delivery', false);
      refreshShippingQuote();
    }
    renderCountryOptions(typed, true);
  });
  countrySearch.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (countryList.hidden) renderCountryOptions(countrySearch.value, true);
      else updateActiveOption(activeOptionIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (countryList.hidden) renderCountryOptions(countrySearch.value, true);
      else updateActiveOption(activeOptionIndex - 1);
    } else if (e.key === 'Enter') {
      if (!countryList.hidden && activeOptionIndex >= 0 && filteredCountries[activeOptionIndex]) {
        e.preventDefault();
        selectCountryByCode(filteredCountries[activeOptionIndex].code, true);
      } else if (resolveCountryCode(countrySearch.value)) {
        selectCountryByCode(resolveCountryCode(countrySearch.value), true);
      }
    } else if (e.key === 'Escape') {
      if (!countryList.hidden) {
        e.preventDefault();
        closeCountryDropdown();
        if (countryInput.value) countrySearch.value = countryDisplayName(countryInput.value);
      }
    }
  });
  countryList.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('[data-country-code]');
    if (!opt) return;
    e.preventDefault();
    selectCountryByCode(opt.getAttribute('data-country-code'), true);
  });
  countryList.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-country-code]');
    if (!opt) return;
    selectCountryByCode(opt.getAttribute('data-country-code'), true);
  });
  countrySearch.addEventListener('blur', () => {
    setTimeout(() => {
      if (countryBox.contains(document.activeElement)) return;
      closeCountryDropdown();
      const typed = countrySearch.value.trim();
      if (!typed) {
        selectCountryByCode('', false);
        return;
      }
      const matched = resolveCountryCode(typed);
      if (matched) {
        selectCountryByCode(matched, false);
      } else if (countryInput.value && resolveCountryCode(countryInput.value)) {
        countrySearch.value = countryDisplayName(countryInput.value);
        refreshShippingQuote();
      } else if (filteredCountries.length === 1) {
        selectCountryByCode(filteredCountries[0].code, false);
      } else {
        countryInput.value = '';
        saveCheckoutDraft({ country: '' });
        refreshShippingQuote();
      }
    }, 150);
  });

  countryInput.addEventListener('change', () => {
    const code = resolveCountryCode(countryInput.value);
    if (code) {
      countryInput.value = code;
      if (countrySearch && document.activeElement !== countrySearch) {
        countrySearch.value = countryDisplayName(code);
      }
      clearCountryError();
      saveCheckoutDraft({ country: code });
      const isPT = code === 'PT';
      const currentMethod = isPT ? (loadCheckoutDraft().fulfillmentMethod || 'delivery') : 'delivery';
      updateFulfillmentUI(currentMethod, isPT);
    } else {
      countryInput.value = '';
      if (countrySearch && document.activeElement !== countrySearch) countrySearch.value = '';
      saveCheckoutDraft({ country: '' });
      updateFulfillmentUI('delivery', false);
    }
    refreshShippingQuote();
  });
  countryInput.addEventListener('blur', refreshShippingQuote);

  // Trigger initial shipping calculation if a country was restored from draft
  if (savedCountryCode) {
    refreshShippingQuote();
  }

  // ---- Coupon ----
  const couponInput = document.getElementById('coCoupon');
  const couponMsg = document.getElementById('couponMsg');
  const applyBtn = document.getElementById('couponApply');
  const applied = getAppliedCoupon();
  if (applied){
    couponInput.value = applied.code;
    couponInput.disabled = true;
    couponMsg.textContent = `${uiTxt('coupon_applied')} (${applied.code})`;
    couponMsg.className = 'coupon-msg ok';
    applyBtn.textContent = uiTxt('remove_code');
  }
  applyBtn.addEventListener('click', ()=>{
    if (getAppliedCoupon()){ removeCoupon(); renderCheckoutPage(); return; }
    const code = couponInput.value.trim();
    if (!code){ couponMsg.textContent = uiTxt('coupon_invalid'); couponMsg.className='coupon-msg err'; return; }
    applyBtn.disabled = true;
    const oldTxt = applyBtn.textContent;
    applyBtn.textContent = uiTxt('coupon_applying');
    setTimeout(()=>{
      const r = applyCoupon(code);
      applyBtn.disabled = false;
      applyBtn.textContent = oldTxt;
      if (r.ok){
        renderCheckoutPage();
      } else {
        couponMsg.textContent = uiTxt(r.msgKey); couponMsg.className='coupon-msg err';
      }
    }, 250);
  });

  // Rebuild choices when the destination changes; never retain an unavailable method.
  function syncPaymentMethods(country){
    const container = document.getElementById('payMethods');
    if (!container) return;
    const allowed = paymentMethodsForCountry(country);
    const selected = container.querySelector('input[name=pay]:checked')?.value || loadCheckoutDraft().pay;
    const method = allowed.includes(selected) ? selected : 'stripe';
    const key = allowed.join(',');
    if (container.dataset.methods !== key) {
      container.innerHTML = allowed.map((m,idx)=>paymentMethodHTML(m,idx,method)).join('');
      container.dataset.methods = key;
      container.querySelectorAll('input[name=pay]').forEach(r => {
        r.addEventListener('change', () => {
          container.querySelectorAll('.method').forEach(el=>el.classList.remove('active'));
          r.closest('.method').classList.add('active');
          saveCheckoutDraft({pay:r.value});
          updatePayArea(r.value);
        });
      });
    }
    saveCheckoutDraft({pay:method});
    updatePayArea(method);
  }
  syncPaymentMethods(countryInput.value);

  function updatePayArea(method){
    const pa = document.getElementById('payArea');
    if (!pa) return;
    const btn = document.getElementById('placeOrderBtn');
    if (method === 'orange_money') {
      pa.innerHTML = `<div class="om-instructions-box">
        <div class="om-details">
          <div class="om-field">
            <span class="om-label">${escapeHTML(uiTxt('om_recipient_name_label'))}:</span>
            <span class="om-value" style="user-select:all;-webkit-user-select:all;">Ciara Ly</span>
          </div>
          <div class="om-field">
            <span class="om-label">${escapeHTML(uiTxt('om_recipient_phone_label'))}:</span>
            <span class="om-value" style="user-select:all;-webkit-user-select:all;">+245 95 734 21 44</span>
          </div>
        </div>
        <div class="om-notice-banner">
          <p class="om-notice"><strong>${escapeHTML(uiTxt('om_notice_warning'))}</strong></p>
        </div>
        <p class="om-desc">${escapeHTML(uiTxt('om_instructions'))}</p>
      </div>`;
      if (btn) btn.textContent = uiTxt('submit_om_request');
    } else {
      pa.innerHTML = `<div class="stripe-info">
        <p class="pay-ready">${escapeHTML(uiTxt('pay_stripe_desc'))}</p>
        <p class="pay-qualifier">${escapeHTML(uiTxt('pay_stripe_qualifications'))}</p>
      </div>`;
      if (btn) btn.textContent = uiTxt('pay_with_stripe');
    }
  }

  // ---- Submit + security ----
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    if (checkoutSubmitting) return; // block double submission
    if (!validateCheckout(form)){ focusFirstError(form); return; }
    checkoutSubmitting = true;
    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true;
    btn.textContent = uiTxt('order_submitting');
    placeOrder(btn);
  });

  // restore submitted state in case of re-render
  if (getAppliedCoupon()){ /* coupon UI already handled above */ }
}
function paymentMethodsForCountry(country){
  return resolveCountryCode(country) === 'GW' ? ['stripe','orange_money'] : ['stripe'];
}
function paymentMethodHTML(m, idx, activeMethod){
  const cfg = CONFIG.payment && CONFIG.payment[m];
  const configured = !!(cfg && cfg.configured);
  const labels = { stripe:'pay_stripe', orange_money:'pay_orange_money' };
  const descriptions = { stripe:'pay_stripe_desc', orange_money:'pay_orange_money_desc' };
  const logos = {
    stripe: `<span class="pay-logo card-logos" aria-hidden="true"><svg viewBox="0 0 48 32"><rect x="1" y="1" width="46" height="30" rx="5"/><path d="M8 11h32M8 17h12"/></svg><span class="visa">VISA</span><span class="mc">●●</span></span>`,
    orange_money: `<span class="pay-logo om-logo" aria-hidden="true"><img src="assets/img/orange-money-logo.png" alt="" width="500" height="336"></span>`,
    paypal: `<span class="pay-logo paypal-logo" aria-hidden="true"><svg viewBox="0 0 24 30"><path d="M5 28 9 3h7c5 0 7 2 6 6-1 5-5 7-10 7h-2l-2 12Z"/><path d="M9 22h5c4 0 6-2 7-6"/></svg><span>Pay<span>Pal</span></span></span>`,
    mbway: `<span class="pay-logo mbway-logo" aria-hidden="true"><svg viewBox="0 0 22 30"><rect x="2" y="1" width="18" height="28" rx="4"/><circle cx="11" cy="25" r="1"/><path d="m7 9 3 3 5-5M7 18h8"/></svg><span>MB<span>WAY</span></span></span>`,
  };
  const isChecked = activeMethod ? (m === activeMethod) : (idx === 0);
  const tagText = configured ? uiTxt('pay_ready') : (cfg && cfg.manual ? uiTxt('pay_manual_transfer') : uiTxt('pay_preview'));
  return `<label class="method${isChecked ? ' active' : ''}${configured ? ' is-ready' : ''}">
    <input type="radio" name="pay" value="${m}"${isChecked ? ' checked' : ''}>
    <span class="m-radio"></span>
    ${logos[m] || ''}
    <span class="m-body">
      <span class="m-name">${uiTxt(labels[m] || m)}</span>
      <span class="m-sub">${uiTxt(descriptions[m] || m)}</span>
      <span class="m-pending-tag">${tagText}</span>
    </span>
    <span class="method-chevron" aria-hidden="true">›</span>
  </label>`;
}

/* Validate the checkout form; attaches per-field errors and returns validity. */
function validateCheckout(form){
  const countryEl = form.querySelector('[name="country"]');
  const searchEl = form.querySelector('#coCountrySearch');
  if (countryEl && !resolveCountryCode(countryEl.value) && searchEl && resolveCountryCode(searchEl.value)) {
    countryEl.value = resolveCountryCode(searchEl.value);
    searchEl.value = countryDisplayName(countryEl.value);
  }
  const countryCode = resolveCountryCode(countryEl ? countryEl.value : '');
  const pickupRadio = form.querySelector('input[name="fulfillmentMethod"][value="pickup"]');
  const isPickup = countryCode === 'PT' && Boolean(pickupRadio && pickupRadio.checked);

  const checks = [
    ['email', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'fld_email'],
    ['phone', v => v.trim().length >= 7, 'fld_required'],
    ['first', v => v.trim()!=='', 'fld_required'],
    ['last',  v => v.trim()!=='', 'fld_required'],
    ['country', v => Boolean(resolveCountryCode(v)), 'fld_required'],
  ];
  if (!isPickup) {
    checks.push(
      ['address', v => v.trim()!=='', 'fld_required'],
      ['zip',   v => v.trim()!=='', 'fld_required'],
      ['city',  v => v.trim()!=='', 'fld_required']
    );
  }
  let ok = true;
  checks.forEach(([name, test, key])=>{
    const input = form.querySelector('[name="'+name+'"]');
    const errEl = form.querySelector('.ferr[data-for="'+name+'"]');
    const valid = input && test(input.value);
    if (input){ input.classList.toggle('invalid', !valid); input.setAttribute('aria-invalid', valid?'false':'true'); }
    if (name === 'country' && searchEl){ searchEl.classList.toggle('invalid', !valid); searchEl.setAttribute('aria-invalid', valid?'false':'true'); }
    if (errEl){ errEl.textContent = valid ? '' : uiTxt(key); if (valid) errEl.removeAttribute('role'); else errEl.setAttribute('role','alert'); }
    if (!valid) ok = false;
  });
  if (isPickup) {
    ['address', 'zip', 'city'].forEach(name => {
      const input = form.querySelector('[name="'+name+'"]');
      const errEl = form.querySelector('.ferr[data-for="'+name+'"]');
      if (input){ input.classList.remove('invalid'); input.setAttribute('aria-invalid', 'false'); }
      if (errEl){ errEl.textContent = ''; errEl.removeAttribute('role'); }
    });
  }
  return ok;
}
function focusFirstError(form){
  const first = form.querySelector('input:not([type="hidden"]).invalid, textarea.invalid, input:not([type="hidden"])[aria-invalid="true"], .invalid, [aria-invalid="true"]');
  if (first && typeof first.focus === 'function'){ first.focus(); }
}

async function startStripeCheckout(customer, cart, note, btn, fulfillmentMethod = 'delivery'){
  if (!CONFIG.stripeCheckoutURL) throw new Error('Stripe checkout is not configured');
  const countryCode = resolveCountryCode(customer.country) || customer.country;
  const isPickup = countryCode === 'PT' && fulfillmentMethod === 'pickup';
  const method = isPickup ? 'pickup' : 'delivery';
  const customerAddress = isPickup
    ? [PICKUP_LOCATION.address, PICKUP_LOCATION.apt].filter(Boolean).join(', ')
    : [customer.address, customer.apt].filter(Boolean).join(', ');
  const customerCity = isPickup ? PICKUP_LOCATION.city : customer.city;
  const customerZip = isPickup ? PICKUP_LOCATION.zip : customer.zip;

  const requestBody = {
    customer: {
      name:customer.name, email:customer.email, phone:customer.phone,
      country:countryCode, address:customerAddress,
      city:customerCity, postalCode:customerZip,
    },
    items:cart.map(i=>({handle:i.handle, options:i.opts, quantity:i.qty})),
    couponCode:getAppliedCoupon()?.code || '',
    fulfillmentMethod:method,
  };
  const response = await fetch(CONFIG.stripeCheckoutURL, {
    method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(requestBody),
  });
  const result = await response.json();
  if (!response.ok || !result.checkoutUrl){
    if (response.status===422 && typeof result.error==='string') throw new Error(result.error);
    throw new Error('Secure checkout could not be started. Your cart is unchanged.');
  }
  const checkoutURL = new URL(result.checkoutUrl);
  if (checkoutURL.protocol !== 'https:' || checkoutURL.hostname !== 'checkout.stripe.com') throw new Error('Invalid checkout destination.');
  window.location.assign(checkoutURL.href);
}

/* Send the order to the backend (Google Apps Script) and fall back to WhatsApp. */
function placeOrder(btn){
  const cur = 'EUR'; // settlement currency
  const cart = getCart();
  const rawCountry = document.getElementById('coCountry').value.trim();
  const countryCode = resolveCountryCode(rawCountry) || rawCountry;
  const isPT = countryCode === 'PT';
  const pickupRadio = document.querySelector('input[name="fulfillmentMethod"][value="pickup"]');
  const isPickup = isPT && Boolean(pickupRadio && (pickupRadio.checked || pickupRadio.value === 'pickup') && pickupRadio.value === 'pickup' && document.querySelector('input[name="fulfillmentMethod"]:checked')?.value === 'pickup');
  const fulfillmentMethod = isPickup ? 'pickup' : 'delivery';

  const rate = shippingRateForCountry(countryCode, fulfillmentMethod);
  const t = cartTotals(getAppliedCoupon(), rate ? rate.shippingCents / 100 : null);
  const method = (document.querySelector('input[name=pay]:checked')?.value) || '';
  const note = document.getElementById('orderNote');

  // In placeOrder allow only stripe or orange_money.
  if (!paymentMethodsForCountry(countryCode).includes(method)) {
    if (note) {
      note.textContent = uiTxt('invalid_payment_method');
      note.className = 'order-note error';
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = uiTxt('place_order');
    }
    checkoutSubmitting = false;
    return;
  }

  const coupon = getAppliedCoupon();
  const draft = (typeof loadCheckoutDraft === 'function') ? loadCheckoutDraft() : {};
  const homeDraft = draft.homeDraft || {};
  const pickupLoc = (typeof PICKUP_LOCATION !== 'undefined') ? PICKUP_LOCATION : { address: 'Rua Elias Garcia, n.º 229', apt: '1.º andar, Loja E', zip: '2700-319', city: 'Amadora', fullAddress: 'Midana Beauty, Centro Comercial da Amadora; Rua Elias Garcia, n.º 229, 2700-319 Amadora, Portugal; 1.º andar, Loja E' };

  const customerData = {
    name: document.getElementById('coFirst').value.trim() + ' ' + document.getElementById('coLast').value.trim(),
    email: document.getElementById('coEmail').value.trim(),
    phone: document.getElementById('coPhone').value.trim(),
    country: countryCode,
    address: isPickup ? pickupLoc.address : document.getElementById('coAddr').value.trim(),
    apt: isPickup ? pickupLoc.apt : document.getElementById('coApt').value.trim(),
    zip: isPickup ? pickupLoc.zip : document.getElementById('coZip').value.trim(),
    city: isPickup ? pickupLoc.city : document.getElementById('coCity').value.trim(),
    district: isPickup ? '' : document.getElementById('coDistrict').value.trim(),
    notes: document.getElementById('coNotes').value.trim(),
  };

  saveCheckoutDraft({
    first: document.getElementById('coFirst').value,
    last: document.getElementById('coLast').value,
    email: document.getElementById('coEmail').value,
    phone: document.getElementById('coPhone').value,
    country: countryCode,
    fulfillmentMethod,
    homeDraft: isPickup ? homeDraft : {
      address: document.getElementById('coAddr').value,
      apt: document.getElementById('coApt').value,
      zip: document.getElementById('coZip').value,
      city: document.getElementById('coCity').value,
      district: document.getElementById('coDistrict').value,
    },
    notes: document.getElementById('coNotes').value,
    pay: method,
  });

  const items = cart.map(i => ({ title:i.title, opts:i.opts, optionNames:i.optionNames, qty:i.qty, priceEur:i.priceEur, compareEur:i.compareEur }));
  const lines = cart.map(i =>
    `• ${i.title} (${Object.values(i.opts).filter(Boolean).join(', ')}) ×${i.qty} — ${money(i.priceEur,'EUR')}${(i.compareEur&&i.compareEur>i.priceEur)?' (era '+money(i.compareEur,'EUR')+')':''}`
  ).join('\n');

  const fulfillmentLabel = isPickup
    ? (uiTxt('delivery_pickup_pt') || 'Ponto de recolha — Grátis')
    : (isPT ? (uiTxt('delivery_home_pt') || 'Entrega em casa — 7,99 €') : (uiTxt('shipping') || 'Envio'));
  const storeAddressLine = `Local de recolha: ${pickupLoc.fullAddress}`;
  const addressLine = isPickup
    ? storeAddressLine
    : [customerData.address, customerData.apt].filter(Boolean).join(', ') + ', ' + customerData.zip + ' ' + customerData.city + (customerData.district?', '+customerData.district:'') + (customerData.country?', '+customerData.country:'');

  const shippingText = t.shippingKnown ? (t.shipping === 0 ? (uiTxt('free') || 'Grátis') : money(t.shipping,'EUR')) : (uiTxt('shipping_select_country') || uiTxt('shipping_calc_checkout'));
  const totalText = t.shippingKnown ? money(t.totalFinal,'EUR') : (uiTxt('shipping_select_country') || uiTxt('shipping_calc_checkout'));
  const methodLabel = method === 'orange_money' ? uiTxt('pay_orange_money') : uiTxt('pay_stripe');
  const text = `NOVO PEDIDO DE PAGAMENTO (Asheerah Hair)\n${lines}${coupon?`\nCupom de embaixador: ${coupon.code}`:''}\n\nSubtotal original: ${money(t.subtotalOriginal,'EUR')}\nDesconto: −${money(t.totalDiscount,'EUR')}\nEnvio: ${shippingText}\nTOTAL ESTIMADO: ${totalText}\nMétodo de envio: ${fulfillmentLabel}${isPickup ? `\n${storeAddressLine}` : ''}\nMétodo preferido: ${methodLabel}\n\nCliente: ${customerData.name}\nEmail: ${customerData.email}\nTelefone: ${customerData.phone}\nMorada: ${addressLine}${customerData.notes?'\nNotas: '+customerData.notes:''}`;

  const payload = {
    type:'order',
    text,
    method,
    fulfillmentMethod,
    pickupLocation: isPickup ? pickupLoc.fullAddress : null,
    items,
    subtotalEur: t.subtotalOriginal,
    shippingEur: t.shippingKnown ? t.shipping : null,
    totalEur: t.shippingKnown ? t.totalFinal : null,
    totalDiscountEur: t.totalDiscount,
    coupon: coupon ? coupon.code : null,
    currency:'EUR',
    customer: customerData,
    clientComputed:{ subtotalOriginalEur:t.subtotalOriginal, totalDiscountEur:t.totalDiscount, totalFinalEur:t.shippingKnown?t.totalFinal:null },
  };

  // Preserve Stripe flow unchanged.
  if (method === 'stripe') {
    startStripeCheckout(customerData, cart, note, btn, fulfillmentMethod).catch(err=>{
      if (note){ note.textContent = err.message; note.className='order-note error'; }
      if (btn){ btn.textContent = uiTxt('pay_with_stripe'); btn.disabled = false; }
      checkoutSubmitting = false;
    });
    return;
  }

  // Orange Money flow
  const waUrl = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;

  function attachHandoffListener(){
    if (!note) return;
    const waLink = note.querySelector('#omWaBtn');
    if (waLink) {
      waLink.addEventListener('click', () => {
        const info = note.querySelector('.om-note-info');
        if (info) info.textContent = uiTxt('om_handoff_opened');
      });
    }
  }

  const fallback = () => {
    window.open(waUrl, '_blank');
    if (note) {
      note.className = 'order-note ok';
      note.innerHTML = `<span class="om-note-info">${escapeHTML(uiTxt('om_handoff_opened'))}</span> <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary om-wa-btn" id="omWaBtn">${escapeHTML(uiTxt('om_open_whatsapp'))}</a>`;
      attachHandoffListener();
    }
    if (btn) { btn.textContent = uiTxt('submit_om_request'); btn.disabled = false; }
    checkoutSubmitting = false;
  };

  if (CONFIG.backendURL) {
    fetch(CONFIG.backendURL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(r => {
        if (!r.ok) throw new Error('Request could not be recorded');
        return r.json();
      })
      .then(d => {
        if (!d || !d.ok) {
          throw new Error('Server returned non-ok response');
        }
        if (note) {
          note.className = 'order-note ok';
          note.innerHTML = `<span class="om-note-info">${escapeHTML(uiTxt('om_request_recorded'))} ${escapeHTML(uiTxt('om_cart_retained'))}</span> <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary om-wa-btn" id="omWaBtn">${escapeHTML(uiTxt('om_open_whatsapp'))}</a>`;
          attachHandoffListener();
        }
        if (btn) { btn.textContent = uiTxt('submit_om_request'); btn.disabled = false; }
        checkoutSubmitting = false;
      })
      .catch(() => {
        if (note) {
          note.className = 'order-note error';
          note.innerHTML = `<span class="om-note-info">${escapeHTML(uiTxt('om_record_failed'))}</span> <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary om-wa-btn" id="omWaBtn">${escapeHTML(uiTxt('om_open_whatsapp'))}</a>`;
          attachHandoffListener();
        }
        if (btn) { btn.textContent = uiTxt('submit_om_request'); btn.disabled = false; }
        checkoutSubmitting = false;
      });
  } else {
    fallback();
  }
}
function showOrderConfirmation(payload, text){
  // Replace the checkout body with a confirmation summary (order NOT marked paid).
  const root = document.getElementById('checkoutRoot');
  if (!root) return;
  const cur = curCode();
  const itemsHTML = (payload.items||[]).map(i =>
    `<li>${escapeHTML(i.title)} ×${i.qty}</li>`).join('');
  root.innerHTML = `<div class="order-confirm">
    <h2>✓ ${uiTxt('order_received')}</h2>
    <p>${uiTxt('order_saved_confirm')}</p>
    <ul>${itemsHTML}</ul>
    <p class="order-confirm-note">${uiTxt('pay_config_note')}</p>
    <a href="shop.html" class="btn-primary">${uiTxt('continue_shopping')}</a>
  </div>`;
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ---------- Expose for inline handlers ----------
window.changeQty = changeQty;
if (typeof window !== 'undefined') {
  window.shippingRateForCountry = shippingRateForCountry;
  window.loadCheckoutDraft = loadCheckoutDraft;
  window.saveCheckoutDraft = saveCheckoutDraft;
  window.clearCheckoutDraft = clearCheckoutDraft;
  window.getAppliedCoupon = getAppliedCoupon;
  window.applyCoupon = applyCoupon;
  window.removeCoupon = removeCoupon;
  window.cartTotals = cartTotals;
  window.PICKUP_LOCATION = PICKUP_LOCATION;
  window.EUROPE_COUNTRY_CODES = EUROPE_COUNTRY_CODES;
  window.EU_COUNTRY_CODES = EU_COUNTRY_CODES;
}
