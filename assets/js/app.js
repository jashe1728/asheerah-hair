/* Asheerah Hair — shared app logic: catalog, cart, currency, pricing, checkout, search.
 * Loaded AFTER config.js and i18n.js.
 * Single source of truth for pricing lives in variantPricing() — used by shop,
 * product, cart and checkout so every surface shows the same amounts.
 */
'use strict';

let checkoutSubmitting = false; // guards against double order submission

const CONFIG = window.CONFIG || {
  currency:'EUR', rates:{EUR:1,USD:1.08,GBP:0.85}, shipping:30, shippingEta:'6–10 days', taxRate:0,
  coupons:{}, payment:{ pending:{configured:false} },
  whatsapp:'351914522508', email:'asheerahhair@gmail.com',
  backendURL:'', stripePublishable:'', paypalClientId:'', mbwayKey:'',
};

const CURRENCIES = {
  EUR: { symbol: '€', label: 'EUR' },
  USD: { symbol: '$', label: 'USD' },
  GBP: { symbol: '£', label: 'GBP' },
};

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
function curCode(){ return localStorage.getItem('ash_cur') || CONFIG.currency || 'EUR'; }
function money(priceEur, cur){
  const rate = CONFIG.rates[cur] || 1;
  const sym = (CURRENCIES[cur] || CURRENCIES.EUR).symbol;
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
    String(v.opt3||'')===String(opts.opt3||'')) || null;
}

// ---------- Cart (localStorage) ----------
function getCart(){ try { return JSON.parse(localStorage.getItem('ash_cart')||'[]'); } catch(e){ return []; } }
function saveCart(c){ localStorage.setItem('ash_cart', JSON.stringify(c)); }
function cartCount(){ return getCart().reduce((n,i)=>n+i.qty,0); }

/* Per-item pricing from stored variant values. */
function itemOriginalEur(i){ const o = i.compareEur && i.compareEur > i.priceEur ? i.compareEur : i.priceEur; return o; }

/* Cart financial summary (all in EUR, integer cents internally). */
function cartTotals(coupon){
  const cart = getCart();
  let subtotalOriginal = 0, itemDiscount = 0;
  cart.forEach(i => {
    const orig = itemOriginalEur(i);
    subtotalOriginal += orig * i.qty;
    itemDiscount += (orig - i.priceEur) * i.qty;
  });
  subtotalOriginal = round2(subtotalOriginal);
  itemDiscount = round2(itemDiscount);

  let couponDiscount = 0;
  if (coupon){
    if (coupon.type === 'percent'){
      couponDiscount = round2(subtotalOriginal * coupon.value / 100);
    } else if (coupon.type === 'fixed'){
      couponDiscount = round2(Math.min(coupon.value, subtotalOriginal));
    }
  }
  const totalDiscount = round2(itemDiscount + couponDiscount);
  const subtotalFinal = round2(subtotalOriginal - totalDiscount);
  const shipping = cart.length ? CONFIG.shipping : 0;
  const taxes = round2(subtotalFinal * (CONFIG.taxRate || 0));
  const totalFinal = round2(subtotalFinal + shipping + taxes);
  return { subtotalOriginal, itemDiscount, couponDiscount, totalDiscount, subtotalFinal, shipping, taxes, totalFinal };
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
  try { return JSON.parse(localStorage.getItem('ash_coupon')||'null'); } catch(e){ return null; }
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
  for (let k=1;k<=3;k++){
    const o = i.opts ? i.opts['opt'+k] : '';
    if (o) parts.push({ name:(i.optionNames&&i.optionNames[k-1])||'', val:o });
  }
  return parts.map(p=>`<span class="meta-line"><b>${escapeHTML(p.name)}:</b> ${escapeHTML(p.val)}</span>`).join('');
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
      else if (href.includes('shop') && ['shop','product','cart','checkout'].includes(page)) a.classList.add('active');
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
  btn.innerHTML = '<span class="cur-sym">'+curSym(cur)+'</span><span>'+cur+'</span><span class="chev">⌄</span>';
  const menu = document.createElement('div');
  menu.className = 'currency-menu';
  menu.setAttribute('role','listbox');
  Object.keys(CURRENCIES).forEach(code => {
    const c = CURRENCIES[code];
    const opt = document.createElement('button');
    opt.className = 'currency-opt' + (code===cur?' active':'');
    opt.setAttribute('role','option');
    opt.setAttribute('data-cur', code);
    opt.innerHTML = '<span class="cur-sym">'+c.symbol+'</span><span>'+c.label+'</span>' + (code===cur?' ✓':'');
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
    b.innerHTML = '<span class="cur-sym">'+CURRENCIES[code].symbol+'</span><span>'+CURRENCIES[code].label+'</span>';
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
  if (page === 'product') renderProduct();
  if (page === 'cart') renderCartPage();
  if (page === 'checkout') renderCheckoutPage();
});

// ---------- Shop grid ----------
function renderFeatured(){
  const grid = document.getElementById('featuredGrid'); if (!grid || !CATALOG) return;
  const cur = curCode();
  const preferred = ['wigs','bundles','crochet'];
  const list = preferred.flatMap(cat => CATALOG.products.filter(p => p.category === cat && p.images && p.images[0]).slice(0,2));
  grid.innerHTML = list.map(p => {
    const pricing = variantPricing(p, defaultOpts(p));
    const price = priceHTML(pricing.priceEur, pricing.hasPromo ? pricing.compareEur : null, cur);
    return `<a class="product-card featured-card" href="product.html?h=${encodeURIComponent(p.handle)}">
      <div class="img"><img src="${p.images[0]}" alt="${escapeHTML(p.title)}" loading="lazy"></div>
      <div class="info"><span class="featured-category">${escapeHTML(p.category)}</span><h3>${escapeHTML(p.title)}</h3><div class="price">${price}</div><span class="buy-btn">${uiTxt('view_product')}</span></div>
    </a>`;
  }).join('');
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
    return `<a class="product-card shop-card" href="product.html?h=${p.handle}">
      <div class="img"><img src="${p.images[0]||''}" alt="${escapeHTML(p.title)}" loading="lazy"></div>
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

function productReviews(p){
  let saved=[];
  try{ saved=JSON.parse(localStorage.getItem('ash_product_reviews')||'[]'); }catch(e){ saved=[]; }
  return SEEDED_PRODUCT_REVIEWS.filter(r=>r.productHandle===p.handle)
    .concat(saved.filter(r=>r.productHandle===p.handle));
}
function starsHTML(rating){
  const n=Math.max(1,Math.min(5,Number(rating)||5));
  return '★★★★★'.slice(0,n)+'<span class="stars-muted">'+'★★★★★'.slice(0,5-n)+'</span>';
}
function productReviewsHTML(p){
  const reviews=productReviews(p);
  const list=reviews.length
    ? reviews.map(r=>`<article class="product-review"><div class="review-stars" aria-label="${r.rating} out of 5 stars">${starsHTML(r.rating)}</div><p>${escapeHTML(r.text)}</p><strong>${escapeHTML(r.name)}</strong><span class="review-source">${uiTxt('customer_review')}</span></article>`).join('')
    : `<p class="reviews-empty">${uiTxt('reviews_empty')}</p>`;
  return `<section class="product-reviews" aria-labelledby="productReviewsTitle">
    <div class="section-head"><span class="eyebrow">${uiTxt('reviews_label')}</span><h2 id="productReviewsTitle">${uiTxt('product_reviews')}</h2></div>
    <div class="product-review-list">${list}</div>
    <form class="review-form" onsubmit="submitProductReview(event)">
      <h3>${uiTxt('leave_review')}</h3>
      <div class="review-form-grid"><input name="reviewName" maxlength="80" placeholder="${uiTxt('review_name_ph')}" required><select name="reviewRating" aria-label="${uiTxt('review_rating')}" required><option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option></select></div>
      <textarea name="reviewText" maxlength="500" rows="4" placeholder="${uiTxt('review_text_ph')}" required></textarea>
      <button class="btn-primary review-submit" type="submit">${uiTxt('submit_review')}</button>
      <p class="review-note">${uiTxt('review_note')}</p>
    </form>
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
  return `<section class="product-recommendations" aria-labelledby="recommendedTitle"><div class="section-head"><span class="eyebrow">${uiTxt('you_may_also_like')}</span><h2 id="recommendedTitle">${uiTxt('recommended_hair')}</h2></div><div class="recommended-grid">${list.map(x=>{const pricing=variantPricing(x,defaultOpts(x));const price=priceHTML(pricing.priceEur,pricing.hasPromo?pricing.compareEur:null,curCode());return `<a class="product-card shop-card recommended-card" href="product.html?h=${encodeURIComponent(x.handle)}"><div class="img"><img src="${x.images[0]}" alt="${escapeHTML(x.title)}" loading="lazy"></div><div class="info"><h3>${escapeHTML(x.title)}</h3><div class="price">${price}</div><span class="buy-btn">${uiTxt('btn_shop')}</span></div></a>`;}).join('')}</div></section>`;
}
window.submitProductReview = event => {
  event.preventDefault();
  const form=event.currentTarget, data=new FormData(form), name=String(data.get('reviewName')||'').trim(), text=String(data.get('reviewText')||'').trim();
  if(!name||!text||!window._product)return;
  let saved=[];try{saved=JSON.parse(localStorage.getItem('ash_product_reviews')||'[]');}catch(e){saved=[];}
  saved.push({productHandle:window._product.handle,name,rating:Number(data.get('reviewRating'))||5,text,createdAt:new Date().toISOString()});
  localStorage.setItem('ash_product_reviews',JSON.stringify(saved.slice(-50)));
  renderProduct();
};

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
        <div class="gallery">
          <div class="main-img"><img id="mainImg" src="${p.images[0]||''}" alt="${escapeHTML(p.title)}"></div>
          <div class="thumbs">${p.images.slice(0,6).map((im,i)=>`<img src="${im}" class="${i===0?'active':''}" data-src="${im}" alt="${escapeHTML(p.title)} ${i+1}" onclick="setMain('${im}',this)">`).join('')}</div>
        </div>
        <div class="buy">
          <h1>${escapeHTML(p.title)}</h1>
          ${priceRow}
          ${opts.map((o,i)=> optionGroupHTML(o, sel, i, cur)).join('')}
          <div class="qty">
            <span class="sr-only">${uiTxt('quantity')}</span>
            <button type="button" onclick="qtyChange(-1)" aria-label="${uiTxt('quantity')} −">−</button>
            <span id="qtyVal" aria-live="polite">1</span>
            <button type="button" onclick="qtyChange(1)" aria-label="${uiTxt('quantity')} +">+</button>
          </div>
          ${addBtn}
          <div class="desc"><h3>${uiTxt('description')}</h3><p>${p.description}</p></div>
        </div>
      </div>
      ${recommendationsHTML(p)}
      ${productReviewsHTML(p)}`;
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
    document.getElementById('mainImg').src = src;
    document.querySelectorAll('.thumbs img').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
  };
  window.addCurrentToCart = () => {
    const o = cartOpts(sel, opts);
    if (!variantPricing(p, o).found) return; // combo unavailable — do not add
    addToCart(handle, o, window.qtyVal||1);
    const t = document.querySelector('.add-btn');
    if (t){ t.textContent = uiTxt('added'); setTimeout(()=>{ t.textContent = uiTxt('add_to_cart'); }, 1400); }
  };
}
function cartOpts(sel, opts){
  return { opt1: sel[opts[0]?.name||'']||'', opt2: sel[opts[1]?.name||'']||'', opt3: sel[opts[2]?.name||'']||'' };
}
function isLaceOption(o){ return /lace/i.test(o.name||''); }

/* Render one option group. Lace options on wigs render as a 2-column
 * Transparent | HD comparison by size; everything else renders as pills. */
function optionGroupHTML(o, sel, idx, cur){
  const label = escapeHTML(o.name);
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
    return `<div class="option-group">
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
  return `<div class="option-group">
    <label>${label}</label>
    <div class="pills">
      ${o.values.map(vl=>`<button type="button" class="pill ${sel[o.name]===vl?'active':''}" onclick="selectOpt(${idx},'${escapeAttr(vl)}')" aria-pressed="${sel[o.name]===vl}">${escapeHTML(vl)}</button>`).join('')}
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
      <div class="row"><span>${uiTxt('shipping')}</span><span>${money(t.shipping,cur)}</span></div>
      <div class="shipping-eta">${uiTxt('shipping_eta')}: ${escapeHTML(CONFIG.shippingEta || '6–10 days')}</div>
      <div class="row total"><span>${uiTxt('total')}</span><span>${money(t.totalFinal,cur)}</span></div>
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
function renderCheckoutPage(){
  const root = document.getElementById('checkoutRoot'); if (!root) return;
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

  const t = cartTotals(getAppliedCoupon());
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
        <div class="fld"><label for="coCountry">${uiTxt('country_region')} *</label><input id="coCountry" name="country" autocomplete="country-name" required><p class="ferr" data-for="country"></p></div>
        <div class="fld"><label for="coAddr">${uiTxt('address_line')} *</label><input id="coAddr" name="address" autocomplete="street-address" required><p class="ferr" data-for="address"></p></div>
        <div class="fld"><label for="coApt">${uiTxt('apartment')}</label><input id="coApt" name="apt" autocomplete="address-line2"></div>
        <div class="fld-row">
          <div class="fld"><label for="coZip">${uiTxt('postal_code')} *</label><input id="coZip" name="zip" autocomplete="postal-code" required><p class="ferr" data-for="zip"></p></div>
          <div class="fld"><label for="coCity">${uiTxt('city')} *</label><input id="coCity" name="city" autocomplete="address-level2" required><p class="ferr" data-for="city"></p></div>
        </div>
        <div class="fld"><label for="coDistrict">${uiTxt('district')}</label><input id="coDistrict" name="district" autocomplete="address-level1"></div>
        <div class="fld"><label for="coNotes">${uiTxt('delivery_notes')}</label><textarea id="coNotes" name="notes" rows="2"></textarea></div>
      </fieldset>

      <fieldset>
        <legend>${uiTxt('payment_method')}</legend>
        <p class="payment-intro">${uiTxt('payment_choose')}</p>
        <div class="methods" id="payMethods">
          ${['stripe','paypal','mbway'].map((m,idx)=> paymentMethodHTML(m,idx)).join('')}
        </div>
        <div id="payArea" class="pay-area" aria-live="polite"></div>
      </fieldset>

      <div class="coupon-box">
        <label for="coCoupon">${uiTxt('coupon_label')}</label>
        <div class="coupon-row">
          <input id="coCoupon" name="coupon" autocomplete="off" placeholder="EXEMPLO10">
          <button type="button" id="couponApply" class="btn-secondary">${uiTxt('apply')}</button>
        </div>
        <p id="couponMsg" class="coupon-msg"></p>
        <p class="coupon-hint">${uiTxt('apply_coupon_hint')}</p>
      </div>

      <p class="sec-note">${uiTxt('secure_checkout_note')}</p>
      <button type="submit" id="placeOrderBtn" class="btn-primary co-submit">${uiTxt('place_order')}</button>
      <p id="orderNote" class="order-note" role="status"></p>
    </div>

    <div class="co-col co-summary">
      <div class="summary">
        <h2>${uiTxt('items_summary')}</h2>
        ${itemsHTML}
        <div class="totals">
          <div class="row"><span>${uiTxt('subtotal_original')}</span><span>${money(t.subtotalOriginal,cur)}</span></div>
          ${t.totalDiscount>0?`<div class="row disc"><span>${uiTxt('discount_total')}</span><span>−${money(t.totalDiscount,cur)}</span></div>`:''}
          <div class="row"><span>${uiTxt('shipping')}</span><span>${money(t.shipping,cur)}</span></div>
      <div class="shipping-eta">${uiTxt('shipping_eta')}: ${escapeHTML(CONFIG.shippingEta || '6–10 days')}</div>
          ${t.taxes>0?`<div class="row"><span>${uiTxt('taxes')}</span><span>${money(t.taxes,cur)}</span></div>`:''}
          <div class="row total"><span>${uiTxt('final_total')}</span><span>${money(t.totalFinal,cur)}</span></div>
        </div>
      </div>
    </div>
  </form>`;

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

  // ---- Payment method toggle + real brand logos ----
  const payMethods = document.getElementById('payMethods');
  payMethods.querySelectorAll('input[name=pay]').forEach(r=>{
    if (r.checked) r.closest('.method').classList.add('active');
    r.addEventListener('change', ()=>{
      payMethods.querySelectorAll('.method').forEach(m=>m.classList.remove('active'));
      r.closest('.method').classList.add('active');
      updatePayArea(r.value);
    });
  });
  const payDefault = document.querySelector('input[name=pay]:checked') || document.querySelector('input[name=pay]');
  if (payDefault) updatePayArea(payDefault.value);

  function updatePayArea(method){
    const pa = document.getElementById('payArea');
    if (method==='mbway'){
      pa.innerHTML = `<div class="fld"><label for="mbwayPhone">${uiTxt('mbway_phone_hint')}</label><input type="tel" id="mbwayPhone" inputmode="tel" placeholder="+351 …"></div>`;
    } else {
      const cfg = CONFIG.payment && CONFIG.payment[method];
      pa.innerHTML = cfg && cfg.configured
        ? `<p class="pay-ready">${method==='stripe'?uiTxt('pay_card'):uiTxt('pay_paypal')}</p>`
        : `<p class="pay-pending">${uiTxt('pay_config_note')}</p>`;
    }
  }

  // ---- Submit + security ----
  const form = document.getElementById('checkoutForm');
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
function paymentMethodHTML(m, idx){
  const cfg = CONFIG.payment && CONFIG.payment[m];
  const configured = !!(cfg && cfg.configured);
  const labels = { stripe:'pay_card', paypal:'pay_paypal', mbway:'pay_mbway' };
  const descriptions = { stripe:'pay_card_desc', paypal:'pay_paypal_desc', mbway:'pay_mbway_desc' };
  const logos = {
    stripe: `<span class="pay-logo card-logos" aria-hidden="true"><svg viewBox="0 0 48 32"><rect x="1" y="1" width="46" height="30" rx="5"/><path d="M8 11h32M8 17h12"/></svg><span class="visa">VISA</span><span class="mc">●●</span></span>`,
    paypal: `<span class="pay-logo paypal-logo" aria-hidden="true"><svg viewBox="0 0 24 30"><path d="M5 28 9 3h7c5 0 7 2 6 6-1 5-5 7-10 7h-2l-2 12Z"/><path d="M9 22h5c4 0 6-2 7-6"/></svg><span>Pay<span>Pal</span></span></span>`,
    mbway: `<span class="pay-logo mbway-logo" aria-hidden="true"><svg viewBox="0 0 22 30"><rect x="2" y="1" width="18" height="28" rx="4"/><circle cx="11" cy="25" r="1"/><path d="m7 9 3 3 5-5M7 18h8"/></svg><span>MB<span>WAY</span></span></span>`,
  };
  return `<label class="method${idx===0?' active':''}${configured?' is-ready':''}">
    <input type="radio" name="pay" value="${m}"${idx===0?' checked':''}>
    <span class="m-radio"></span>
    ${logos[m]}
    <span class="m-body">
      <span class="m-name">${uiTxt(labels[m])}</span>
      <span class="m-sub">${uiTxt(descriptions[m])}</span>
      <span class="m-pending-tag">${configured ? uiTxt('pay_ready') : uiTxt('pay_preview')}</span>
    </span>
    <span class="method-chevron" aria-hidden="true">›</span>
  </label>`;
}

/* Validate the checkout form; attaches per-field errors and returns validity. */
function validateCheckout(form){
  const checks = [
    ['email', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'fld_email'],
    ['phone', v => v.trim().length >= 7, 'fld_required'],
    ['first', v => v.trim()!=='', 'fld_required'],
    ['last',  v => v.trim()!=='', 'fld_required'],
    ['country', v => v.trim()!=='', 'fld_required'],
    ['address', v => v.trim()!=='', 'fld_required'],
    ['zip',   v => v.trim()!=='', 'fld_required'],
    ['city',  v => v.trim()!=='', 'fld_required'],
  ];
  let ok = true;
  checks.forEach(([name, test, key])=>{
    const input = form.querySelector('[name="'+name+'"]');
    const errEl = form.querySelector('.ferr[data-for="'+name+'"]');
    const valid = input && test(input.value);
    if (input){ input.classList.toggle('invalid', !valid); input.setAttribute('aria-invalid', valid?'false':'true'); }
    if (errEl){ errEl.textContent = valid ? '' : uiTxt(key); if (valid) errEl.removeAttribute('role'); else errEl.setAttribute('role','alert'); }
    if (!valid) ok = false;
  });
  return ok;
}
function focusFirstError(form){
  const first = form.querySelector('.invalid, [aria-invalid="true"]');
  if (first){ first.focus(); }
}

/* Send the order to the backend (Google Apps Script) and fall back to WhatsApp. */
function placeOrder(btn){
  const cur = 'EUR'; // settlement currency
  const cart = getCart();
  const t = cartTotals(getAppliedCoupon());
  const method = (document.querySelector('input[name=pay]:checked')?.value) || 'pending';
  const mbwayPhone = document.getElementById('mbwayPhone')?.value || '';
  const coupon = getAppliedCoupon();
  const data = {
    name: document.getElementById('coFirst').value.trim() + ' ' + document.getElementById('coLast').value.trim(),
    email: document.getElementById('coEmail').value.trim(),
    phone: document.getElementById('coPhone').value.trim(),
    country: document.getElementById('coCountry').value.trim(),
    address: document.getElementById('coAddr').value.trim(),
    apt: document.getElementById('coApt').value.trim(),
    zip: document.getElementById('coZip').value.trim(),
    city: document.getElementById('coCity').value.trim(),
    district: document.getElementById('coDistrict').value.trim(),
    notes: document.getElementById('coNotes').value.trim(),
  };

  const items = cart.map(i => ({ title:i.title, opts:i.opts, optionNames:i.optionNames, qty:i.qty, priceEur:i.priceEur, compareEur:i.compareEur }));
  const lines = cart.map(i =>
    `• ${i.title} (${Object.values(i.opts).filter(Boolean).join(', ')}) ×${i.qty} — ${money(i.priceEur,'EUR')}${(i.compareEur&&i.compareEur>i.priceEur)?' (era '+money(i.compareEur,'EUR')+')':''}`
  ).join('\n');
  const addressLine = [data.address, data.apt].filter(Boolean).join(', ') + ', ' + data.zip + ' ' + data.city + (data.district?', '+data.district:'') + (data.country?', '+data.country:'');

  const text = `NOVO PEDIDO DE PAGAMENTO (Asheerah Hair)\n${lines}\n\nSubtotal original: ${money(t.subtotalOriginal,'EUR')}\nDesconto: −${money(t.totalDiscount,'EUR')}\nEnvio: ${money(t.shipping,'EUR')}\nTOTAL ESTIMADO: ${money(t.totalFinal,'EUR')}\nMétodo preferido: ${method}${mbwayPhone?'\nTelemóvel MB Way: '+mbwayPhone:''}\n\nCliente: ${data.name}\nEmail: ${data.email}\nTelefone: ${data.phone}\nMorada: ${addressLine}${data.notes?'\nNotas: '+data.notes:''}`;

  const payload = {
    type:'order',
    text,
    method, mbwayPhone,
    items,
    subtotalEur: t.subtotalOriginal,
    shippingEur: t.shipping,
    totalEur: t.totalFinal,
    totalDiscountEur: t.totalDiscount,
    coupon: coupon ? coupon.code : null,
    currency:'EUR',
    customer: data,
    // Values below are what the browser computed. The backend MUST re-validate
    // prices server-side before treating the order as paid. This frontend value
    // is informational only and never authoritative.
    clientComputed:{ subtotalOriginalEur:t.subtotalOriginal, totalDiscountEur:t.totalDiscount, totalFinalEur:t.totalFinal },
  };

  const note = document.getElementById('orderNote');
  const fallback = () => {
    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`,'_blank');
    if (note){ note.textContent = uiTxt('order_saved_confirm'); note.className='order-note ok'; }
    if (btn){ btn.textContent = uiTxt('place_order'); btn.disabled = false; }
    checkoutSubmitting = false;
  };

  if (CONFIG.backendURL){
    fetch(CONFIG.backendURL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(payload) })
      .then(r=>r.json())
      .then(d=>{
        if (note){ note.textContent = d && d.ok ? uiTxt('order_saved_confirm') : uiTxt('order_saved_confirm'); note.className='order-note ok'; }
        // Order recorded server-side — clear the cart and show confirmation.
        clearCart();
        showOrderConfirmation(payload, text);
      })
      .catch(fallback);
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
