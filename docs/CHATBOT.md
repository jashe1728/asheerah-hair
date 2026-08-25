# Website chatbot

The chatbot answers approved FAQs on the static website and hands pricing, customization, stock, customs, installment, complaints, damaged/wrong items, and unknown questions to the owner through WhatsApp.

## Trust rules

- It uses deterministic phrase matching. There is no generative AI and no invented answer.
- Human-only complaint and damage phrases are checked before FAQ matching.
- An answer is usable only when its knowledge-base row has `status: "approved"` and a non-empty answer.
- A close or weak match hands off instead of guessing.
- The WhatsApp button carries a session reference, current page, question, and recent transcript.
- The bot never claims a WhatsApp message was sent; the visitor must tap and send it.

## Three tiers

- **T1:** sends the approved answer.
- **T2:** sends general information and offers a WhatsApp handoff for owner confirmation.
- **T3:** gives no policy judgement or troubleshooting; it offers an immediate WhatsApp handoff.

## Files

- `assets/data/chatbot-kb.json` — live knowledge base.
- `assets/js/chatbot.js` — routing, UI behavior, transcript handoff, and logging.
- `assets/css/styles.css` — existing widget styles plus handoff and accessibility rules.
- `backend/Code.gs` — optional `Chatbot Log` sheet and one owner email alert per chat session.
- `docs/chatbot-knowledge-base-template.csv` — owner review sheet for the eight business buckets.
- `test-chatbot.js` — routing regression tests.

## Owner maintenance

1. Review `docs/chatbot-knowledge-base-template.csv` in Excel or Google Sheets.
2. Correct an answer in the owner's natural words.
3. Verify every product, policy, delivery, price, and availability claim.
4. Ask the person maintaining the website to copy the approved wording into `assets/data/chatbot-kb.json`.
5. Set `status` to `approved` only after review. A blank/unapproved row always hands off.
6. Run `node test-chatbot.js`, then try the exact customer wording on the website.

## Logging setup

The frontend already posts T2/T3 and unknown routes to `CONFIG.backendURL`. To activate the new log branch, update the existing Apps Script project with `backend/Code.gs` and deploy a new web-app version. It creates a private `Chatbot Log` sheet and emails the owner once per website-chat session.

The log contains the website question and recent chatbot transcript. Do not use the website chat to collect card information, PINs, passwords, security codes, complaint photos, addresses, or other unnecessary personal data.

## Weekly 20-minute review

1. Filter the `Chatbot Log` sheet to `Needs review`.
2. Group repeated questions.
3. Pick at most three high-frequency questions to improve.
4. Add trigger wording to an existing row whenever possible; add a new answer only when necessary.
5. Test the original wording plus two variations.
6. Mark the log row reviewed and delete logs older than 30 days.

Measure T1 answers, T2 confirmations, and T3/unknown handoffs. A safe handoff counts as success; never raise coverage by approving an uncertain answer.

## Owner decision still needed

The published policy pages conflict on damaged-item timing: `pages/returns.html` says seven days, while `pages/shipping.html` says 48 hours. The chatbot deliberately states no deadline and sends damaged/wrong items to the owner until one policy is chosen and both pages are aligned.

