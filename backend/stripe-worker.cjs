const nodeCrypto = require('node:crypto');
const orderEmail = require('./order-email.cjs');
const crypto = nodeCrypto;
const MAX_BODY_BYTES = 24_000;
const MAX_ITEMS = 20;
const MAX_QTY = 10;
const MAX_REVIEW_BODY_BYTES = 22 * 1024 * 1024;
const MAX_REVIEW_MEDIA_FILES = 3;
const MAX_REVIEW_MEDIA_BYTES = 8 * 1024 * 1024;
const AMBASSADOR_COUPONS = Object.freeze({
  ONIKA01: 700,
  LILIAN01: 700,
  TUCHA01: 700,
  CASSIE01: 700,
  ONIKAAH: 1500,
  LILIANAH: 1500,
  TUCHAAH: 1500,
  CASSIEAH: 1500,
});

const EU_COUNTRIES = Object.freeze(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']);

/**
 * Europe shipping destination codes.
 * Includes all 27 European Union member states plus 26 non-EU European countries and territories:
 * AD, AL, BA, BY, CH, GB, GI, GG, IM, IS, JE, LI, MC, MD, ME, MK, NO, RS, RU, SM, UA, VA, XK, AX, FO, SJ.
 * Note: Intercontinental boundary countries/transcontinental territories (TR, AM, AZ, GE, KZ)
 * are excluded from the European shipping rate for now and retain the international rate.
 */
const EUROPE_ADDITIONAL_COUNTRIES = Object.freeze([
  'AD','AL','BA','BY','CH','GB','GI','GG','IM','IS','JE','LI','MC','MD','ME','MK','NO','RS','RU','SM','UA','VA','XK','AX','FO','SJ'
]);
const EUROPE_COUNTRIES = Object.freeze([...EU_COUNTRIES, ...EUROPE_ADDITIONAL_COUNTRIES]);
const EUROPE_SHIPPING_CENTS = 799;
const EU_SHIPPING_CENTS = 799;
const INTL_SHIPPING_CENTS = 2000;
const PICKUP_SHIPPING_CENTS = 0;

const PICKUP_LOCATION = Object.freeze({
  id: 'midana-amadora',
  name: 'Midana Beauty',
  address: 'Centro Comercial da Amadora, Rua Elias Garcia, n.º 229, 1.º andar, Loja E',
  city: 'Amadora',
  postalCode: '2700-319',
  country: 'PT',
  fullAddress: 'Midana Beauty, Centro Comercial da Amadora, Rua Elias Garcia, n.º 229, 2700-319 Amadora, Portugal; 1.º andar, Loja E.',
});
const COUNTRY_ENTRIES = [["AD","Andorra","Andorre"],["AE","United Arab Emirates","Emirados Árabes Unidos","Emiratos Árabes Unidos","Vereinigte Arabische Emirate","Émirats arabes unis","Emirati Arabi Uniti"],["AF","Afghanistan","Afeganistão","Afganistán"],["AG","Antigua & Barbuda","Antigua and Barbuda","Antígua e Barbuda","Antigua y Barbuda","Antigua und Barbuda","Antigua-et-Barbuda","Antigua e Barbuda"],["AI","Anguilla","Anguila"],["AL","Albania","Albânia","Albanien","Albanie"],["AM","Armenia","Armênia","Armenien","Arménie"],["AO","Angola"],["AQ","Antarctica","Antártida","Antarktis","Antarctique","Antartide"],["AR","Argentina","Argentinien","Argentine"],["AT","Austria","Áustria","Österreich","Autriche"],["AU","Australia","Austrália","Australien","Australie"],["AW","Aruba"],["AX","Åland Islands","Ilhas Aland","Islas Aland","Ålandinseln","Îles Åland","Isole Åland"],["AZ","Azerbaijan","Azerbaijão","Azerbaiyán","Aserbaidschan","Azerbaïdjan","Azerbaigian"],["BA","Bosnia & Herzegovina","Bosnia and Herzegovina","Bósnia e Herzegovina","Bosnia y Herzegovina","Bosnien und Herzegowina","Bosnie-Herzégovine","Bosnia ed Erzegovina"],["BB","Barbados","Barbade"],["BD","Bangladesh","Bangladés","Bangladesch"],["BE","Belgium","Bélgica","Belgien","Belgique","Belgio"],["BF","Burkina Faso","Burquina Faso"],["BG","Bulgaria","Bulgária","Bulgarien","Bulgarie"],["BH","Bahrain","Barein","Baréin","Bahreïn","Bahrein"],["BI","Burundi"],["BJ","Benin","Benín","Bénin"],["BL","St. Barthélemy","São Bartolomeu","San Bartolomé","Saint-Barthélemy"],["BM","Bermuda","Bermudas","Bermudes"],["BN","Brunei","Brunéi","Brunei Darussalam"],["BO","Bolivia","Bolívia","Bolivien","Bolivie"],["BQ","Caribbean Netherlands","Países Baixos Caribenhos","Caribe neerlandés","Karibische Niederlande","Pays-Bas caribéens","Caraibi Olandesi"],["BR","Brazil","Brasil","Brasilien","Brésil","Brasile"],["BS","Bahamas"],["BT","Bhutan","Butão","Bután","Bhoutan"],["BV","Bouvet Island","Ilha Bouvet","Isla Bouvet","Bouvetinsel","Île Bouvet","Isola Bouvet"],["BW","Botswana","Botsuana"],["BY","Belarus","Bielorrússia","Bielorrusia","Biélorussie","Bielorussia"],["BZ","Belize","Belice"],["CA","Canada","Canadá","Kanada"],["CD","Congo - Kinshasa","República Democrática del Congo","Kongo-Kinshasa","Congo-Kinshasa"],["CF","Central African Republic","República Centro-Africana","República Centroafricana","Zentralafrikanische Republik","République centrafricaine","Repubblica Centrafricana"],["CG","Congo - Brazzaville","República do Congo","Congo","Kongo-Brazzaville","Congo-Brazzaville"],["CH","Switzerland","Suíça","Suiza","Schweiz","Suisse","Svizzera"],["CI","Côte d’Ivoire","Costa do Marfim","Costa d’Avorio","Ivory Coast","Cote d Ivoire","Costa de Marfil","Elfenbeinküste"],["CK","Cook Islands","Ilhas Cook","Islas Cook","Cookinseln","Îles Cook","Isole Cook"],["CL","Chile","Chili","Cile"],["CM","Cameroon","Camarões","Camerún","Kamerun","Cameroun","Camerun"],["CN","China","Chine","Cina"],["CO","Colombia","Colômbia","Kolumbien","Colombie"],["CR","Costa Rica"],["CV","Cape Verde","Cabo Verde","Cap-Vert","Capo Verde","Kap Verde"],["CW","Curaçao","Curazao"],["CY","Cyprus","Chipre","Zypern","Chypre","Cipro"],["CZ","Czechia","Tchéquia","Chequia","Tschechien","Tchéquie","Cechia","Czech Republic","Chéquia","República Checa","Repubblica Ceca"],["DE","Germany","Alemanha","Alemania","Deutschland","Allemagne","Germania"],["DJ","Djibouti","Djibuti","Yibuti","Dschibuti","Gibuti"],["DK","Denmark","Dinamarca","Dänemark","Danemark","Danimarca"],["DM","Dominica","Dominique"],["DO","Dominican Republic","República Dominicana","Dominikanische Republik","République dominicaine","Repubblica Dominicana"],["DZ","Algeria","Argélia","Argelia","Algerien","Algérie"],["EC","Ecuador","Equador","Équateur"],["EE","Estonia","Estônia","Estland","Estonie"],["EG","Egypt","Egito","Egipto","Ägypten","Égypte","Egitto"],["EH","Western Sahara","Saara Ocidental","Sáhara Occidental","Westsahara","Sahara occidental","Sahara Occidentale"],["ER","Eritrea","Eritreia","Érythrée"],["ES","Spain","Espanha","España","Spanien","Espagne","Spagna"],["ET","Ethiopia","Etiópia","Etiopía","Äthiopien","Éthiopie","Etiopia"],["FI","Finland","Finlândia","Finlandia","Finnland","Finlande"],["FJ","Fiji","Fiyi","Fidschi","Fidji","Figi"],["FK","Falkland Islands","Ilhas Malvinas","Islas Malvinas","Falklandinseln","Îles Malouines","Isole Falkland"],["FO","Faroe Islands","Ilhas Faroé","Islas Feroe","Färöer","Îles Féroé","Isole Fær Øer"],["FR","France","França","Francia","Frankreich"],["GA","Gabon","Gabão","Gabón","Gabun"],["GB","United Kingdom","Reino Unido","Vereinigtes Königreich","Royaume-Uni","Regno Unito","UK","Great Britain","Britain","England","Scotland","Wales","Northern Ireland","Grande-Bretagne","Grossbritannien","Großbritannien"],["GD","Grenada","Granada","Grenade"],["GE","Georgia","Geórgia","Georgien","Géorgie"],["GF","French Guiana","Guiana Francesa","Guayana Francesa","Französisch-Guayana","Guyane française","Guyana Francese"],["GG","Guernsey","Guernesey"],["GH","Ghana","Gana"],["GI","Gibraltar","Gibilterra"],["GL","Greenland","Groenlândia","Groenlandia","Grönland","Groenland"],["GM","Gambia","Gâmbia","Gambie"],["GN","Guinea","Guiné","Guinée"],["GP","Guadeloupe","Guadalupe","Guadalupa"],["GQ","Equatorial Guinea","Guiné Equatorial","Guinea Ecuatorial","Äquatorialguinea","Guinée équatoriale","Guinea Equatoriale"],["GR","Greece","Grécia","Grecia","Griechenland","Grèce"],["GS","South Georgia & South Sandwich Islands","South Georgia and South Sandwich Islands","Ilhas Geórgia do Sul e Sandwich do Sul","Islas Georgia del Sur y Sandwich del Sur","Südgeorgien und die Südlichen Sandwichinseln","Géorgie du Sud-et-les Îles Sandwich du Sud","Georgia del Sud e Sandwich Australi"],["GT","Guatemala"],["GU","Guam"],["GW","Guinea-Bissau","Guiné-Bissau","Guinea-Bisáu","Guinée-Bissau"],["GY","Guyana","Guiana"],["HK","Hong Kong SAR China","Hong Kong, RAE da China","RAE de Hong Kong (China)","Sonderverwaltungsregion Hongkong","R.A.S. chinoise de Hong Kong","RAS di Hong Kong"],["HN","Honduras"],["HR","Croatia","Croácia","Croacia","Kroatien","Croatie","Croazia"],["HT","Haiti","Haití","Haïti"],["HU","Hungary","Hungria","Hungría","Ungarn","Hongrie","Ungheria"],["ID","Indonesia","Indonésia","Indonesien","Indonésie"],["IE","Ireland","Irlanda","Irland","Irlande"],["IL","Israel","Israël","Israele"],["IM","Isle of Man","Ilha de Man","Isla de Man","Île de Man","Isola di Man"],["IN","India","Índia","Indien","Inde"],["IQ","Iraq","Iraque","Irak"],["IS","Iceland","Islândia","Islandia","Island","Islande","Islanda"],["IT","Italy","Itália","Italia","Italien","Italie"],["JE","Jersey"],["JM","Jamaica","Jamaika","Jamaïque","Giamaica"],["JO","Jordan","Jordânia","Jordania","Jordanien","Jordanie","Giordania"],["JP","Japan","Japão","Japón","Japon","Giappone"],["KE","Kenya","Quênia","Kenia"],["KG","Kyrgyzstan","Quirguistão","Kirguistán","Kirgisistan","Kirghizstan","Kirghizistan"],["KH","Cambodia","Camboja","Camboya","Kambodscha","Cambodge","Cambogia"],["KI","Kiribati","Quiribati"],["KM","Comoros","Comores","Comoras","Komoren","Comore"],["KN","St. Kitts & Nevis","St. Kitts and Nevis","São Cristóvão e Névis","San Cristóbal y Nieves","St. Kitts und Nevis","Saint-Christophe-et-Niévès","Saint Kitts e Nevis"],["KR","South Korea","Coreia do Sul","Corea del Sur","Südkorea","Corée du Sud","Corea del Sud"],["KW","Kuwait","Koweït"],["KY","Cayman Islands","Ilhas Cayman","Islas Caimán","Kaimaninseln","Îles Caïmans","Isole Cayman"],["KZ","Kazakhstan","Cazaquistão","Kazajistán","Kasachstan","Kazakistan"],["LA","Laos"],["LB","Lebanon","Líbano","Libanon","Liban","Libano"],["LC","St. Lucia","Santa Lúcia","Santa Lucía","Sainte-Lucie","Saint Lucia"],["LI","Liechtenstein"],["LK","Sri Lanka"],["LR","Liberia","Libéria"],["LS","Lesotho","Lesoto"],["LT","Lithuania","Lituânia","Lituania","Litauen","Lituanie"],["LU","Luxembourg","Luxemburgo","Luxemburg","Lussemburgo"],["LV","Latvia","Letônia","Letonia","Lettland","Lettonie","Lettonia"],["LY","Libya","Líbia","Libia","Libyen","Libye"],["MA","Morocco","Marrocos","Marruecos","Marokko","Maroc","Marocco"],["MC","Monaco","Mônaco","Mónaco"],["MD","Moldova","Moldávia","Moldavia","Republik Moldau","Moldavie"],["ME","Montenegro","Monténégro"],["MF","St. Martin","São Martinho","San Martín","Saint-Martin","Saint Martin"],["MG","Madagascar","Madagaskar"],["MK","North Macedonia","Macedônia do Norte","Macedonia del Norte","Nordmazedonien","Macédoine du Nord","Macedonia del Nord"],["ML","Mali"],["MM","Myanmar (Burma)","Mianmar (Birmânia)","Myanmar (Birmania)","Myanmar","Myanmar (Birmanie)"],["MN","Mongolia","Mongólia","Mongolei","Mongolie"],["MO","Macao SAR China","Macau, RAE da China","RAE de Macao (China)","Sonderverwaltungsregion Macau","R.A.S. chinoise de Macao","RAS di Macao"],["MQ","Martinique","Martinica"],["MR","Mauritania","Mauritânia","Mauretanien","Mauritanie"],["MS","Montserrat"],["MT","Malta","Malte"],["MU","Mauritius","Maurício","Mauricio","Maurice"],["MV","Maldives","Maldivas","Malediven","Maldive"],["MW","Malawi","Malaui"],["MX","Mexico","México","Mexiko","Mexique","Messico"],["MY","Malaysia","Malásia","Malasia","Malaisie"],["MZ","Mozambique","Moçambique","Mosambik","Mozambico"],["NA","Namibia","Namíbia","Namibie"],["NC","New Caledonia","Nova Caledônia","Nueva Caledonia","Neukaledonien","Nouvelle-Calédonie","Nuova Caledonia"],["NE","Niger","Níger"],["NG","Nigeria","Nigéria"],["NI","Nicaragua","Nicarágua"],["NL","Netherlands","Países Baixos","Países Bajos","Niederlande","Pays-Bas","Paesi Bassi","The Netherlands","Holland","Holanda"],["NO","Norway","Noruega","Norwegen","Norvège","Norvegia"],["NP","Nepal","Népal"],["NR","Nauru"],["NU","Niue"],["NZ","New Zealand","Nova Zelândia","Nueva Zelanda","Neuseeland","Nouvelle-Zélande","Nuova Zelanda"],["OM","Oman","Omã","Omán"],["PA","Panama","Panamá"],["PE","Peru","Perú","Pérou","Perù"],["PF","French Polynesia","Polinésia Francesa","Polinesia Francesa","Französisch-Polynesien","Polynésie française","Polinesia Francese"],["PG","Papua New Guinea","Papua-Nova Guiné","Papúa Nueva Guinea","Papua-Neuguinea","Papouasie-Nouvelle-Guinée","Papua Nuova Guinea"],["PH","Philippines","Filipinas","Philippinen","Filippine"],["PK","Pakistan","Paquistão","Pakistán"],["PL","Poland","Polônia","Polonia","Polen","Pologne"],["PM","St. Pierre & Miquelon","St. Pierre and Miquelon","São Pedro e Miquelão","San Pedro y Miquelón","St. Pierre und Miquelon","Saint-Pierre-et-Miquelon","Saint-Pierre e Miquelon"],["PN","Pitcairn Islands","Ilhas Pitcairn","Islas Pitcairn","Pitcairninseln","Îles Pitcairn","Isole Pitcairn"],["PR","Puerto Rico","Porto Rico","Portorico"],["PS","Palestinian Territories","Territórios palestinos","Territorios Palestinos","Palästinensische Autonomiegebiete","Territoires palestiniens","Territori Palestinesi"],["PT","Portugal","Portogallo"],["PY","Paraguay","Paraguai"],["QA","Qatar","Catar","Katar"],["RE","Réunion","Reunião","Reunión","La Réunion","Riunione"],["RO","Romania","Romênia","Rumanía","Rumänien","Roumanie"],["RS","Serbia","Sérvia","Serbien","Serbie"],["RU","Russia","Rússia","Rusia","Russland","Russie"],["RW","Rwanda","Ruanda"],["SA","Saudi Arabia","Arábia Saudita","Arabia Saudí","Saudi-Arabien","Arabie saoudite","Arabia Saudita"],["SB","Solomon Islands","Ilhas Salomão","Islas Salomón","Salomonen","Îles Salomon","Isole Salomone"],["SC","Seychelles","Seicheles","Seychellen"],["SE","Sweden","Suécia","Suecia","Schweden","Suède","Svezia"],["SG","Singapore","Singapura","Singapur","Singapour"],["SH","St. Helena","Santa Helena","Santa Elena","Sainte-Hélène","Sant’Elena"],["SI","Slovenia","Eslovênia","Eslovenia","Slowenien","Slovénie"],["SJ","Svalbard & Jan Mayen","Svalbard and Jan Mayen","Svalbard e Jan Mayen","Svalbard y Jan Mayen","Spitzbergen und Jan Mayen","Svalbard et Jan Mayen"],["SK","Slovakia","Eslováquia","Eslovaquia","Slowakei","Slovaquie","Slovacchia"],["SL","Sierra Leone","Serra Leoa","Sierra Leona"],["SM","San Marino","Saint-Marin"],["SN","Senegal","Sénégal"],["SO","Somalia","Somália","Somalie"],["SR","Suriname","Surinam"],["SS","South Sudan","Sudão do Sul","Sudán del Sur","Südsudan","Soudan du Sud","Sud Sudan"],["ST","São Tomé & Príncipe","São Tomé and Príncipe","São Tomé e Príncipe","Santo Tomé y Príncipe","São Tomé und Príncipe","Sao Tomé-et-Principe","Sao Tome and Principe"],["SV","El Salvador","Salvador"],["SX","Sint Maarten","Saint-Martin (partie néerlandaise)"],["SZ","Eswatini","Essuatíni","Esuatini"],["TA","Tristan da Cunha","Tristão da Cunha","Tristán de Acuña"],["TC","Turks & Caicos Islands","Turks and Caicos Islands","Ilhas Turcas e Caicos","Islas Turcas y Caicos","Turks- und Caicosinseln","Îles Turques-et-Caïques","Isole Turks e Caicos"],["TD","Chad","Chade","Tschad","Tchad","Ciad"],["TF","French Southern Territories","Territórios Franceses do Sul","Territorios Australes Franceses","Französische Süd- und Antarktisgebiete","Terres australes françaises","Terre Australi Francesi"],["TG","Togo"],["TH","Thailand","Tailândia","Tailandia","Thaïlande","Thailandia"],["TJ","Tajikistan","Tadjiquistão","Tayikistán","Tadschikistan","Tadjikistan","Tagikistan"],["TK","Tokelau"],["TL","Timor-Leste","Timor oriental","Timor Est"],["TM","Turkmenistan","Turcomenistão","Turkmenistán","Turkménistan"],["TN","Tunisia","Tunísia","Túnez","Tunesien","Tunisie"],["TO","Tonga"],["TR","Türkiye","Turquia","Turquía","Türkei","Turquie","Turchia"],["TT","Trinidad & Tobago","Trinidad and Tobago","Trinidad e Tobago","Trinidad y Tobago","Trinidad und Tobago","Trinité-et-Tobago"],["TV","Tuvalu"],["TW","Taiwan","Taiwán","Taïwan"],["TZ","Tanzania","Tanzânia","Tansania","Tanzanie"],["UA","Ukraine","Ucrânia","Ucrania","Ucraina"],["UG","Uganda","Ouganda"],["US","United States","Estados Unidos","Vereinigte Staaten","États-Unis","Stati Uniti","USA","United States of America","U.S.","U.S.A."],["UY","Uruguay","Uruguai"],["UZ","Uzbekistan","Uzbequistão","Uzbekistán","Usbekistan","Ouzbékistan"],["VA","Vatican City","Cidade do Vaticano","Ciudad del Vaticano","Vatikanstadt","État de la Cité du Vatican","Città del Vaticano"],["VC","St. Vincent & Grenadines","St. Vincent and Grenadines","São Vicente e Granadinas","San Vicente y las Granadinas","St. Vincent und die Grenadinen","Saint-Vincent-et-les Grenadines","Saint Vincent e Grenadine"],["VE","Venezuela"],["VG","British Virgin Islands","Ilhas Virgens Britânicas","Islas Vírgenes Británicas","Britische Jungferninseln","Îles Vierges britanniques","Isole Vergini Britanniche"],["VN","Vietnam","Vietnã","Viêt Nam"],["VU","Vanuatu"],["WF","Wallis & Futuna","Wallis and Futuna","Wallis e Futuna","Wallis y Futuna","Wallis und Futuna","Wallis-et-Futuna"],["WS","Samoa"],["XK","Kosovo"],["YE","Yemen","Iêmen","Jemen","Yémen"],["YT","Mayotte"],["ZA","South Africa","África do Sul","Sudáfrica","Südafrika","Afrique du Sud","Sudafrica"],["ZM","Zambia","Zâmbia","Sambia","Zambie"],["ZW","Zimbabwe","Zimbábue","Zimbabue","Simbabwe"]];
function normalizeCountry(value){return String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
const COUNTRY_LOOKUP = Object.fromEntries(COUNTRY_ENTRIES.flatMap(([code,...names])=>[[normalizeCountry(code),code],...names.map(name=>[normalizeCountry(name),code])]));
function shippingForCountry(value, fulfillmentMethod = 'delivery'){
  const method = fulfillmentMethod == null ? 'delivery' : String(fulfillmentMethod).trim().toLowerCase();
  if (method !== 'delivery' && method !== 'pickup') throw new Error('Invalid fulfillment method');
  const code = COUNTRY_LOOKUP[normalizeCountry(value)];
  if (!code) throw new Error('Shipping rate is not configured for this destination');
  if (method === 'pickup') {
    if (code !== 'PT') throw new Error('Pickup is only available in Portugal (PT)');
    return {
      countryCode: 'PT',
      region: 'EUROPE',
      shippingCents: PICKUP_SHIPPING_CENTS,
      fulfillmentMethod: 'pickup',
      method: 'pickup',
      locationId: PICKUP_LOCATION.id,
      location: PICKUP_LOCATION.fullAddress,
      pickupLocation: PICKUP_LOCATION,
      allowedCountries: ['PT'],
    };
  }
  if (EUROPE_COUNTRIES.includes(code)) return {countryCode:code,region:'EUROPE',shippingCents:EUROPE_SHIPPING_CENTS,fulfillmentMethod:'delivery',method:'delivery',allowedCountries:[code]};
  return {countryCode:code,region:'INTL',shippingCents:INTL_SHIPPING_CENTS,fulfillmentMethod:'delivery',method:'delivery',allowedCountries:[code]};
}

function cents(eur) {
  const n = Number(eur);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid catalog price');
  return Math.round(n * 100);
}
function safeText(v, max, field) {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max) throw new Error(`Invalid ${field}`);
  return v.trim();
}
function bodyExceedsLimit(request, body, maxBytes) {
  const declared = Number(request.headers.get('content-length'));
  return (Number.isFinite(declared) && declared > maxBytes) || new TextEncoder().encode(body).byteLength > maxBytes;
}
function stripeMode(env) {
  return env.STRIPE_MODE === 'live' || env.STRIPE_MODE === 'test' ? env.STRIPE_MODE : '';
}
function stripeSecretMatchesMode(secret, mode) {
  return Boolean(mode && typeof secret === 'string' && new RegExp(`^(?:sk|rk)_${mode}_`).test(secret));
}
function normalizeCheckoutRequest(input, catalog, env) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request');
  const customer = input.customer;
  const items = input.items;
  if (!customer || !Array.isArray(items) || !items.length || items.length > MAX_ITEMS) throw new Error('Invalid cart or customer');
  if (Object.keys(input).some(k => !['customer','items','couponCode','fulfillmentMethod','language'].includes(k))) throw new Error('Unexpected request fields');
  if (input.language !== undefined && typeof input.language !== 'string') throw new Error('Invalid order language');
  const language = require('./order-email-i18n.cjs').normalizeLanguage(input.language);

  const rawMethod = input.fulfillmentMethod == null ? 'delivery' : input.fulfillmentMethod;
  if (typeof rawMethod !== 'string') throw new Error('Invalid fulfillment method');
  const fulfillmentMethod = rawMethod.trim().toLowerCase();
  if (fulfillmentMethod !== 'delivery' && fulfillmentMethod !== 'pickup') throw new Error('Invalid fulfillment method');
  const isPickup = fulfillmentMethod === 'pickup';

  const couponCode = input.couponCode == null ? '' : String(input.couponCode).trim().toUpperCase();
  if (couponCode && !Object.prototype.hasOwnProperty.call(AMBASSADOR_COUPONS,couponCode)) throw new Error('Invalid ambassador coupon');
  if (Object.keys(customer).some(k => !['name','email','phone','country','address','city','postalCode','notes'].includes(k))) throw new Error('Unexpected customer fields');

  const rawCountry = safeText(customer.country, 80, 'country');
  const shipping = shippingForCountry(rawCountry, fulfillmentMethod);

  const cleanName = safeText(customer.name, 120, 'name');
  const cleanEmail = safeText(customer.email, 254, 'email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Invalid email');
  const cleanPhone = safeText(customer.phone, 40, 'phone');

  let cleanCustomer;
  let fulfillmentAddress;
  let pickupLocationId = '';
  let pickupLocation = '';

  if (isPickup) {
    cleanCustomer = {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      country: 'PT',
      address: PICKUP_LOCATION.address,
      city: PICKUP_LOCATION.city,
      postalCode: PICKUP_LOCATION.postalCode,
    };
    fulfillmentAddress = PICKUP_LOCATION.fullAddress;
    pickupLocationId = PICKUP_LOCATION.id;
    pickupLocation = PICKUP_LOCATION.fullAddress;
  } else {
    cleanCustomer = {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      country: shipping.countryCode,
      address: safeText(customer.address, 200, 'address'),
      city: safeText(customer.city, 100, 'city'),
      postalCode: safeText(customer.postalCode, 24, 'postal code'),
    };
    fulfillmentAddress = `${cleanCustomer.address}, ${cleanCustomer.postalCode} ${cleanCustomer.city}, ${cleanCustomer.country}`;
  }

  if(customer.notes !== undefined){if(typeof customer.notes!=='string'||customer.notes.length>1000)throw new Error('Invalid order notes');cleanCustomer.notes=customer.notes.trim();}
  if (!catalog || catalog.currency !== 'EUR' || !Array.isArray(catalog.products)) throw new Error('Catalog unavailable');
  const shippingCents = shipping.shippingCents;
  let subtotalCents = 0;
  const orderItems = [];
  const lineItems = items.map(item => {
    if (!item || Object.keys(item).some(k => !['handle','options','quantity'].includes(k))) throw new Error('Unexpected cart item fields');
    const handle = safeText(item.handle, 120, 'product');
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) throw new Error('Invalid quantity');
    const options = item.options;
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !/^opt[1-4]$/.test(k))) throw new Error('Invalid variant options');
    const product = catalog.products.find(p => p.handle === handle);
    if (!product) throw new Error('Unknown product');
    const variant = (product.variants || []).find(v => ['opt1','opt2','opt3','opt4'].every(k => String(v[k] || '') === String(options[k] || '')));
    if (!variant) throw new Error('Unknown product variant');
    const unitCents = cents(variant.price_eur);
    subtotalCents += unitCents * quantity;
    orderItems.push({ title: product.title, qty: quantity, opts: options, unitCents, variant: variant.title, image: product.images?.[0] || '', handle });
    return { price_data: { currency: 'eur', unit_amount: unitCents, product_data: { name: `${product.title} — ${variant.title}`.slice(0, 250) } }, quantity };
  });
  const discountCents = couponCode ? Math.min(AMBASSADOR_COUPONS[couponCode],subtotalCents) : 0;
  const totalCents = subtotalCents - discountCents + shippingCents;
  if (subtotalCents > 10_000_000 || totalCents > 10_000_000) throw new Error('Order exceeds maximum allowed amount');
  if (shippingCents > 0) lineItems.push({ price_data: { currency: 'eur', unit_amount: shippingCents, product_data: { name: 'Shipping' } }, quantity: 1 });
  return {
    customer: cleanCustomer,
    language,
    currency: 'eur',
    countryCode: shipping.countryCode,
    shippingRegion: shipping.region,
    allowedCountries: shipping.allowedCountries,
    subtotalCents,
    discountCents,
    couponCode,
    shippingCents,
    totalCents,
    orderItems,
    lineItems,
    fulfillmentMethod,
    pickupLocationId,
    pickupLocation,
    fulfillmentAddress,
  };
}
function discountCheckoutLineItems(checkout){
  let remaining=checkout.discountCents||0;
  const result=[];
  checkout.lineItems.forEach(item=>{
    if (remaining<=0 || item.price_data.product_data.name==='Shipping') { result.push(item); return; }
    const unitAmount=item.price_data.unit_amount;
    let quantity=item.quantity;
    while (remaining>0 && quantity>0){
      const reduction=Math.min(remaining,unitAmount);
      const discountedAmount=unitAmount-reduction;
      if (discountedAmount>0) result.push({
        price_data:{...item.price_data,unit_amount:discountedAmount,product_data:{...item.price_data.product_data,name:`${item.price_data.product_data.name} — ambassador offer ${checkout.couponCode}`}},
        quantity:1,
      });
      remaining-=reduction;
      quantity--;
    }
    if (quantity>0) result.push({...item,quantity});
  });
  if (remaining>0) throw new Error('Ambassador coupon exceeds eligible item total');
  return result;
}
function verifyStripeSignature(body, signature, secret, now = Math.floor(Date.now()/1000)) {
  if (typeof body !== 'string' || !signature || !secret) return false;
  const parts = signature.split(',').map(x => x.split('='));
  const timestamp = Number((parts.find(x => x[0] === 't') || [])[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest();
  return parts.filter(x => x[0] === 'v1').some(x => {
    if (!/^[a-f0-9]{64}$/i.test(x[1] || '')) return false;
    const candidate = Buffer.from(x[1], 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}
async function forwardToGas(env, payload) {
  const rawPayload = JSON.stringify(payload);
  const secret = String(env.WORKER_GAS_SECRET || '').normalize('NFKC').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\s+/g, '').toLowerCase();
  const signature = crypto.createHmac('sha256',secret).update(rawPayload).digest('hex');
  const response = await fetch(env.GAS_WEBHOOK_URL,{method:'POST',headers:{'content-type':'text/plain;charset=utf-8'},body:JSON.stringify({payload:rawPayload,signature})});
  let ack;
  try { ack = await response.json(); } catch { ack = null; }
  if (!response.ok || !ack || ack.ok !== true) {
    const err = new Error('Apps Script payment record failed');
    const reasons = { 'Unauthorized payment event': 'gas_auth_rejected', 'Invalid order details': 'gas_invalid_order_details', 'Invalid pending order': 'gas_invalid_pending_order', 'Unsupported worker action': 'gas_unsupported_action' };
    err.diagnostic = !response.ok ? 'gas_http_error' : !ack ? 'gas_non_json_response' : reasons[ack.error] || 'gas_record_error';
    throw err;
  }
  return ack;
}

function json(data, status=200, origin='*') {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', 'access-control-allow-origin':origin, 'access-control-allow-methods':'POST,GET,OPTIONS', 'access-control-allow-headers':'content-type,authorization', 'vary':'Origin' } });
}
function allowedSiteOrigin(env, origin){
  const configured=String(env.SITE_ORIGINS||env.SITE_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : '';
}
function safeReviewRecord(record,origin){
  return {id:record.id,productHandle:record.productHandle,name:record.name,rating:record.rating,text:record.text,createdAt:record.createdAt,media:(record.media||[]).map(file=>({url:`${origin}/review-media/${encodeURIComponent(file.key)}`,contentType:file.contentType}))};
}
function isReviewMedia(contentType, bytes){
  if(contentType==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(contentType==='image/png')return bytes.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>bytes[i]===v);
  if(contentType==='image/webp')return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(contentType==='video/mp4')return bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==='ftyp';
  if(contentType==='video/webm')return bytes.length>=4&&[0x1a,0x45,0xdf,0xa3].every((v,i)=>bytes[i]===v);
  return false;
}
function mediaExtension(contentType){return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'})[contentType]||'';}
async function reviewJson(bucket,key){
  const object=await bucket.get(key);
  if(!object)return null;
  try{return JSON.parse(await object.text());}catch{return null;}
}
function authMatches(request,token){
  const authorization=request.headers.get('Authorization')||'';
  const supplied=authorization.slice(0,7).toLowerCase()==='bearer '?authorization.slice(7).trim():'';
  if(!token||!supplied)return false;
  const a=Buffer.from(String(token)),b=Buffer.from(supplied);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function verifyTurnstile(request,form,env,origin,expectedAction){
  const responseToken=String(form.get('turnstileToken')||'');
  if(!responseToken)return false;
  if(!env.TURNSTILE_SECRET)return null;
  const body=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:responseToken});
  const ip=request.headers.get('CF-Connecting-IP');if(ip)body.set('remoteip',ip);
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString()}).then(r=>r.json()).catch(()=>null);
  return !!(result&&result.success&&result.hostname===new URL(origin).hostname&&(!expectedAction||result.action===expectedAction));
}
async function handleReviewRequest(request,url,env,origin){
  const bucket=env.REVIEW_MEDIA;
  if(!bucket)return json({error:'Review storage is not configured'},503,origin);
  if(url.pathname==='/reviews/pending'&&request.method==='GET'){
    if(!authMatches(request,env.REVIEW_ADMIN_TOKEN))return json({error:'Unauthorized'},env.REVIEW_ADMIN_TOKEN?401:503,origin);
    try{
      const listed=await bucket.list({prefix:'reviews/',limit:1000}),reviews=[];
      for(const item of listed.objects||[]){const r=await reviewJson(bucket,item.key);if(r&&r.status==='pending')reviews.push({id:r.id,productHandle:r.productHandle,name:r.name,rating:r.rating,text:r.text,createdAt:r.createdAt,media:(r.media||[]).map(file=>({key:file.key,contentType:file.contentType,size:file.size}))});}
      reviews.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
      return json({reviews},200,origin);
    }catch{return json({error:'Review queue is temporarily unavailable'},502,origin);}
  }
  if(url.pathname==='/reviews'&&request.method==='GET'){
    const product=String(url.searchParams.get('product')||'');
    if(!/^[a-z0-9-]{1,120}$/.test(product))return json({error:'Invalid product'},400,origin);
    try{
      const listed=await bucket.list({prefix:'reviews/',limit:1000});
      const reviews=[];
      for(const item of listed.objects||[]){const r=await reviewJson(bucket,item.key);if(r&&r.status==='approved'&&r.productHandle===product)reviews.push(safeReviewRecord(r,origin));}
      reviews.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      return json({reviews:reviews.slice(0,100)},200,origin);
    }catch{return json({error:'Reviews are temporarily unavailable'},502,origin);}
  }
  if(url.pathname.startsWith('/review-media/')&&request.method==='GET'){
    let key='';try{key=decodeURIComponent(url.pathname.slice('/review-media/'.length));}catch{return json({error:'Not found'},404,origin);}
    const parts=key.split('/');
    const filename=(parts[2]||'').split('.');
    const validPath=parts.length===3&&parts[0]==='media'&&/^[a-f0-9-]{36}$/i.test(parts[1])&&filename.length===2&&/^[0-9]+$/.test(filename[0])&&['jpg','png','webp','mp4','webm'].includes(filename[1].toLowerCase());
    const match=validPath?[null,parts[1]]:null;
    if(!match)return json({error:'Not found'},404,origin);
    const review=await reviewJson(bucket,`reviews/${match[1]}.json`),isAdmin=authMatches(request,env.REVIEW_ADMIN_TOKEN);
    if(!review||((review.status!=='approved')&&!isAdmin)||!(review.media||[]).some(file=>file.key===key))return json({error:'Not found'},404,origin);
    const object=await bucket.get(key);if(!object)return json({error:'Not found'},404,origin);
    return new Response(await object.arrayBuffer(),{status:200,headers:{'content-type':object.httpMetadata?.contentType||'application/octet-stream','cache-control':'public, max-age=3600','x-content-type-options':'nosniff','access-control-allow-origin':origin,'vary':'Origin'}});
  }
  if(url.pathname==='/reviews/moderate'&&request.method==='POST'){
    if(!authMatches(request,env.REVIEW_ADMIN_TOKEN))return json({error:'Unauthorized'},env.REVIEW_ADMIN_TOKEN?401:503,origin);
    const raw=await request.text();if(bodyExceedsLimit(request,raw,4_000))return json({error:'Request too large'},413,origin);
    let input;try{input=JSON.parse(raw);}catch{return json({error:'Invalid request'},400,origin);}
    if(!input||Object.keys(input).some(k=>!['reviewId','decision'].includes(k))||!/^([a-f0-9-]{36})$/i.test(String(input.reviewId||''))||!['approve','reject'].includes(input.decision))return json({error:'Invalid moderation request'},400,origin);
    const key=`reviews/${input.reviewId}.json`,review=await reviewJson(bucket,key);if(!review||review.status!=='pending')return json({error:'Review not found or already moderated'},404,origin);
    review.status=input.decision==='approve'?'approved':'rejected';review.moderatedAt=new Date().toISOString();
    if(input.decision==='reject')for(const file of review.media||[])await bucket.delete(file.key);
    await bucket.put(key,JSON.stringify(review),{httpMetadata:{contentType:'application/json'}});
    return json({ok:true,id:review.id,status:review.status},200,origin);
  }
  if(url.pathname==='/reviews'&&request.method==='POST'){
    const size=Number(request.headers.get('Content-Length')||0);if(size>MAX_REVIEW_BODY_BYTES)return json({error:'Upload too large'},413,origin);
    if(!env.TURNSTILE_SECRET)return json({error:'Review protection is not configured'},503,origin);
    let form;try{form=await request.formData();}catch{return json({error:'Invalid review upload'},400,origin);}
    const handle=String(form.get('productHandle')||''),name=String(form.get('name')||'').trim(),text=String(form.get('text')||'').trim(),rating=Number(form.get('rating'));
    if(!/^[a-z0-9-]{1,120}$/.test(handle)||!name||name.length>80||!text||text.length>500||!Number.isInteger(rating)||rating<1||rating>5)return json({error:'Invalid review'},400,origin);
    const files=form.getAll('media').filter(file=>file&&typeof file.arrayBuffer==='function'&&file.size>0);
    if(files.length>MAX_REVIEW_MEDIA_FILES)return json({error:'Upload up to three files'},413,origin);
    if(files.some(file=>file.size>MAX_REVIEW_MEDIA_BYTES))return json({error:'Each file must be 8 MB or smaller'},413,origin);
    const checked=[];let totalBytes=0;
    for(const file of files){const type=String(file.type||'').toLowerCase(),ext=mediaExtension(type);if(!ext)return json({error:'Use JPEG, PNG, WebP, MP4, or WebM files'},415,origin);const bytes=new Uint8Array(await file.arrayBuffer());if(!isReviewMedia(type,bytes))return json({error:'File content does not match its media type'},415,origin);totalBytes+=bytes.length;checked.push({type,ext,bytes});}
    if(totalBytes>20*1024*1024)return json({error:'Combined media must be 20 MB or smaller'},413,origin);
    let verified;try{verified=await verifyTurnstile(request,form,env,origin);}catch{verified=false;}
    if(verified===null)return json({error:'Review protection is not configured'},503,origin);
    if(!verified)return json({error:'Please complete the anti-spam check'},403,origin);
    const id=crypto.randomUUID(),stored=[];
    try{
      for(let i=0;i<checked.length;i++){
        const media=checked[i],key=`media/${id}/${i}.${media.ext}`;
        await bucket.put(key,media.bytes,{httpMetadata:{contentType:media.type,cacheControl:'private, no-store'}});
        stored.push({key,contentType:media.type,size:media.bytes.length});
      }
      const record={id,productHandle:handle,name,rating,text,createdAt:new Date().toISOString(),status:'pending',media:stored};
      await bucket.put(`reviews/${id}.json`,JSON.stringify(record),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});
      return json({ok:true,id,status:'pending'},201,origin);
    }catch{for(const file of stored)try{await bucket.delete(file.key);}catch{}return json({error:'Review could not be saved'},502,origin);}
  }
  return json({error:'Method not allowed'},405,origin);
}
async function stripePost(path, params, secret, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method:'POST', headers:{ authorization:`Bearer ${secret}`, 'content-type':'application/x-www-form-urlencoded', ...(idempotencyKey ? {'idempotency-key':idempotencyKey} : {}) }, body:params.toString() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Stripe request failed');
  return data;
}
async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/webhook' && request.method === 'POST') {
    const mode = stripeMode(env);
    if (env.STRIPE_MODE !== undefined && !mode) return json({ error:'Webhook mode is not configured' }, 503, '*');
    const raw = await request.text();
    if (bodyExceedsLimit(request, raw, MAX_BODY_BYTES) || !verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET)) return json({ error:'Invalid webhook signature' }, 400, '*');
    let event;
    try { event = JSON.parse(raw); } catch { return json({ error:'Invalid event' }, 400, '*'); }
    if (!['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'].includes(event.type)) return json({ received:true }, 200, '*');
    if (mode && (event.livemode !== (mode === 'live') || event.data?.object?.mode !== 'payment')) return json({ error:'Payment event mode is invalid' }, 400, '*');
    if (!env.GAS_WEBHOOK_URL || !env.WORKER_GAS_SECRET) return json({ error:'Webhook forwarder is not configured' }, 503, '*');
    try {
      const ack = await forwardToGas(env, { action:'stripe_event', eventId:event.id, eventType:event.type, session:event.data?.object });
      const session = event.data?.object;
      if (env.ORDER_EMAIL_ENABLED === '1' && ack.status === 'paid' && session?.payment_status === 'paid') {
        const order = await orderEmail.readOrder(env, session.client_reference_id);
        // Orders started before this feature have no immutable item snapshot.
        if (order) {
          if (order.totalCents !== session.amount_total || (order.sessionId && order.sessionId !== session.id)) throw new Error('Notification order mismatch');
          if (order.status !== 'paid') {
            order.status = 'paid';
            const shipping = session.collected_information?.shipping_details || session.shipping_details;
            if (order.fulfillmentMethod !== 'pickup' && shipping?.address) {
              const a = shipping.address;
              order.fulfillmentAddress = [a.line1,a.line2,a.city,a.state,a.postal_code,a.country].filter(Boolean).join(', ');
            }
            await orderEmail.writeOrder(env, order);
          }
          await orderEmail.deliver(env, order);
        }
      }
    }
    catch { return json({ error:'Payment event could not be recorded' }, 502, '*'); }
    return json({ received:true }, 200, '*');
  }
  const origin = request.headers.get('Origin') || '';
  if (!origin && url.pathname.startsWith('/review-media/') && request.method === 'GET') return handleReviewRequest(request, url, env, '*');
  const allowedOrigin = allowedSiteOrigin(env, origin);
  if (!allowedOrigin) return json({ error:'Origin not allowed' }, 403, 'null');
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:{ 'access-control-allow-origin':allowedOrigin, 'access-control-allow-methods':'POST,GET,OPTIONS', 'access-control-allow-headers':'content-type,authorization', 'vary':'Origin' } });
  if (url.pathname.startsWith('/public/')) {
    if (request.method !== 'POST') return json({ error:'Method not allowed' }, 405, allowedOrigin);
    if (!env.GAS_WEBHOOK_URL || !env.WORKER_GAS_SECRET) return json({ error:'Public form service is not configured' }, 503, allowedOrigin);
    const raw = await request.text();
    if (bodyExceedsLimit(request, raw, 4_000)) return json({ error:'Request too large' }, 413, allowedOrigin);
    let input;
    try { input = JSON.parse(raw); } catch { return json({ error:'Invalid request' }, 400, allowedOrigin); }
    let workerPayload;
    if (url.pathname === '/public/subscribe') {
      if (!input || Object.keys(input).some(k => k !== 'email') || typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return json({ error:'Invalid email' }, 400, allowedOrigin);
      workerPayload = { action:'public_subscribe', email:input.email.trim() };
    } else if (url.pathname === '/public/chat-log') {
      const fields = ['sessionId','language','page','question','route','tier','reason','matchedId','transcript'];
      const stringFields = ['language','page','question','route','reason','matchedId','transcript'];
      if (!input || Object.keys(input).some(k => !fields.includes(k)) || stringFields.some(k => input[k] !== undefined && typeof input[k] !== 'string') || typeof input.sessionId !== 'string' || !/^AH-[A-Z0-9-]{3,36}$/.test(input.sessionId) || typeof input.question !== 'string' || !input.question.trim() || input.question.length > 500 || !Number.isInteger(input.tier) || input.tier < 1 || input.tier > 3) return json({ error:'Invalid chat log' }, 400, allowedOrigin);
      workerPayload = { action:'public_chat_log', sessionId:input.sessionId, language:String(input.language || '').slice(0, 12), page:String(input.page || '').slice(0, 180), question:input.question.trim(), route:String(input.route || '').slice(0, 40), tier:input.tier, reason:String(input.reason || '').slice(0, 80), matchedId:String(input.matchedId || '').slice(0, 30), transcript:String(input.transcript || '').slice(0, 2500) };
    } else return json({ error:'Not found' }, 404, allowedOrigin);
    try {
      const ack = await forwardToGas(env, workerPayload);
      return json({ ok:true, ...ack }, 200, allowedOrigin);
    } catch {
      return json({ error:'Request could not be saved' }, 502, allowedOrigin);
    }
  }
  if (url.pathname === '/reviews' || url.pathname.startsWith('/reviews/') || url.pathname.startsWith('/review-media/')) return handleReviewRequest(request, url, env, allowedOrigin);
  if (url.pathname === '/request-orange-money' && request.method === 'POST') {
    if (env.ORDER_EMAIL_ENABLED !== '1' || !env.REVIEW_MEDIA || !env.RESEND_API_KEY || !env.MANUAL_ORDER_GAS_URL) return json({error:'Order requests are not configured'},503,allowedOrigin);
    const raw = await request.text();
    if (bodyExceedsLimit(request,raw,MAX_BODY_BYTES)) return json({error:'Request too large'},413,allowedOrigin);
    let input;
    try { input=JSON.parse(raw); } catch { return json({error:'Invalid request'},400,allowedOrigin); }
    if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'Invalid request'},400,allowedOrigin);
    const id=input.requestId, token=input.turnstileToken;
    if(!/^[a-f0-9-]{36}$/i.test(id||'') || typeof token!=='string') return json({error:'Invalid request'},400,allowedOrigin);
    if(!await verifyTurnstile(request,new Map([['turnstileToken',token]]),env,allowedOrigin,'order_request'))return json({error:'Please complete the security check'},403,allowedOrigin);
    delete input.requestId; delete input.turnstileToken;
    try {
      const catalogResponse=await fetch(env.CATALOG_URL);
      if(!catalogResponse.ok)throw new Error('Catalog unavailable');
      const checkout=normalizeCheckoutRequest(input,await catalogResponse.json(),env);
      if(checkout.countryCode!=='GW')return json({error:'Orange Money is only available in Guinea-Bissau'},422,allowedOrigin);
      const digest=crypto.createHash('sha256').update(JSON.stringify(checkout)).digest('hex');
      let order=await orderEmail.readOrder(env,id);
      if(order && (order.method!=='orange_money'||order.requestDigest!==digest))return json({error:'Request reference already used'},409,allowedOrigin);
      if(!order){
        order=orderEmail.snapshot(checkout,id,'orange_money');order.requestDigest=digest;
        // The private snapshot preserves the request even if accounting is temporarily unavailable.
        order.accountingStatus='attempted';order.status='recording_request';
        if(!await orderEmail.createOrder(env,order))return json({error:'Request is already being processed. Please retry.'},409,allowedOrigin);
        const mail=orderEmail.renderEmail(order);
        const accounting={type:'order',method:'orange_money',orderId:id,text:mail.text,customer:{...checkout.customer,zip:checkout.customer.postalCode},items:checkout.orderItems.map(i=>({...i,priceEur:i.unitCents/100})),fulfillmentMethod:'delivery',subtotalEur:checkout.subtotalCents/100,shippingEur:checkout.shippingCents/100,totalEur:checkout.totalCents/100,totalDiscountEur:checkout.discountCents/100,coupon:checkout.couponCode,currency:'EUR'};
        try {
          const response=await fetch(env.MANUAL_ORDER_GAS_URL,{method:'POST',headers:{'content-type':'text/plain;charset=utf-8'},body:JSON.stringify(accounting)});
          const ack=await response.json();order.accountingStatus=response.ok&&ack.ok?'recorded':'needs_review';
        }catch{order.accountingStatus='needs_review';}
        order.status='awaiting_payment';await orderEmail.writeOrder(env,order);
      }
      // Delivery failure must not tell a customer their already-persisted request was lost.
      let emailSent=false;try{await orderEmail.deliver(env,order);emailSent=true;}catch{console.error('Manual order email queued: '+id);}
      return json({ok:true,orderId:id,status:'awaiting_payment',emailSent},200,allowedOrigin);
    }catch{return json({error:'Unable to record the request'},502,allowedOrigin);}
  }
  if (url.pathname === '/shipping-quote') {
    if (request.method !== 'POST') return json({ error:'Method not allowed' }, 405, allowedOrigin);
    const raw = await request.text();
    if (bodyExceedsLimit(request, raw, 2_000)) return json({ error:'Request too large' }, 413, allowedOrigin);
    let input;
    try { input = JSON.parse(raw); } catch { return json({ error:'Invalid request' }, 400, allowedOrigin); }
    const allowedKeys = ['country', 'fulfillmentMethod'];
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowedKeys.includes(k)) || typeof input.country !== 'string') return json({ error:'Invalid request' }, 400, allowedOrigin);
    if (input.fulfillmentMethod !== undefined && typeof input.fulfillmentMethod !== 'string') return json({ error:'Invalid request' }, 400, allowedOrigin);
    try {
      const rate = shippingForCountry(input.country, input.fulfillmentMethod || 'delivery');
      const resData = {
        currency: 'EUR',
        countryCode: rate.countryCode,
        region: rate.region,
        shippingCents: rate.shippingCents,
        fulfillmentMethod: rate.fulfillmentMethod,
        method: rate.fulfillmentMethod,
      };
      if (rate.fulfillmentMethod === 'pickup') {
        resData.locationId = rate.locationId;
        resData.location = rate.location;
      }
      return json(resData, 200, allowedOrigin);
    } catch (err) {
      if (err.message === 'Invalid fulfillment method') return json({ error:'Invalid fulfillment method' }, 400, allowedOrigin);
      if (err.message === 'Pickup is only available in Portugal (PT)') return json({ error:err.message }, 422, allowedOrigin);
      return json({ error:'Shipping is not available to that destination at the listed rates.' }, 422, allowedOrigin);
    }
  }
  if (url.pathname !== '/create-checkout-session' || request.method !== 'POST') return json({ error:'Not found' }, 404, allowedOrigin);
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.WORKER_GAS_SECRET || !env.GAS_WEBHOOK_URL || !env.CATALOG_URL || !env.SITE_BASE_URL) return json({ error:'Checkout is not configured' }, 503, allowedOrigin);
  const mode = stripeMode(env);
  if (env.STRIPE_MODE !== undefined && (!mode || !stripeSecretMatchesMode(env.STRIPE_SECRET_KEY, mode))) return json({ error:'Checkout is not configured' }, 503, allowedOrigin);
  const raw = await request.text();
  if (bodyExceedsLimit(request, raw, MAX_BODY_BYTES)) return json({ error:'Request too large' }, 413, allowedOrigin);
  let input;
  try { input = JSON.parse(raw); } catch { return json({ error:'Invalid request' }, 400, allowedOrigin); }
  let orderId = '';
  let stage = 'catalog';
  try {
    const catalogResponse = await fetch(env.CATALOG_URL, { headers:{ accept:'application/json' } });
    if (!catalogResponse.ok) throw new Error('Catalog unavailable');
    stage = 'validate_cart';
    const checkout = normalizeCheckoutRequest(input, await catalogResponse.json(), env);
    orderId = crypto.randomUUID();
    if (env.ORDER_EMAIL_ENABLED === '1') {
      if (!env.REVIEW_MEDIA || !env.RESEND_API_KEY) throw new Error('Order notification setup incomplete');
      await orderEmail.writeOrder(env, orderEmail.snapshot(checkout, orderId));
    }
    const couponSummary = checkout.couponCode ? `Ambassador coupon: ${checkout.couponCode} | ` : '';
    const fulfillmentSummary = checkout.fulfillmentMethod === 'pickup'
      ? `Fulfillment: Pickup [${checkout.pickupLocationId}] ${checkout.pickupLocation}`
      : `Fulfillment: Delivery to ${checkout.fulfillmentAddress}`;
    const merchandiseSummary = checkout.lineItems.filter(x => x.price_data.product_data.name !== 'Shipping').map(x => `${x.quantity}x ${x.price_data.product_data.name}`).join(' | ');
    const itemsSummary = `${couponSummary}${fulfillmentSummary} | ${merchandiseSummary}`;
    stage = 'record_pending';
    await forwardToGas(env, {
      action: 'stripe_pending',
      orderId,
      customer: checkout.customer,
      fulfillmentMethod: checkout.fulfillmentMethod,
      pickupLocationId: checkout.fulfillmentMethod === 'pickup' ? checkout.pickupLocationId : '',
      pickupLocation: checkout.fulfillmentMethod === 'pickup' ? checkout.pickupLocation : '',
      fulfillmentAddress: checkout.fulfillmentAddress,
      itemsSummary: itemsSummary.slice(0, 450),
      orderItems: checkout.orderItems,
      expectedTotalCents: checkout.totalCents,
      subtotalCents: checkout.subtotalCents,
      discountCents: checkout.discountCents,
      shippingCents: checkout.shippingCents,
      couponCode: checkout.couponCode,
      currency: 'EUR',
    });
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('locale', checkout.language);
    params.set('metadata[order_language]', checkout.language);
    params.set('success_url', `${env.SITE_BASE_URL}/checkout.html?payment=success&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${env.SITE_BASE_URL}/checkout.html?payment=cancelled&order_id=${orderId}`);
    params.set('customer_email', checkout.customer.email);
    params.set('client_reference_id', orderId);
    params.set('billing_address_collection', 'auto');
    if (checkout.fulfillmentMethod === 'delivery') {
      checkout.allowedCountries.forEach(country => params.append('shipping_address_collection[allowed_countries][]', country));
    }
    if (checkout.couponCode) {
      params.set('metadata[ambassador_code]', checkout.couponCode);
      params.set('metadata[coupon_discount_cents]', String(checkout.discountCents));
      params.set('payment_intent_data[metadata][ambassador_code]', checkout.couponCode);
      params.set('payment_intent_data[metadata][coupon_discount_cents]', String(checkout.discountCents));
    }
    params.set('metadata[order_id]', orderId);
    params.set('metadata[currency]', 'EUR');
    params.set('metadata[expected_total_cents]', String(checkout.totalCents));
    params.set('metadata[shipping_cents]', String(checkout.shippingCents));
    params.set('metadata[shipping_country]', checkout.countryCode);
    params.set('metadata[shipping_region]', checkout.shippingRegion);
    params.set('metadata[fulfillment_method]', checkout.fulfillmentMethod);
    params.set('metadata[fulfillment_address]', checkout.fulfillmentAddress);
    if (checkout.fulfillmentMethod === 'pickup') {
      params.set('metadata[pickup_location_id]', checkout.pickupLocationId);
      params.set('metadata[pickup_location]', checkout.pickupLocation);
    }
    params.set('metadata[items_summary]', itemsSummary.slice(0, 450));
    params.set('payment_intent_data[metadata][order_id]', orderId);
    params.set('payment_intent_data[metadata][expected_total_cents]', String(checkout.totalCents));
    params.set('payment_intent_data[metadata][shipping_cents]', String(checkout.shippingCents));
    params.set('payment_intent_data[metadata][shipping_country]', checkout.countryCode);
    params.set('payment_intent_data[metadata][fulfillment_method]', checkout.fulfillmentMethod);
    params.set('payment_intent_data[metadata][fulfillment_address]', checkout.fulfillmentAddress);
    if (checkout.fulfillmentMethod === 'pickup') {
      params.set('payment_intent_data[metadata][pickup_location_id]', checkout.pickupLocationId);
      params.set('payment_intent_data[metadata][pickup_location]', checkout.pickupLocation);
    }
    discountCheckoutLineItems(checkout).forEach((item, i) => {
      params.set(`line_items[${i}][price_data][currency]`, item.price_data.currency);
      params.set(`line_items[${i}][price_data][unit_amount]`, String(item.price_data.unit_amount));
      params.set(`line_items[${i}][price_data][product_data][name]`, item.price_data.product_data.name);
      params.set(`line_items[${i}][quantity]`, String(item.quantity));
    });
    stage = 'create_stripe_session';
    const session = await stripePost('checkout/sessions', params, env.STRIPE_SECRET_KEY, `asheerah-${orderId}`);
    if (env.ORDER_EMAIL_ENABLED === '1') {
      const notification = await orderEmail.readOrder(env, orderId);
      notification.sessionId = session.id;
      await orderEmail.writeOrder(env, notification);
    }
    stage = 'record_session';
    await forwardToGas(env, { action:'stripe_session_created', orderId, sessionId:session.id });
    return json({ checkoutUrl:session.url, orderId }, 200, allowedOrigin);
  } catch (err) {
    if (orderId) {
      try { await forwardToGas(env, { action:'stripe_checkout_failed', orderId }); } catch {}
    }
    if (err.message === 'Shipping rate is not configured for this destination') return json({ error:'Shipping is not available to that destination at the listed rates.' }, 422, allowedOrigin);
    return json({ error:'Unable to start secure checkout', ...(env.CHECKOUT_DIAGNOSTIC === '1' ? { stage, reason:err.diagnostic || 'unclassified' } : {}) }, 502, allowedOrigin);
  }
}
module.exports = { EU_COUNTRIES, EUROPE_COUNTRIES, PICKUP_LOCATION, AMBASSADOR_COUPONS, EUROPE_SHIPPING_CENTS, EU_SHIPPING_CENTS, INTL_SHIPPING_CENTS, PICKUP_SHIPPING_CENTS, COUNTRY_ENTRIES, shippingForCountry, normalizeCheckoutRequest, verifyStripeSignature, handleRequest, fetch: handleRequest };
