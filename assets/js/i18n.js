/* Asheerah Hair — i18n (multi-language UI)
 * Load BEFORE app.js. Covers UI chrome (nav, announcement, hero, sections, buttons,
 * cart/checkout labels, FAQ). Product names stay in English (industry standard).
 * Base language is pt-PT; detect from localStorage -> browser -> pt-PT.
 */
'use strict';

var LANGS = ['pt', 'en', 'es', 'de', 'fr', 'it'];
var LANG_NAMES = { pt:'Português', en:'English', es:'Español', de:'Deutsch', fr:'Français', it:'Italiano' };

/* Inline SVG flags (render everywhere, offline-safe). viewBox 3:2. */
var FLAGS = {
  pt: '<svg viewBox="0 0 4 3"><path d="M0 0h4v3H0z" fill="#ff0000"/><path d="M0 0h1.6v3H0z" fill="#046a38"/><circle cx="1.35" cy="1.5" r=".68" fill="#ffcf00"/><path d="M1.06 1.05a.45.45 0 1 0 .58.68l-.58-.68z" fill="#046a38"/><path d="M1.28 1.28l.1-.2.1.2-.1-.06zM1.48 1.5l.2-.06-.2.1zm-.16.18l-.06.2-.1-.2zm-.22.02l-.2.06.2-.1z" fill="#fff"/></svg>',
  en: '<svg viewBox="0 0 4 3"><path d="M0 0h4v3H0z" fill="#012169"/><path d="M0 0 4 3M4 0 0 3" stroke="#fff" stroke-width=".7"/><path d="M0 0 4 3M4 0 0 3" stroke="#C8102E" stroke-width=".4"/><path d="M2 0v3M0 1.5h4" stroke="#fff" stroke-width="1"/><path d="M2 0v3M0 1.5h4" stroke="#C8102E" stroke-width=".5"/></svg>',
  es: '<svg viewBox="0 0 4 3"><path d="M0 0h4v3H0z" fill="#AA151B"/><path d="M0 1h4v1H0z" fill="#F1BF00"/></svg>',
  de: '<svg viewBox="0 0 4 3"><path d="M0 0h4v1H0z" fill="#000"/><path d="M0 1h4v1H0z" fill="#DD0000"/><path d="M0 2h4v1H0z" fill="#FFCE00"/></svg>',
  fr: '<svg viewBox="0 0 4 3"><path d="M0 0h1.33v3H0z" fill="#002395"/><path d="M1.33 0h1.34v3H1.33z" fill="#fff"/><path d="M2.67 0H4v3H2.67z" fill="#ED2939"/></svg>',
  it: '<svg viewBox="0 0 4 3"><path d="M0 0h1.33v3H0z" fill="#009246"/><path d="M1.33 0h1.34v3H1.33z" fill="#fff"/><path d="M2.67 0H4v3H2.67z" fill="#CE2B37"/></svg>',
};

/* UI strings keyed by stable id. Key in every language; fall back to pt if missing. */
var I18N = {
  announce: { pt:'Use Com Confiança', en:'Shop With Confidence', es:'Compre Con Confianza', de:'Kaufen Sie Mit Vertrauen', fr:'Achetez En Toute Confiance', it:'Acquista Con Fiducia' },
  announce2: { pt:'Cabelo Humano Virgem 100%', en:'100% Virgin Human Hair', es:'Cabello Humano Virgen 100%', de:'100% Echtes Menschenhaar', fr:'Cheveux Humains Vierges 100%', it:'Capelli Umani Vergini 100%' },
  announce3: { pt:'Envio Mundial', en:'Worldwide Shipping', es:'Envío Mundial', de:'Weltweiter Versand', fr:'Livraison Mondiale', it:'Spedizione Mondiale' },
  currency: { pt:'EUR / PT-PT', en:'EUR / PT-PT', es:'EUR / ES-ES', de:'EUR / DE-DE', fr:'EUR / FR-FR', it:'EUR / IT-IT' },

  nav_home:   { pt:'Início', en:'Home', es:'Inicio', de:'Start', fr:'Accueil', it:'Home' },
  nav_wigs:   { pt:'Perucas', en:'Wigs', es:'Pelucas', de:'Perücken', fr:'Perruques', it:'Parrucche' },
  nav_bundles:{ pt:'Pacotes', en:'Bundles', es:'Paquetes', de:'Bündel', fr:'Paquets', it:'Pacchetti' },
  nav_crochet:{ pt:'Cabelo de Crochê', en:'Crochet Hair', es:'Cabello de Crochet', de:'Gehäkeltes Haar', fr:'Cheveux au Crochet', it:'Capelli All\u2019uncinetto' },
  nav_faq:    { pt:'FAQ', en:'FAQ', es:'Preguntas', de:'FAQ', fr:'FAQ', it:'FAQ' },
  nav_contact:{ pt:'Contacte-nos', en:'Contact', es:'Contáctenos', de:'Kontakt', fr:'Contact', it:'Contattaci' },

  hero_luxury: { pt:'Cabelo de Luxo.', en:'Luxury Hair.', es:'Cabello de Lujo.', de:'Luxuriöses Haar.', fr:'Cheveux de Luxe.', it:'Capelli di Lusso.' },
  hero_made:   { pt:'Feito para Ti.', en:'Made for You.', es:'Hecho Para Ti.', de:'Für Dich Gemacht.', fr:'Fait Pour Vous.', it:'Fatto Per Te.' },
  hero_virgin: { pt:'100% Cabelo Humano Virgem', en:'100% Virgin Human Hair', es:'100% Cabello Humano Virgen', de:'100% Echtes Menschenhaar', fr:'100% Cheveux Humains Vierges', it:'100% Capelli Umani Vergini' },
  hero_strand:{ pt:'Luxo em cada fio.', en:'Luxury in every strand.', es:'Lujo en cada hebra.', de:'Luxus in jeder Strähne.', fr:'Le luxe dans chaque mèche.', it:'Lusso in ogni ciocca.' },
  btn_shop:    { pt:'Comprar Agora', en:'Shop Now', es:'Comprar Ahora', de:'Jetzt Kaufen', fr:'Acheter Maintenant', it:'Acquista Ora' },
  btn_wigs:    { pt:'Explorar Perucas', en:'Explore Wigs', es:'Explorar Pelucas', de:'Perücken Entdecken', fr:'Explorer les Perruques', it:'Esplora le Parrucche' },

  sec_collections: { pt:'As Nossas Coleções', en:'Our Collections', es:'Nuestras Colecciones', de:'Unsere Kollektionen', fr:'Nos Collections', it:'Le Nostre Collezioni' },
  shop_by_collection: { pt:'Comprar por Coleção', en:'Shop by Collection', es:'Comprar por Colección', de:'Nach Kollektion Einkaufen', fr:'Acheter par Collection', it:'Acquista per Collezione' },
  sec_texture:  { pt:'Encontra a Tua Textura', en:'Find Your Texture', es:'Encuentra tu Textura', de:'Finde deine Textur', fr:'Trouvez Votre Texture', it:'Trova la Tua Textura' },
  shop_by_texture: { pt:'Comprar por Textura', en:'Shop by Texture', es:'Comprar por Textura', de:'Nach Textur Einkaufen', fr:'Acheter par Texture', it:'Acquista per Textura' },

  vp_virgin: { pt:'100% Cabelo Virgem', en:'100% Virgin Hair', es:'100% Cabello Virgen', de:'100% Echtes Haar', fr:'100% Cheveux Vierges', it:'100% Capelli Vergini' },
  vp_quality:{ pt:'Qualidade Premium', en:'Premium Quality', es:'Calidad Premium', de:'Premium-Qualität', fr:'Qualité Premium', it:'Qualità Premium' },
  vp_durable:{ pt:'Durável e Duradouro', en:'Long Lasting & Durable', es:'Duradero y Resistente', de:'Langlebig & Robust', fr:'Durable & Résistant', it:'Durevole e Resistente' },
  vp_shipping:{ pt:'Envio Rápido e Seguro', en:'Fast & Secure Shipping', es:'Envío Rápido y Seguro', de:'Schneller & Sicherer Versand', fr:'Expédition Rapide & Sécurisée', it:'Spedizione Veloce e Sicura' },
  vp_service:{ pt:'Excelente Atendimento', en:'Excellent Customer Service', es:'Excelente Atención al Cliente', de:'Exzellenter Kundenservice', fr:'Excellent Service Client', it:'Eccellente Assistenza Clienti' },

  feat_hair: { pt:'Cabelo Humano Premium', en:'Premium Human Hair', es:'Cabello Humano Premium', de:'Premium-Menschenhaar', fr:'Cheveux Humains Premium', it:'Capelli Umani Premium' },
  feat_hair_d: { pt:'100% cabelo humano virgem, selecionado para qualidade.', en:'100% virgin human hair, carefully selected for quality.', es:'100% cabello humano virgen, seleccionado por su calidad.', de:'100% echtes Menschenhaar, sorgfältig für Qualität ausgewählt.', fr:'100% cheveux humains vierges, sélectionnés pour leur qualité.', it:'100% capelli umani vergini, selezionati per la qualità.' },
  feat_ship: { pt:'Envio Mundial', en:'Worldwide Shipping', es:'Envío Mundial', de:'Weltweiter Versand', fr:'Livraison Mondiale', it:'Spedizione Mondiale' },
  feat_ship_d: { pt:'Entregamos cabelo premium em todo o mundo.', en:'Delivering premium hair worldwide.', es:'Entregamos cabello premium en todo el mundo.', de:'Premium-Haar weltweit geliefert.', fr:'Livraison de cheveux premium dans le monde.', it:'Consegna di capelli premium in tutto il mondo.' },
  feat_pay:  { pt:'Pagamentos Seguros', en:'Secure Payments', es:'Pagos Seguros', de:'Sichere Zahlungen', fr:'Paiements Sécurisés', it:'Pagamenti Sicuri' },
  feat_pay_d:{ pt:'Compra com um checkout seguro e confiável.', en:'Shop confidently with a secure checkout.', es:'Compra con confianza con un pago seguro.', de:'Kaufen Sie sicher mit sicherem Checkout.', fr:'Achetez en toute confiance avec un paiement sécurisé.', it:'Acquista con sicurezza con un checkout protetto.' },
  feat_style:{ pt:'Feito para o Teu Estilo', en:'Made for Your Style', es:'Hecho para tu Estilo', de:'Für deinen Stil', fr:'Fait pour Votre Style', it:'Fatto per il Tuo Stile' },
  feat_style_d:{ pt:'Escolhe o comprimento, lace e densidade.', en:'Choose your length, lace and density.', es:'Elige tu largo, lace y densidad.', de:'Wählen Sie Länge, Lace und Dichte.', fr:'Choisissez votre longueur, lace et densité.', it:'Scegli lunghezza, lace e densità.' },

  ig_follow: { pt:'Segue a Nossa Jornada', en:'Follow Our Hair Journey', es:'Sigue Nuestro Viaje', de:'Folge Unserer Reise', fr:'Suivez Notre Parcours', it:'Segui il Nostro Viaggio' },
  ig_view:   { pt:'Ver Mais no Instagram', en:'View More on Instagram', es:'Ver Más en Instagram', de:'Mehr Auf Instagram', fr:'Voir Plus Sur Instagram', it:'Guarda di Più su Instagram' },

  reviews_label:{ pt:'O que os Clientes Dizem', en:'Customers Are Saying', es:'Lo que Dicen los Clientes', de:'Das Sagen Kunden', fr:'Ce que Disent les Clients', it:'Cosa Dicono i Clienti' },
  real_reviews:{ pt:'Avaliações Reais', en:'Real Reviews', es:'Reseñas Reales', de:'Echte Bewertungen', fr:'Avis Réels', it:'Recensioni Reali' },

  all_products:{ pt:'Todos os Produtos', en:'All Products', es:'Todos los Productos', de:'Alle Produkte', fr:'Tous les Produits', it:'Tutti i Prodotti' },
  luxury_wigs:{ pt:'Perucas de Luxo', en:'Luxury Wigs', es:'Pelucas de Lujo', de:'Luxus-Perücken', fr:'Perruques de Luxe', it:'Parrucche di Lusso' },
  luxury_bundles:{ pt:'Pacotes de Luxo', en:'Luxury Bundles', es:'Paquetes de Lujo', de:'Luxus-Bündel', fr:'Paquets de Luxe', it:'Pacchetti di Lusso' },
  crochet_hair:{ pt:'Cabelo de Crochê', en:'Crochet Hair', es:'Cabello de Crochet', de:'Gehäkeltes Haar', fr:'Cheveux au Crochet', it:'Capelli all\u2019uncinetto' },

  your_cart: { pt:'O Teu Carrinho', en:'Your Cart', es:'Tu Carrito', de:'Dein Warenkorb', fr:'Votre Panier', it:'Il Tuo Carrello' },
  cart_empty:{ pt:'O teu carrinho está vazio.', en:'Your cart is empty.', es:'Tu carrito está vacío.', de:'Dein Warenkorb ist leer.', fr:'Votre panier est vide.', it:'Il tuo carrello è vuoto.' },
  checkout:  { pt:'Checkout', en:'Checkout', es:'Pago', de:'Zur Kasse', fr:'Commander', it:'Pagamento' },
  order_summary:{ pt:'Resumo da Encomenda', en:'Order summary', es:'Resumen del Pedido', de:'Bestellübersicht', fr:'Récapitulatif de Commande', it:'Riepilogo Ordine' },
  items:     { pt:'Artigos', en:'Items', es:'Artículos', de:'Artikel', fr:'Articles', it:'Articoli' },
  shipping:  { pt:'Envio', en:'Shipping', es:'Envío', de:'Versand', fr:'Livraison', it:'Spedizione' },
  total:     { pt:'Total', en:'Total', es:'Total', de:'Gesamt', fr:'Total', it:'Totale' },
  subtotal:  { pt:'Subtotal', en:'Subtotal', es:'Subtotal', de:'Zwischensumme', fr:'Sous-total', it:'Subtotale' },
  delivery_details:{ pt:'Dados de Entrega', en:'Delivery details', es:'Datos de Entrega', de:'Lieferdaten', fr:'Détails de Livraison', it:'Dettagli di Consegna' },
  full_name: { pt:'Nome completo', en:'Full name', es:'Nombre completo', de:'Vollständiger Name', fr:'Nom complet', it:'Nome completo' },
  email_tracking:{ pt:'Email (para rastreamento)', en:'Email (for tracking)', es:'Email (para seguimiento)', de:'E-Mail (für Sendungsverfolgung)', fr:'Email (pour le suivi)', it:'Email (per il tracciamento)' },
  phone:     { pt:'Telefone', en:'Phone', es:'Teléfono', de:'Telefon', fr:'Téléphone', it:'Telefono' },
  address:   { pt:'Morada de entrega', en:'Delivery address', es:'Dirección de entrega', de:'Lieferadresse', fr:'Adresse de livraison', it:'Indirizzo di consegna' },
  payment:   { pt:'Pagamento', en:'Payment', es:'Pago', de:'Zahlung', fr:'Paiement', it:'Pagamento' },
  card_stripe:{ pt:'Cartão (Stripe)', en:'Card (Stripe)', es:'Tarjeta (Stripe)', de:'Karte (Stripe)', fr:'Carte (Stripe)', it:'Carta (Stripe)' },
  mbway_desc:{ pt:'Paga por telemóvel na app MB Way', en:'Pay by phone in the MB Way app', es:'Paga por teléfono en la app MB Way', de:'Per Telefon in der MB-Way-App zahlen', fr:'Payez par téléphone dans l\u2019app MB Way', it:'Paga via telefono nell\u2019app MB Way' },
  place_order:{ pt:'Finalizar Encomenda', en:'Place order', es:'Realizar Pedido', de:'Bestellung Aufgeben', fr:'Passer Commande', it:'Effettua Ordine' },
  order_received:{ pt:'Encomenda recebida! Confirmação a caminho.', en:'Order received! Confirmation on the way.', es:'¡Pedido recibido! Confirmación en camino.', de:'Bestellung erhalten! Bestätigung unterwegs.', fr:'Commande reçue ! Confirmation en route.', it:'Ordine ricevuto! Conferma in arrivo.' },
  order_recorded:{ pt:'Encomenda registada. Confirmaremos em breve.', en:'Order recorded. Confirming shortly.', es:'Pedido registrado. Confirmaremos pronto.', de:'Bestellung erfasst. Bestätigung folgt.', fr:'Commande enregistrée. Confirmation à venir.', it:'Ordine registrato. Conferma a breve.' },
  add_to_cart:{ pt:'Adicionar ao Carrinho', en:'Add to cart', es:'Añadir al Carrito', de:'In den Warenkorb', fr:'Ajouter au Panier', it:'Aggiungi al Carrello' },
  added:     { pt:'Adicionado ao carrinho ✓', en:'Added to cart ✓', es:'Añadido al carrito ✓', de:'In den Warenkorb ✓', fr:'Ajouté au panier ✓', it:'Aggiunto al carrello ✓' },
  description:{ pt:'Descrição', en:'Description', es:'Descripción', de:'Beschreibung', fr:'Description', it:'Descrizione' },
  loading:   { pt:'A carregar…', en:'Loading…', es:'Cargando…', de:'Laden…', fr:'Chargement…', it:'Caricamento…' },
  not_found: { pt:'Produto não encontrado.', en:'Product not found.', es:'Producto no encontrado.', de:'Produkt nicht gefunden.', fr:'Produit introuvable.', it:'Prodotto non trovato.' },

  faq_title: { pt:'Perguntas Frequentes', en:'Frequently Asked Questions', es:'Preguntas Frecuentes', de:'Häufig Gestellte Fragen', fr:'Questions Fréquentes', it:'Domande Frequenti' },
  faq_hint:  { pt:'Não encontraste resposta? Usa o assistente de chat ou contacta-nos.', en:"Can't find an answer? Use the chat assistant or contact us.", es:'¿No encuentras respuesta? Usa el asistente o contáctanos.', de:'Keine Antwort gefunden? Nutze den Chat-Assistenten oder kontaktiere uns.', fr:'Pas de réponse ? Utilisez l\u2019assistant ou contactez-nous.', it:'Non trovi risposta? Usa l\u2019assistente o contattaci.' },

  contact_title:{ pt:'Contacta-nos', en:'Contact Us', es:'Contáctenos', de:'Kontaktieren Sie Uns', fr:'Contactez-Nous', it:'Contattaci' },
  contact_blurb:{ pt:'Gostaríamos de ouvir de ti! Se tiveres dúvidas sobre os produtos ou precisares de ajuda com uma encomenda, contacta-nos.', en:"We'd love to hear from you! If you have any questions or need order assistance, contact us.", es:'¡Nos encantaría saber de ti! Si tienes dudas o necesitas ayuda con un pedido, contáctanos.', de:'Wir freuen uns auf Sie! Bei Fragen oder Hilfe mit einer Bestellung kontaktieren Sie uns.', fr:'Nous serions ravis de vous entendre ! Pour toute question ou aide, contactez-nous.', it:'Saremo felici di sentirvi! Per domande o assistenza, contattateci.' },
  get_in_touch:{ pt:'Fala Connosco', en:'Get in Touch', es:'Ponte en Contacto', de:'Kontakt Aufnehmen', fr:'Prenez Contact', it:'Mettiti in Contatto' },
  send_msg:  { pt:'Enviar Mensagem', en:'Send Message', es:'Enviar Mensaje', de:'Nachricht Senden', fr:'Envoyer le Message', it:'Invia Messaggio' },
  email:     { pt:'Email', en:'Email', es:'Email', de:'E-Mail', fr:'Email', it:'Email' },
  comment:   { pt:'Comentário', en:'Comment', es:'Comentario', de:'Kommentar', fr:'Commentaire', it:'Commento' },

  about_title:{ pt:'Sobre Nós', en:'About Us', es:'Sobre Nosotros', de:'Über Uns', fr:'À Propos', it:'Chi Siamo' },
  shipping_title:{ pt:'Política de Envio', en:'Shipping Policy', es:'Política de Envío', de:'Versandrichtlinie', fr:'Politique de Livraison', it:'Politica di Spedizione' },
  returns_title:{ pt:'Política de Devoluções', en:'Return & Refund Policy', es:'Política de Devoluciones', de:'Rückgabe- & Erstattungsrichtlinie', fr:'Politique de Retour & Remboursement', it:'Politica di Resi e Rimborsi' },

  search_placeholder:{ pt:'Procurar produtos…', en:'Search products…', es:'Buscar productos…', de:'Produkte suchen…', fr:'Rechercher des produits…', it:'Cerca prodotti…' },
  search:   { pt:'Procurar', en:'Search', es:'Buscar', de:'Suchen', fr:'Rechercher', it:'Cerca' },
  cart:     { pt:'Carrinho', en:'Cart', es:'Carrito', de:'Warenkorb', fr:'Panier', it:'Carrello' },
};

var LANG = detectLang();
function detectLang(){
  var s = null;
  try { s = localStorage.getItem('ash_lang'); } catch(e){}
  if (s && LANGS.indexOf(s) !== -1) return s;
  if (navigator && navigator.language){
    var b = (navigator.language || 'pt').slice(0,2).toLowerCase();
    if (LANGS.indexOf(b) !== -1) return b;
  }
  return 'pt';
}

function uiTxt(k){
  // accept both 'nav.home' and 'nav_home' forms
  k = k.replace(/\./g, '_');
  var o = I18N[k];
  if (!o) return '';
  return o[LANG] !== undefined && o[LANG] !== '' ? o[LANG] : (o.pt || '');
}

/* Apply all data-i18n text on the current page. */
function applyLangUI(){
  document.querySelectorAll('[data-i18n]').forEach(function(el){
    var key = el.getAttribute('data-i18n');
    if (!key) return;
    var t = uiTxt(key);
    if (t) el.textContent = t;
  });
  document.documentElement.setAttribute('lang', LANG === 'pt' ? 'pt-PT' : LANG);
  // placeholders
  document.querySelectorAll('[data-i18n-ph]').forEach(function(el){
    var k = el.getAttribute('data-i18n-ph');
    if (!k) return;
    var t = uiTxt(k);
    if (t) el.setAttribute('placeholder', t);
  });
  // title
  var t = document.querySelector('title');
  if (t && uiTxt('brand_suffix')) t.textContent = 'Asheerah Hair — ' + uiTxt('brand_suffix');
}

function setLang(l){
  LANG = l;
  try { localStorage.setItem('ash_lang', l); } catch(e){}
  applyLangUI();
  // refresh currency label + any JS-rendered text on this page
  if (window.updateCartUI) window.updateCartUI();
  if (window.renderShop) window.renderShop();
  if (window.renderProduct) window.renderProduct();
  if (window.renderCartPage) window.renderCartPage();
  if (window.renderCheckoutPage) window.renderCheckoutPage();
  if (window.updateLangDropdown) window.updateLangDropdown();
}

/* Build the custom language dropdown and inject it into the header's currency selector area. */
function buildLangDropdown(){
  var wrap = document.getElementById('langDropdown');
  if (!wrap) return;
  wrap.innerHTML = '';
  var btn = document.createElement('button');
  btn.className = 'lang-btn';
  btn.setAttribute('aria-haspopup','listbox');
  btn.setAttribute('aria-expanded','false');
  btn.innerHTML = '<span class="flag">'+ (FLAGS[LANG]||FLAGS.pt) +'</span><span class="lang-code">'+ LANG.toUpperCase() +'</span><span class="chev">⌄</span>';
  var menu = document.createElement('div');
  menu.className = 'lang-menu';
  menu.setAttribute('role','listbox');
  LANGS.forEach(function(code){
    var opt = document.createElement('button');
    opt.className = 'lang-opt' + (code===LANG?' active':'');
    opt.setAttribute('role','option');
    opt.setAttribute('data-lang', code);
    opt.innerHTML = '<span class="flag">'+ FLAGS[code] +'</span><span>'+ LANG_NAMES[code] +'</span>' + (code===LANG?' ✓':'');
    opt.addEventListener('click', function(){ setLang(code); closeLang(); });
    menu.appendChild(opt);
  });
  wrap.appendChild(btn);
  wrap.appendChild(menu);
  btn.addEventListener('click', function(e){ e.stopPropagation(); var open = menu.classList.toggle('open'); btn.setAttribute('aria-expanded', open?'true':'false'); });
  document.addEventListener('click', function(){ closeLang(); });
  function closeLang(){ menu.classList.remove('open'); btn.setAttribute('aria-expanded','false'); }
  window.updateLangDropdown = function(){ buildLangDropdown(); };
  return wrap;
}

document.addEventListener('DOMContentLoaded', function(){
  applyLangUI();
  buildLangDropdown();
});
