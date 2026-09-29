/**
 * Asheerah Hair — Google Apps Script backend
 * Deploy as a Web App (execute as OWNER, access = Anyone).
 *
 * Features:
 *  - Orders land in the "Orders" sheet with structured columns + computed Profit.
 *  - "Costs" holds the supplier cost model (editable — update supplier prices here).
 *  - "Monthly Report" tab + charts summarises revenue, COGS, fees, profit by month.
 *
 * Run buildReport() once after orders exist to (re)generate the report tab + charts.
 */

var OWNER_EMAIL = 'asheerahhair@gmail.com';   // who receives the order email
var SHEET_NAME = 'Orders';
var COSTS_NAME = 'Costs';
var REPORT_NAME = 'Monthly Report';
var SS_ID_PROP = 'ASH_SS_ID';
var ORDERS_HEADER = ['Timestamp','Order','Customer','Email','Phone','Method','Items','Subtotal €','Shipping €','Total €','COGS €','Fee €','Profit €'];
var MSG_HEADER = ['Timestamp','Name','Email','Phone','Comment'];
var CHAT_HEADER = ['Timestamp','Session','Page','Question','Route','Tier','Reason','Matched Q&A','Transcript','Status','Owner answer','Add to KB','Reviewed'];

// ---- Supplier cost model (USD), from the pricing Excel's Supplier Pricelists tab.
// Keys match the site's option strings. Converted to EUR via usd_eur. Editable in the "Costs" tab.
var COST = {
  "usd_eur": 0.92,
  "wig_hd": {"13x4/6x6|180%":{"10":88,"12":97,"14":106,"16":115,"18":122,"20":138,"22":158,"24":182,"26":200,"28":235,"30":259,"32":298},"13x4/6x6|200%":{"10":95,"12":101,"14":115,"16":126,"18":149,"20":165,"22":185,"24":215,"26":233,"28":275,"30":303,"32":339},"13x4/6x6|250%":{"10":108,"12":115,"14":135,"16":160,"18":181,"20":185,"22":219,"24":246,"26":289,"28":348,"30":387,"32":457},"13x4/6x6|300%":{"16":167,"18":185,"20":220,"22":278,"24":314,"26":384,"28":470,"30":540,"32":658},"13x6/7x7|180%":{"10":102,"12":111,"14":120,"16":132,"18":141,"20":157,"22":177,"24":202,"26":222,"28":257,"30":277,"32":312},"13x6/7x7|200%":{"10":112,"12":119,"14":132,"16":145,"18":169,"20":187,"22":209,"24":232,"26":257,"28":297,"30":326,"32":353},"13x6/7x7|250%":{"10":122,"12":129,"14":149,"16":174,"18":194,"20":199,"22":233,"24":262,"26":305,"28":364,"30":403,"32":473},"13x6/7x7|300%":{"16":181,"18":212,"20":237,"22":308,"24":344,"26":416,"28":504,"30":575,"32":694}},
  "wig_tr": {"6x6/13x4|180%":{"10":70,"12":80,"14":89,"16":98,"18":105,"20":122,"22":143,"24":167,"26":186,"28":222,"30":247,"32":287},"6x6/13x4|200%":{"10":77,"12":84,"14":98,"16":110,"18":133,"20":150,"22":171,"24":201,"26":220,"28":263,"30":292,"32":329},"6x6/13x4|250%":{"10":91,"12":98,"14":119,"16":145,"18":166,"20":171,"22":206,"24":234,"26":278,"28":338,"30":378,"32":450},"7x7/13x6/360|180%":{"10":77,"12":87,"14":96,"16":109,"18":118,"20":134,"22":155,"24":181,"26":201,"28":237,"30":258,"32":294},"7x7/13x6/360|200%":{"10":88,"12":95,"14":109,"16":122,"18":147,"20":165,"22":188,"24":212,"26":237,"28":279,"30":308,"32":336},"7x7/13x6/360|250%":{"10":98,"12":105,"14":126,"16":152,"18":173,"20":178,"22":213,"24":243,"26":287,"28":348,"30":387,"32":460}},
  "bundle": {"12":29,"14":33,"16":37,"18":44,"20":50,"22":57,"24":65,"26":76,"28":87,"30":98,"32":109,"34":124,"36":139},
  "crochet": {"10":28,"12":31,"14":36,"16":43,"18":51,"20":59,"22":69,"24":79,"26":91,"28":104,"30":119,"32":132,"34":152,"36":162,"38":187,"40":208}
};

// Payment fees (per method): fixed EUR + % of total
var FEES = {
  'stripe': { pct: 0.029, fixed: 0.30 },
  'paypal': { pct: 0.0349, fixed: 0.49 },
  'mbway':  { pct: 0.014,  fixed: 0.28 }
};

function doGet(e) {
  var sheet = getSheet_(SHEET_NAME, ORDERS_HEADER);
  var data = sheet.getDataRange().getValues();
  return json_({ ok: true, count: Math.max(0, data.length - 1), columns: data[0] || [] });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // Only the Cloudflare Worker may record Stripe events. It verifies Stripe's
    // signature, then HMAC-signs this exact payload for the Apps Script backend.
    if (body && typeof body.payload === 'string' && typeof body.signature === 'string') {
      var stripeEvent = verifyWorkerPayload_(body);
      if (!stripeEvent) return json_({ ok:false, error:'Unauthorized payment event' });
      return json_(processStripeWorkerPayload_(stripeEvent));
    }

    if (body.type === 'order') {
      var row = buildOrderRow_(body);
      getSheet_(SHEET_NAME, ORDERS_HEADER).appendRow(row);
      try {
        MailApp.sendEmail({
          to: OWNER_EMAIL,
          subject: 'New Asheerah Hair Order ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
          body: body.text || 'Order received.'
        });
      } catch (mailErr) { /* mail optional */ }
      return json_({ ok: true, saved: true, emailed: true, cogs: row[10], fee: row[11], profit: row[12] });
    }

    if (body.type === 'contact') {
      getSheet_('Messages', MSG_HEADER)
        .appendRow([new Date(), body.name||'', body.email||'', body.phone||'', body.comment||'']);
      return json_({ ok: true, saved: true });
    }

    if (body.type === 'subscribe') {
      var email = String(body.email||'').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json_({ ok:false, error:'Invalid email' });
      var nl = getSheet_('Subscribers', ['Timestamp','Email']);
      // dedupe by email
      var existing = nl.getDataRange().getValues();
      var dup = existing.some(function(r){ return String(r[1]).trim().toLowerCase() === email.toLowerCase(); });
      if (!dup) nl.appendRow([new Date(), email]);
      return json_({ ok: true, saved: true, new: !dup });
    }

    if (body.type === 'chat_log') {
      var sessionId = safeCell_(body.sessionId, 40);
      var question = safeCell_(body.question, 500);
      if (!sessionId || !question) return json_({ ok:false, error:'Missing chat reference or question' });

      var lock = LockService.getScriptLock();
      lock.waitLock(5000);
      try {
        getSheet_('Chatbot Log', CHAT_HEADER).appendRow([
          new Date(), sessionId, safeCell_(body.page, 180), question,
          safeCell_(body.route, 40), Number(body.tier)||'', safeCell_(body.reason, 80),
          safeCell_(body.matchedId, 30), safeCell_(body.transcript, 2500),
          'Needs review', '', '', ''
        ]);
      } finally {
        lock.releaseLock();
      }

      // One owner alert per website-chat session prevents a customer conversation
      // (or repeated button presses) from flooding the owner's inbox.
      var cache = CacheService.getScriptCache();
      var mailKey = 'chat-mail-' + digestKey_(sessionId);
      var alerted = cache.get(mailKey);
      if (!alerted) {
        cache.put(mailKey, '1', 21600);
        try {
          MailApp.sendEmail({
            to: OWNER_EMAIL,
            subject: 'Website chat needs your help — ' + sessionId,
            body: 'A website visitor reached a Tier ' + (Number(body.tier)||3) + ' handoff.\n\n' +
              'Question: ' + question + '\nPage: ' + safeCell_(body.page,180) + '\n\n' +
              safeCell_(body.transcript,2500) + '\n\nThe visitor was offered a WhatsApp button with this same reference.'
          });
        } catch (mailErr) { /* The sheet remains the source of truth. */ }
      }
      return json_({ ok:true, saved:true });
    }

    return json_({ ok: false, error: 'Unknown type' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Build one structured order row: Timestamp, Order, Customer, ..., Profit. */
function buildOrderRow_(body) {
  var totalEur = Number(body.totalEur) || 0;
  var subtotal = Number(body.subtotalEur) || 0;
  var shipping = Number(body.shippingEur) || 0;
  var cogs = cogsFor_(body.items);
  var fee = feeFor_(body.method, totalEur);
  var profit = totalEur - cogs - fee;
  var cust = body.customer || {};
  var orderNum = 'ASH-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  var itemText = (body.items||[]).map(function(it){
    return it.title + ' x' + it.qty + ' (' + Object.values(it.opts||{}).filter(Boolean).join(',') + ')';
  }).join(' | ');
  var couponCode = String(body.coupon||'').trim().toUpperCase();
  if (['ONIKA10','LILIAN10','TUCHA10','CASSIE10'].indexOf(couponCode) !== -1) {
    itemText = 'Ambassador coupon: ' + couponCode + (itemText ? ' | ' + itemText : '');
  }
  return [new Date(), orderNum, cust.name||'', cust.email||'', cust.phone||'', body.method||'',
          itemText, r2(subtotal), r2(shipping), r2(totalEur), r2(cogs), r2(fee), r2(profit)];
}

/** Compute Cost of Goods Sold (EUR) for a list of cart items. */
function cogsFor_(items) {
  if (!items || !items.length) return 0;
  var usd = 0;
  items.forEach(function(it){
    var title = (it.title||'').toLowerCase();
    var opts = it.opts || {};
    var qty = Number(it.qty) || 1;
    var len = String(opts.opt1||'');
    var usdPer = 0;

    if (title.indexOf('crochet') !== -1) {
      // crochet: base per 100g + 15 fee + (3 if curly) per 100g, × weight/100
      var base = COST.crochet[len] || 0;
      var w100 = weight100_(opts.opt2);
      var curly = /curly|pixie/.test(title) ? 3 : 0;
      usdPer = (base + 15 + curly) * w100;
    } else if (title.indexOf('bundle') !== -1 && title.indexOf('color') === -1) {
      // bundle: cost per 100g ×3 (300g set) + 9 if curly
      var b = COST.bundle[len] || 0;
      var bc = /curly|4b|4c|deep/.test(title) ? 9 : 0;
      usdPer = b * 3 + bc;
    } else if (title.indexOf('wig') !== -1 && title.indexOf('color') === -1) {
      // wig: look up by lace type/size group + density
      usdPer = wigCost_(opts, len);
    }
    // custom color / colored crochet add-on services: COGS 0 (labour only)
    usd += usdPer * qty;
  });
  return r2(usd * (COST.usd_eur || 0.92));
}

function wigCost_(opts, len) {
  var lace = String(opts.opt2||'').toLowerCase();
  var density = String(opts.opt3||'');
  var isHD = lace.indexOf('hd') !== -1;
  var isTransparent = lace.indexOf('transparent') !== -1;
  var group = null;
  if (/6x6|13x4/.test(lace)) group = isHD ? '13x4/6x6' : '6x6/13x4';
  else if (/7x7|13x6|360/.test(lace)) group = isHD ? '13x6/7x7' : '7x7/13x6/360';
  var table = isHD ? COST.wig_hd : COST.wig_tr;
  if (!group) return 0;
  var key = group + '|' + density;
  var row = table[key];
  return (row && row[len]) ? row[len] : 0;
}

function weight100_(opt2) {
  var s = String(opt2||'');
  var m = s.match(/(\d+)g/);
  if (!m) return 1;
  return Number(m[1]) / 100;
}

function feeFor_(method, totalEur) {
  if (method === 'pending') return 0;
  var f = FEES[method] || FEES.mbway;
  return r2(totalEur * f.pct + f.fixed);
}

function r2(x) { return Math.round(Number(x) * 100) / 100; }

function safeCell_(value, maxLen) {
  var text = String(value||'').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0,maxLen);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function digestKey_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value));
  return Utilities.base64EncodeWebSafe(bytes).slice(0,24);
}

/**
 * Build (or rebuild) the Monthly Report tab with summary tables + charts.
 * Run manually from the editor after orders exist. Safe to re-run.
 */
function buildReport() {
  var ss = getSpreadsheet_();
  var report = ss.getSheetByName(REPORT_NAME);
  if (!report) report = ss.insertSheet(REPORT_NAME);
  report.clear();

  var orders = getSheet_(SHEET_NAME, null).getDataRange().getValues();
  // header + rows
  var header = orders[0];
  var data = orders.slice(1).filter(function(r){ return r[0]; });

  // Aggregate by YYYY-MM
  var monthly = {};
  data.forEach(function(r){
    var d = new Date(r[0]);
    var key = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
    if (!monthly[key]) monthly[key] = { orders:0, revenue:0, cogs:0, fee:0, profit:0, methods:{} };
    var m = monthly[key];
    m.orders++;
    m.revenue += num(r[9]);   // Total €
    m.cogs += num(r[10]);
    m.fee += num(r[11]);
    m.profit += num(r[12]);
    var meth = r[5] || '?';
    m.methods[meth] = (m.methods[meth]||0) + num(r[9]);
  });

  var months = Object.keys(monthly).sort();
  // Summary table
  report.getRange(1,1).setValue('MONTHLY REPORT (EUR)').setFontWeight('bold').setFontSize(14);
  report.getRange(2,1).setValue('Generated ' + new Date()).setFontStyle('italic').setFontColor('#5A5244');
  var hdrRow = 4;
  var cols = ['Month','Orders','Revenue €','COGS €','Fees €','Net Profit €','Avg Order €'];
  cols.forEach(function(c,i){ report.getRange(hdrRow, i+1).setValue(c).setFontWeight('bold').setBackground('#C9A24B').setFontColor('#FFFFFF'); });
  var r0 = hdrRow + 1;
  months.forEach(function(mo, i){
    var m = monthly[mo];
    report.getRange(r0+i,1).setValue(mo);
    report.getRange(r0+i,2).setValue(m.orders);
    report.getRange(r0+i,3).setValue(r2(m.revenue));
    report.getRange(r0+i,4).setValue(r2(m.cogs));
    report.getRange(r0+i,5).setValue(r2(m.fee));
    report.getRange(r0+i,6).setValue(r2(m.profit));
    report.getRange(r0+i,7).setValue(r0 && m.orders ? r2(m.revenue/m.orders) : 0);
  });
  var totalRow = r0 + months.length;
  report.getRange(totalRow,1).setValue('TOTAL').setFontWeight('bold');
  [2,3,4,5,6,7].forEach(function(c){
    report.getRange(totalRow,c).setFormula('=SUM(' + colLetter(c) + (r0) + ':' + colLetter(c) + (totalRow-1) + ')').setFontWeight('bold');
  });

  // ---- Charts ----
  var revRange = report.getRange(r0,1,months.length,6);
  var chart1 = report.newChart().asColumnChart()
    .addRange(report.getRange(r0,1,months.length,1))   // month labels
    .addRange(report.getRange(r0,3,months.length,1))   // revenue
    .addRange(report.getRange(r0,4,months.length,1))   // cogs
    .addRange(report.getRange(r0,6,months.length,1))   // profit
    .setTitle('Revenue, COGS & Profit by Month')
    .setPosition(6, 9, 0, 0)
    .setOption('legend', {position:'bottom'})
    .build();
  report.insertChart(chart1);

  var chart2 = report.newChart().asPieChart()
    .addRange(report.getRange(totalRow,3))   // total revenue (single cell) - use method breakdown below instead
    .setTitle('Payment method share')
    .setPosition(24, 9, 0, 0)
    .build();

  // Method breakdown table
  var mh = totalRow + 3;
  report.getRange(mh,1).setValue('Payment method share (Revenue €)').setFontWeight('bold');
  var methods = {};
  months.forEach(function(mo){ Object.keys(monthly[mo].methods).forEach(function(k){ methods[k]=(methods[k]||0)+monthly[mo].methods[k]; }); });
  var mr = mh + 1;
  Object.keys(methods).forEach(function(k,i){
    report.getRange(mr+i,1).setValue(k);
    report.getRange(mr+i,2).setValue(r2(methods[k]));
  });
  if (Object.keys(methods).length) {
    var pc = report.newChart().asPieChart()
      .addRange(report.getRange(mr,1,Object.keys(methods).length,2))
      .setTitle('Payment method share')
      .setPosition(mr, 4, 0, 0)
      .build();
    report.insertChart(pc);
  }
  SpreadsheetApp.flush();
  return 'Report built for ' + months.length + ' month(s)';
}

function num(v){ return Number(v) || 0; }
function colLetter(c){ var s=''; while(c>0){ var m=(c-1)%26; s=String.fromCharCode(65+m)+s; c=Math.floor((c-1)/26);} return s; }

/** Returns the canonical spreadsheet, creating + remembering it once. */
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SS_ID_PROP);
  if (id) { var ex = SpreadsheetApp.openById(id); if (ex) return ex; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.create('Asheerah Hair Orders');
  props.setProperty(SS_ID_PROP, ss.getId());
  return ss;
}

/** Returns (creating if needed) a sheet with the given header row. header=null → just return existing. */
function getSheet_(name, header) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (header) {
      sheet.appendRow(header);
      sheet.getRange(1,1,1,header.length).setFontWeight('bold').setBackground('#C9A24B').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function verifyWorkerPayload_(wrapper) {
  try {
    var secret = PropertiesService.getScriptProperties().getProperty('WORKER_GAS_SECRET');
    if (!secret || !wrapper || typeof wrapper.payload !== 'string' || !/^[a-f0-9]{64}$/i.test(wrapper.signature)) return null;
    var bytes = Utilities.computeHmacSha256Signature(wrapper.payload, secret);
    var expected = bytes.map(function(b){ return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
    if (expected.length !== wrapper.signature.length) return null;
    var diff = 0;
    for (var i=0; i<expected.length; i++) diff |= expected.charCodeAt(i) ^ wrapper.signature.toLowerCase().charCodeAt(i);
    if (diff !== 0) return null;
    return JSON.parse(wrapper.payload);
  } catch (err) { return null; }
}

function processStripeWorkerPayload_(payload) {
  if (!payload || !payload.action) return { ok:false, error:'Invalid worker action' };
  if (payload.action === 'stripe_pending') return recordStripePending_(payload);
  if (payload.action === 'stripe_session_created') return recordStripeSession_(payload);
  if (payload.action === 'stripe_checkout_failed') return recordStripeCheckoutFailure_(payload);
  if (payload.action === 'stripe_event') return recordStripeEvent_(payload);
  return { ok:false, error:'Unsupported worker action' };
}

function stripePaymentsSheet_() {
  return getSheet_('Stripe Payments', ['Event ID','Order ID','Status','Stripe Session ID','Payment Intent ID','Customer Email','Customer Phone','Ship To','Shipping Address','Items','Amount €','Currency','Updated At']);
}
function stripeOrderRow_(rows, orderId) {
  for (var i=1; i<rows.length; i++) if (String(rows[i][1]) === String(orderId)) return i+1;
  return 0;
}
function recordStripePending_(payload) {
  var c=payload.customer||{};
  var orderId=String(payload.orderId||'');
  var expected=Number(payload.expectedTotalCents), subtotal=Number(payload.subtotalCents), shipping=Number(payload.shippingCents);
  if (!/^[a-f0-9-]{36}$/i.test(orderId) || payload.currency!=='EUR' || !Number.isSafeInteger(expected) || expected<=0 || expected!==subtotal+shipping || !c.email || !c.name) return {ok:false,error:'Invalid pending order'};
  var lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sheet=stripePaymentsSheet_(), rows=sheet.getDataRange().getValues(), found=stripeOrderRow_(rows,orderId);
    if (found) return Math.round(Number(rows[found-1][10])*100)===expected ? {ok:true,duplicate:true} : {ok:false,error:'Order already exists with different amount'};
    var address=[c.address,c.city,c.postalCode,c.country].filter(Boolean).join(', ');
    sheet.appendRow(['pending:'+orderId,orderId,'pending','','',safeCell_(c.email,254),safeCell_(c.phone,40),safeCell_(c.name,120),safeCell_(address,500),safeCell_(payload.itemsSummary,450),expected/100,'EUR',new Date()]);
    return {ok:true,saved:true};
  } finally { lock.releaseLock(); }
}
function recordStripeSession_(payload) {
  var orderId=String(payload.orderId||''), sessionId=String(payload.sessionId||'');
  if (!orderId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return {ok:false,error:'Invalid Checkout Session'};
  var lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sheet=stripePaymentsSheet_(), rows=sheet.getDataRange().getValues(), row=stripeOrderRow_(rows,orderId);
    if (!row) return {ok:false,error:'Pending order not found'};
    if (rows[row-1][2]==='paid') return {ok:false,error:'Order already paid'};
    sheet.getRange(row,4).setValue(sessionId); sheet.getRange(row,13).setValue(new Date());
    return {ok:true,updated:true};
  } finally { lock.releaseLock(); }
}
function recordStripeCheckoutFailure_(payload) {
  var orderId=String(payload.orderId||'');
  if (!orderId) return {ok:false,error:'Invalid order'};
  var lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sheet=stripePaymentsSheet_(), rows=sheet.getDataRange().getValues(), row=stripeOrderRow_(rows,orderId);
    if (!row) return {ok:true,missing:true};
    if (rows[row-1][2]!=='paid') { sheet.getRange(row,3).setValue('checkout_failed'); sheet.getRange(row,13).setValue(new Date()); }
    return {ok:true,updated:true};
  } finally { lock.releaseLock(); }
}

/** Persist only Worker-authenticated Stripe events; browser redirects never call this. */
function recordStripeEvent_(event) {
  var session = event && event.session;
  var allowed = ['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'];
  if (!event || !/^evt_[A-Za-z0-9_]+$/.test(String(event.eventId||'')) || allowed.indexOf(event.eventType) === -1 || !session || !session.id) return {ok:false,error:'Invalid payment event'};
  var orderId=String(session.client_reference_id||''), metadataOrder=String(session.metadata&&session.metadata.order_id||'');
  var expected=Number(session.metadata&&session.metadata.expected_total_cents), actual=Number(session.amount_total);
  if (!orderId || orderId!==metadataOrder || !Number.isSafeInteger(expected) || expected<=0 || actual!==expected || String(session.currency).toLowerCase()!=='eur') return {ok:false,error:'Payment amount verification failed'};
  var status='pending';
  if ((event.eventType==='checkout.session.completed'||event.eventType==='checkout.session.async_payment_succeeded') && session.payment_status==='paid') status='paid';
  else if (event.eventType==='checkout.session.expired') status='expired';
  else if (event.eventType==='checkout.session.async_payment_failed') status='failed';
  var lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sheet=stripePaymentsSheet_(), rows=sheet.getDataRange().getValues(), row=stripeOrderRow_(rows,orderId);
    if (!row) return {ok:false,error:'Pending order not found'};
    var current=rows[row-1], seen=String(current[0]||'').split(',');
    if (seen.indexOf(event.eventId)!==-1) return {ok:true,duplicate:true,status:current[2]};
    if (Math.round(Number(current[10])*100)!==expected || (current[3] && String(current[3])!==String(session.id))) return {ok:false,error:'Pending order/session mismatch'};
    if (current[2]==='paid') status='paid';
    var ship=session.shipping_details||{}, shipAddr=ship.address||{};
    var shipAddressText=[shipAddr.line1,shipAddr.line2,shipAddr.city,shipAddr.state,shipAddr.postal_code,shipAddr.country].filter(Boolean).join(', ');
    var newIds=seen.filter(function(id){return id && id.indexOf('pending:')!==0;}); newIds.push(event.eventId); newIds=newIds.slice(-20);
    var values=[newIds.join(','),orderId,status,session.id,session.payment_intent||current[4],
      (session.customer_details&&session.customer_details.email)||session.customer_email||current[5],
      (session.customer_details&&session.customer_details.phone)||current[6],ship.name||current[7],shipAddressText||current[8],
      (session.metadata&&session.metadata.items_summary)||current[9],expected/100,'EUR',new Date()];
    values=values.map(function(v,i){return i===12?v:safeCell_(v, i===8?500: i===9?450: i===5?254:120);});
    for (var col=1;col<=values.length;col++) sheet.getRange(row,col).setValue(values[col-1]);
    if (status==='paid' && current[2]!=='paid') {
      try { MailApp.sendEmail({to:OWNER_EMAIL,subject:'Stripe payment received — '+orderId,body:'A Stripe Checkout payment was confirmed by webhook.\nOrder: '+orderId+'\nAmount: €'+r2(expected/100)+'\nItems: '+safeCell_(session.metadata&&session.metadata.items_summary,450)}); } catch (mailErr) {}
    }
    return {ok:true,recorded:true,status:status};
  } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run once in the editor to authorize MailApp. */
function authMail() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(),
    'Asheerah Hair backend authorized',
    'MailApp is now authorized for the Asheerah Hair order backend.');
}
