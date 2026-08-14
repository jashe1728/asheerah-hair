/* Asheerah Hair — shared app logic: catalog, cart, currency, helpers */
'use strict';

// ---------- Config (fill in real values when accounts are ready) ----------
const CONFIG = {
  currency: 'EUR',                    // base currency (authoritative)
  rates: { EUR: 1, USD: 1.08, GBP: 0.85 },  // approx display rates; update as needed
  shipping: 30,                        // EUR fixed shipping (from Excel Settings)
  whatsapp: '351914522508',           // friend's WhatsApp number
  email: 'asheerahhair@gmail.com',
  // Google Apps Script backend (empty = orders go to WhatsApp/email fallback)
  backendURL: '',
  // Payment publishable keys (fill after accounts are created)
  stripePublishable: '',
  paypalClientId: '',
};

const CURRENCIES = {
  EUR: { symbol: '€', label: 'EUR' },
  USD: { symbol: '$', label: 'USD' },
  GBP: { symbol: '£', label: 'GBP' },
};

// ---------- Catalog ----------
let CATALOG = null;
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

// ---------- Currency ----------
function money(priceEur, cur){
  const rate = CONFIG.rates[cur] || 1;
  const sym = (CURRENCIES[cur] || CURRENCIES.EUR).symbol;
  const v = (priceEur * rate);
  // round to nice .99-ish for display, keep cents otherwise
  return sym + v.toFixed(2).replace(/\.00$/,'');
}

// ---------- Cart (localStorage) ----------
function getCart(){ try { return JSON.parse(localStorage.getItem('ash_cart')||'[]'); } catch(e){ return []; } }
function saveCart(c){ localStorage.setItem('ash_cart', JSON.stringify(c)); }
function cartCount(){ return getCart().reduce((n,i)=>n+i.qty,0); }
function cartTotalEur(){ return getCart().reduce((t,i)=>t + (i.priceEur*i.qty),0); }

function addToCart(handle, opts, qty){
  const p = findProduct(handle); if (!p) return;
  const cart = getCart();
  const key = handle + '|' + JSON.stringify(opts);
  const existing = cart.find(i => i.key === key);
  if (existing) existing.qty += qty;
  else {
    // resolve price from the matched variant
    const v = matchVariant(p, opts);
    cart.push({ key, handle, title:p.title, image:p.images[0], opts,
                qty, priceEur: v ? v.price_eur : 0, currency:CONFIG.currency });
  }
  saveCart(cart);
  updateCartUI();
}

function matchVariant(p, opts){
  if (!p.variants) return null;
  // opts = {opt1, opt2, opt3} — find first exact match else first priced
  const exact = p.variants.find(v =>
    String(v.opt1||'')===String(opts.opt1||'') &&
    String(v.opt2||'')===String(opts.opt2||'') &&
    String(v.opt3||'')===String(opts.opt3||''));
  if (exact) return exact;
  return p.variants.find(v => v.price_eur) || p.variants[0] || null;
}

function updateCartUI(){
  document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = cartCount());
  renderCartDrawer();
}

function renderCartDrawer(){
  const el = document.getElementById('cartItems');
  if (!el) return;
  const cart = getCart();
  if (!cart.length){
    el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem">Your cart is empty.</p>';
    return;
  }
  const cur = localStorage.getItem('ash_cur') || 'EUR';
  el.innerHTML = cart.map(i => `
    <div class="cart-item">
      <img src="${i.image}" alt="${i.title}">
      <div class="ci-info">
        <h4>${i.title}</h4>
        <div class="meta">${Object.values(i.opts).filter(Boolean).join(' / ')}</div>
        <div class="qty" style="margin:.4rem 0 0">
          <button onclick="changeQty('${i.key}',-1)">−</button><span>${i.qty}</span><button onclick="changeQty('${i.key}',1)">+</button>
        </div>
      </div>
      <div class="ci-price">${money(i.priceEur*i.qty, cur)}</div>
      <button class="remove" onclick="changeQty('${i.key}',-999)" aria-label="Remove">×</button>
    </div>`).join('');
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

// ---------- Nav ----------
function initNav(){
  const burger = document.querySelector('.nav-burger');
  const links = document.querySelector('.nav-links');
  if (burger && links){
    burger.addEventListener('click', ()=> links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', ()=> links.classList.remove('open')));
  }
}

// ---------- Page init ----------
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  updateCartUI();
  const cur = localStorage.getItem('ash_cur') || 'EUR';
  document.querySelectorAll('[data-currency]').forEach(b => {
    b.classList.toggle('active', b.dataset.currency===cur);
    b.textContent = (CURRENCIES[b.dataset.currency]||{}).symbol;
  });
  try { await loadCatalog(); } catch(e) { console.warn('catalog load failed', e); }
  const page = document.body.dataset.page;
  if (page === 'shop') renderShop();
  if (page === 'product') renderProduct();
  if (page === 'cart') renderCartPage();
  if (page === 'checkout') renderCheckoutPage();
});

// ---------- Shop grid ----------
function renderShop(){
  const grid = document.getElementById('shopGrid'); if (!grid) return;
  const cur = localStorage.getItem('ash_cur') || 'EUR';
  const cat = new URLSearchParams(location.search).get('cat');
  let list = CATALOG.products;
  if (cat) list = list.filter(p => p.category === cat);
  grid.innerHTML = list.map(p => {
    const min = Math.min(...p.variants.map(v=>v.price_eur).filter(Boolean));
    const was = min ? min + 40 : null;
    return `<a class="product-card" href="product.html?h=${p.handle}">
      <div class="img"><img src="${p.images[0]||''}" alt="${p.title}" loading="lazy"></div>
      <div class="info">
        <h3>${p.title}</h3>
        <div class="price">${was?`<s>${money(was,cur)}</s>`:''}${money(min,cur)}</div>
      </div>
    </a>`;
  }).join('');
}

// ---------- Product page ----------
function renderProduct(){
  const handle = new URLSearchParams(location.search).get('h');
  const p = findProduct(handle);
  const root = document.getElementById('productRoot'); if (!root) return;
  if (!p){ root.innerHTML = '<p style="text-align:center">Product not found.</p>'; return; }
  const cur = localStorage.getItem('ash_cur') || 'EUR';
  const opts = p.options || [];
  let sel = {}; opts.forEach(o => sel[o.name] = o.values[0]);
  // store selection globally for re-render
  window._sel = sel; window._product = p;

  // variant resolution
  const variantFor = () => {
    const o1=sel[opts[0]?.name||'']||'', o2=sel[opts[1]?.name||'']||'', o3=sel[opts[2]?.name||'']||'';
    const v = p.variants.find(x=>String(x.opt1||'')===String(o1)&&String(x.opt2||'')===String(o2)&&String(x.opt3||'')===String(o3));
    return v || p.variants.find(v=>v.price_eur) || null;
  };

  const render = () => {
    const v = variantFor();
    const price = v ? v.price_eur : 0;
    const was = v && v.compare_eur ? v.compare_eur : null;
    root.innerHTML = `
      <div class="pd">
        <div class="gallery">
          <div class="main-img"><img id="mainImg" src="${p.images[0]||''}" alt="${p.title}"></div>
          <div class="thumbs">${p.images.slice(0,6).map((im,i)=>`<img src="${im}" class="${i===0?'active':''}" data-src="${im}" onclick="setMain('${im}',this)">`).join('')}</div>
        </div>
        <div class="buy">
          <h1>${p.title}</h1>
          <div class="price-row"><span class="now">${money(price,cur)}</span>${was?`<s>${money(was,cur)}</s>`:''}</div>
          ${opts.map((o,i)=>`
            <div class="option-group">
              <label>${o.name}</label>
              <div class="pills">
                ${o.values.map(vl=>`<button class="pill ${sel[o.name]===vl?'active':''}" onclick="selectOpt(${i},'${vl.replace(/'/g,"\\'")}')">${vl}</button>`).join('')}
              </div>
            </div>`).join('')}
          <div class="qty"><button onclick="qtyChange(-1)">−</button><span id="qtyVal">1</span><button onclick="qtyChange(1)">+</button></div>
          <button class="add-btn" onclick="addCurrentToCart()">Add to cart</button>
          <div class="desc"><h3 style="margin-bottom:.4rem">Description</h3><p>${p.description}</p></div>
        </div>
      </div>`;
  };
  render();
  window.qtyVal = 1;
  window.selectOpt = (i,val) => {
    const o = opts[i]; _sel[o.name]=val;
    document.querySelectorAll('.pills').forEach((pillbox,pi)=>{
      if(pi===i) pillbox.querySelectorAll('.pill').forEach(b=>b.classList.toggle('active', b.textContent===val));
    });
    render(); // refresh price based on selection
  };
  window.qtyChange = d => { window.qtyVal = Math.max(1, (window.qtyVal||1)+d); const e=document.getElementById('qtyVal'); if(e)e.textContent=window.qtyVal; };
  window.setMain = (src,el) => {
    document.getElementById('mainImg').src = src;
    document.querySelectorAll('.thumbs img').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
  };
  window.addCurrentToCart = () => {
    const optsForCart = { opt1: sel[opts[0]?.name||'']||'', opt2: sel[opts[1]?.name||'']||'', opt3: sel[opts[2]?.name||'']||'' };
    addToCart(handle, optsForCart, window.qtyVal||1);
    alert('Added to cart ✓');
  };
}

// ---------- Cart page ----------
function renderCartPage(){
  const root = document.getElementById('cartRoot'); if (!root) return;
  const cur = localStorage.getItem('ash_cur') || 'EUR';
  const cart = getCart();
  root.innerHTML = `
    <div id="cartItems"></div>
    <div class="summary" style="max-width:420px;margin:0 auto">
      <div class="row"><span>Subtotal</span><span>${money(cartTotalEur(),cur)}</span></div>
      <div class="row"><span>Shipping</span><span>${money(CONFIG.shipping,cur)}</span></div>
      <div class="row total"><span>Total</span><span>${money(cartTotalEur()+CONFIG.shipping,cur)}</span></div>
      <a href="checkout.html" class="btn btn-gold" style="width:100%;text-align:center;margin-top:1rem">Checkout</a>
    </div>`;
  renderCartDrawer();
}

// ---------- Checkout ----------
function renderCheckoutPage(){
  const root = document.getElementById('checkoutRoot'); if (!root) return;
  const cur = localStorage.getItem('ash_cur') || 'EUR';
  const cart = getCart();
  const total = cartTotalEur() + CONFIG.shipping;
  root.innerHTML = `
    <div class="summary" style="max-width:520px;margin:0 auto">
      <h2 style="text-align:center;margin-bottom:1rem">Order summary</h2>
      <div class="row"><span>Items (${cartCount()})</span><span>${money(cartTotalEur(),cur)}</span></div>
      <div class="row"><span>Shipping</span><span>${money(CONFIG.shipping,cur)}</span></div>
      <div class="row total"><span>Total</span><span>${money(total,cur)}</span></div>
      <div class="methods" id="payMethods">
        ${['stripe','paypal','mbway'].map(m=>`
          <label class="method">
            <input type="radio" name="pay" value="${m}">
            <div><div class="m-name">${m==='stripe'?'Card (Stripe)':m==='paypal'?'PayPal':'MB Way'}</div>
            <div class="m-sub">${m==='mbway'?'Pay by phone number in the MB Way app':''}</div></div>
          </label>`).join('')}
      </div>
      <div id="payArea" style="margin-top:1rem"></div>
      <button class="btn btn-gold" style="width:100%;margin-top:1rem" onclick="placeOrder()">Place order</button>
      <p id="orderNote" style="color:var(--muted);font-size:.85rem;text-align:center;margin-top:1rem"></p>
    </div>`;

  // method toggle
  document.querySelectorAll('input[name=pay]').forEach(r=>{
    r.addEventListener('change', ()=>{
      document.querySelectorAll('.method').forEach(m=>m.classList.remove('active'));
      r.closest('.method').classList.add('active');
      const pa = document.getElementById('payArea');
      if (r.value==='stripe') pa.innerHTML = CONFIG.stripePublishable
        ? '<p style="color:var(--muted)">Card payment via Stripe (configured).</p>'
        : '<p style="color:var(--gold-d)">Stripe is being configured — order will be confirmed by email/WhatsApp for now.</p>';
      if (r.value==='paypal') pa.innerHTML = CONFIG.paypalClientId
        ? '<p style="color:var(--muted)">PayPal payment (configured).</p>'
        : '<p style="color:var(--gold-d)">PayPal is being configured — order will be confirmed by email/WhatsApp for now.</p>';
      if (r.value==='mbway') pa.innerHTML = `
        <label>MB Way phone number</label>
        <input type="tel" id="mbwayPhone" placeholder="+351 9xx xxx xxx" style="margin-top:.4rem">`;
    });
  });

  window.placeOrder = () => {
    const method = document.querySelector('input[name=pay]:checked')?.value || 'mbway';
    let extra = '';
    if (method==='mbway') extra = `\nMB Way phone: ${document.getElementById('mbwayPhone')?.value||''}`;
    const lines = cart.map(i=>`• ${i.title} (${Object.values(i.opts).filter(Boolean).join(', ')}) ×${i.qty} — ${money(i.priceEur*i.qty,'EUR')}`).join('\n');
    const text = `NEW ORDER (Asheerah Hair)\n${lines}\n\nShipping: ${money(CONFIG.shipping,'EUR')}\nTOTAL: ${money(total,'EUR')}\nPayment: ${method}${extra}\n\nName/address to confirm on WhatsApp.`;
    // Try backend, fall back to WhatsApp
    const fallback = () => { window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`,'_blank'); };
    if (CONFIG.backendURL){
      fetch(CONFIG.backendURL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({type:'order', text}) })
        .then(r=>r.json()).then(d=>{
          document.getElementById('orderNote').textContent = d.ok
            ? 'Order received! Confirmation on the way.'
            : 'Order recorded. Confirming shortly.';
          clearCart();
        }).catch(fallback);
    } else fallback();
  };
}

// ---------- Expose for inline handlers ----------
window.changeQty = changeQty;
