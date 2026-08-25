const assert = require('node:assert/strict');
const fs = require('node:fs');
const bot = require('./assets/js/chatbot.js');

bot.CHAT_STATE.entries = [
  {id:'PAY07',tier:1,status:'approved',answer:'Safe payment answer',triggers:['payment','paypal','mb way']},
  {id:'PR05',tier:2,status:'approved',answer:'General price answer',triggers:['price','how much']},
  {id:'S09',tier:1,status:'needs_owner_approval',answer:'Worldwide',triggers:['ship worldwide','ship to']}
];

assert.equal(bot.chatRoute('Can I pay with PayPal?').kind,'answer');
assert.equal(bot.chatRoute('How much is this?').kind,'answer_and_handoff');
assert.equal(bot.chatRoute('My order arrived damaged').reason,'human_only_signal');
assert.equal(bot.chatRoute('Do you ship worldwide?').reason,'answer_not_approved');
assert.equal(bot.chatRoute('Can you recommend a stylist?').reason,'low_confidence');

bot.CHAT_STATE.entries = JSON.parse(fs.readFileSync('./assets/data/chatbot-kb.json','utf8')).entries;
assert.equal(bot.chatRoute('What type of hair do you sell?').matchedId,'P03');
assert.equal(bot.chatRoute('How do I contact you?').matchedId,'O23');
assert.equal(bot.chatRoute('Hello').reason,'greeting');
console.log('All chatbot routing tests passed.');
