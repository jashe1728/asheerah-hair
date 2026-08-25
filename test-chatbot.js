const assert = require('node:assert/strict');
const fs = require('node:fs');
const bot = require('./assets/js/chatbot.js');

const knowledge = JSON.parse(fs.readFileSync('./assets/data/chatbot-kb.json','utf8'));
const locales = JSON.parse(fs.readFileSync('./assets/data/chatbot-locales.json','utf8'));
bot.CHAT_STATE.entries = knowledge.entries;
bot.CHAT_STATE.locales = locales;

const paymentQuestions = {
  en: 'How can I pay?',
  pt: 'Como posso pagar?',
  es: '¿Cómo puedo pagar?',
  de: 'Wie kann ich bezahlen?',
  fr: 'Comment puis-je payer ?',
  it: 'Come posso pagare?'
};

for (const [language, question] of Object.entries(paymentQuestions)) {
  global.LANG = language;
  const result = bot.chatRoute(question);
  assert.equal(result.matchedId, 'PAY07', `${language} payment question`);
  assert.equal(result.kind, 'answer', `${language} payment answer tier`);
  assert.ok(result.reply.length > 10, `${language} payment answer text`);
}

global.LANG = 'en';
assert.equal(bot.chatRoute('What type of hair do you sell?').matchedId,'P03');
assert.equal(bot.chatRoute('How do I contact you?').matchedId,'O23');
assert.equal(bot.chatRoute('Hello').reason,'greeting');
assert.equal(bot.chatRoute('How much is this?').kind,'answer_and_handoff');
assert.equal(bot.chatRoute('My order arrived damaged').reason,'human_only_signal');
assert.equal(bot.chatRoute('Can you recommend a stylist?').reason,'low_confidence');

global.LANG = 'pt';
assert.equal(bot.chatRoute('Quanto custa esta peruca?').kind,'answer_and_handoff');
assert.equal(bot.chatRoute('A minha encomenda chegou danificada').kind,'handoff');

global.LANG = 'fr';
assert.equal(bot.chatRoute('Bonjour').reason,'greeting');
assert.equal(bot.chatRoute('Ma commande est endommagée').kind,'handoff');

global.LANG = 'es';
assert.equal(bot.chatRoute('Quiero un color personalizado').kind,'answer_and_handoff');

global.LANG = 'it';
assert.equal(bot.chatRoute('Vorrei un colore personalizzato').kind,'answer_and_handoff');

console.log('All multilingual chatbot routing tests passed.');
