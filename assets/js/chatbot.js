/* Asheerah Hair — rule-based FAQ chatbot (FAQ first; AI upgrade later) */
'use strict';

// Knowledge base: keyword -> answer. Extracted from the live site's FAQ + policies.
const KB = [
  { keys:['what hair','type of hair','sell','products','offer'], a:"We offer premium 100% virgin human hair in three lines: Luxury Wigs, Luxury Bundles (300g/3-piece sets), and Crochet Human Hair — in Straight, Body Wave, Deep Wave, Loose Wave, Water Wave, and Burmese Curly textures." },
  { keys:['100%','human hair','virgin','real hair','authentic'], a:"Yes — all our products are 100% virgin human hair, chosen for softness, natural look, and long-lasting wear." },
  { keys:['dye','color','colour','heat','style','curl','straighten','bleach'], a:"Yes, most of our human hair can be coloured, curled, straightened, and heat-styled. We recommend using heat protectants and proper care products to keep the quality." },
  { keys:['ship','delivery','deliver','how long','track','deliver time'], a:"Shipping varies by location. We ship to Europe, North America, South America, and Africa. Delivery: Europe 3–7 business days, Americas 5–10, Africa 5–12 (average 4–15 business days). You get tracking by email once it's shipped." },
  { keys:['international','worldwide','countries','portugal','angola','mozambique','brazil','usa','uk','france','spain'], a:"Yes, we ship worldwide. We deliver to Portugal, Spain, France, Belgium, Germany, Netherlands, Luxembourg, Italy, UK, Switzerland, US, Canada, Angola, Mozambique, Cape Verde, Guinea-Bissau, São Tomé & Príncipe, Brazil, Senegal, Ivory Coast, and South Africa." },
  { keys:['cancel','change order'], a:"Orders can only be changed or cancelled before they are processed and shipped. Once processing begins, cancellations are not possible." },
  { keys:['return','refund','money back'], a:"Because of the nature of our products and our dropshipping model, all sales are final. We only provide replacements for items that arrive damaged, defective, or incorrect." },
  { keys:['damaged','defective','incorrect','wrong item','broken'], a:"Contact us within 7 days of delivery (48h per our shipping policy) with your order number and clear photos of the item. Once approved, we arrange a replacement at no cost." },
  { keys:['texture','choose','which','recommend','best'], a:"We offer Straight, Body Wave, Deep Wave, Water Wave, Loose Wave, and Burmese Curly. Use our Shop by Texture section, or message us on WhatsApp — we'll help you pick for your style." },
  { keys:['contact','email','reach','talk','help','support'], a:"Email asheerahhair@gmail.com, WhatsApp +351 914 522 508, Instagram @asheerah_hair, or TikTok @asheerahhair. We're happy to help!" },
  { keys:['length','long','inches'], a:"Wigs come in 10–32 inches, bundles in 12–28 inches, and crochet in 16–26 inches. Pick the length on each product page." },
  { keys:['lace','density','hd','transparent'], a:"Wigs offer 6x6, 7x7, 13x4, and 13x6 lace in HD or Transparent, and densities of 180%, 200%, and 250%." },
  { keys:['bundle','what is bundle','300g'], a:"Our bundles are 300g sets (3 bundles of ~100g each), ideal for custom wig making, sew-ins, and protective styling." },
  { keys:['crochet'], a:"Our crochet human hair comes in Water Curly, Burmese Curly, Water Wave, and Pixie Curly, in 16–26 inches and 100g/200g/300g weights." },
  { keys:['custom color','custom colour','color code'], a:"Need a custom color? Send your inspiration photo on WhatsApp (+351 914 522 508) for a custom quote, or add the Custom Hair Color service to your order." },
  { keys:['price','cost','how much','expensive'], a:"Prices are shown on each product page in your chosen currency. All prices end in .99 and are rounded to protect quality." },
  { keys:['customs','tax','vat','import','duty'], a:"Customs duties, import taxes, VAT, and any destination fees are the customer's responsibility and are set by your country." },
  { keys:['payment','pay','card','paypal','mbway','mb way'], a:"We accept Card (Stripe), PayPal, and MB Way. Choose your method at checkout." },
  { keys:['wash','care','maintain','maintenance'], a:"Use sulfate-free shampoo, condition gently, and avoid excessive heat. Always use a heat protectant when styling. Store on a wig stand to keep the shape." },
  { keys:['hello','hi','hey','good'], a:"Hello! 👋 Welcome to Asheerah Hair. Ask me about our hair, shipping, returns, textures, or how to order — I'm happy to help." },
  { keys:['thank','thanks'], a:"You're so welcome! ❤️ If you need anything else, I'm here. For orders, we're on WhatsApp +351 914 522 508." },
  { keys:['bye','goodbye'], a:"Goodbye! 👋 Thanks for visiting Asheerah Hair — see you soon." },
];

function answer(query){
  const q = query.toLowerCase();
  // greetings / thanks handled by exact-ish keys
  for (const item of KB){
    if (item.keys.some(k => q.includes(k))) return item.a;
  }
  return "I'm not sure I caught that. You can ask me about our hair types, textures, lengths, shipping, returns, payment, or care. Or message us on WhatsApp +351 914 522 508 for personal help. 😊";
}

// ---------- UI ----------
let chatOpen = false;
function toggleChat(){
  chatOpen = !chatOpen;
  document.getElementById('chatWindow').classList.toggle('open', chatOpen);
  if (chatOpen) document.getElementById('chatInput').focus();
}
function botSay(text){
  const body = document.getElementById('chatBody');
  const div = document.createElement('div');
  div.className = 'msg bot';
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}
function userSay(text){
  const body = document.getElementById('chatBody');
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}
function sendChat(text){
  const input = document.getElementById('chatInput');
  const msg = (text || input.value || '').trim();
  if (!msg) return;
  userSay(msg);
  input.value = '';
  // small typing delay for natural feel
  setTimeout(()=> botSay(answer(msg)), 350);
}
function quickAsk(q){ sendChat(q); }
document.addEventListener('DOMContentLoaded', ()=>{
  const b = document.getElementById('chatBody');
  if (b && !b.children.length){
    botSay("Hi! I'm the Asheerah Hair assistant. 👋 Ask me anything about our hair, shipping, returns, or ordering.");
  }
});
