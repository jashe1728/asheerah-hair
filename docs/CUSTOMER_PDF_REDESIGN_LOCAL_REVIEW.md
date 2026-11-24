# Local customer PDF review - approval pending

Base: `e1a56cb0186b7b0058dce71da78164d33fede8a5`, confirmed against GitHub main by read-only `git ls-remote`. Branch: `t3/redesign-customer-pdfs`.

Isolated workspace: `C:\Users\PC\.t3\worktrees\asheerah-hair\t3-ef7d23fb-0c92128710e7df15`.

## Production inventory (before implementation)

| Attachment path | Payment / fulfillment states | Local treatment |
| --- | --- | --- |
| `order-email.cjs: makePdf -> order-email-design.cjs: pdf`, called by `deliver` | Stripe paid delivery and PT pickup; Orange Money awaiting payment (GW delivery) | Redesigned PDF shell and body styling only |
| `manual-paid-email.cjs: preparePaidEmail -> makePdf` | Explicitly confirmed manual payment, delivery or pickup; stored order remains awaiting payment, paid presentation uses the approved snapshot | Same redesigned PDF, provider-neutral wording and no checkout ETA |
| `dashboard-customer-email.cjs: render -> dashboard-customer-pdf.cjs: makeCustomerPdf` | Paid summary, tracking, correction; delivery and pickup | Already-approved brand reference; unchanged, examples regenerated |
| `gestao/supplier-pdf.js` | Supplier preparation / delivery export | Exactly unchanged, including supplier workflow |

Automatic order delivery and retries retain the one PDF attachment, short-reference filename, reply address, order details, coupon, totals and fulfillment information. Dashboard emails retain their PDF plus CID logo attachment and carrier URL/code/instructions. Six locales are PT, EN, ES, FR, DE and IT. Pending checkout / failed checkout are not customer receipt states and remain unable to trigger delivery. Dashboard receipt cutover is not enabled by this change.

## Visual implementation

The order PDF uses the actual existing tracking writer and embedded logo image: 112pt logo at (36,710), 34pt Times-Italic brand title at (180,765), localized gold tagline at (182,735), rule at y=694, ivory background and carob text. These repeat on every page. The body retains document-specific headings, status, total-paid / total-due wording, customer details, numeric item table, next steps, payment instructions and notes. Heavy solid bars are replaced with pale cards and gold rules. Awaiting payment uses a gold accent; paid uses carob.

NFC accents, inch/foot marks, nonbreaking spaces and minus signs normalize for WinAnsi. Unsupported emoji/non-Latin characters still fall back to `?` in automatic PDFs, so receipt generation cannot fail on these inputs. This is the existing limited font coverage, not full Unicode support. The Times-Italic title is Standard 14, matching tracking; no new font files or dependencies are added to the Worker.

## Review artifacts

Directory: `C:\Users\PC\.t3\worktrees\asheerah-hair\t3-ef7d23fb-0c92128710e7df15\output\pdf\customer-redesign`.

Open `index.html` for links to every PDF and every PNG page. `manifest.json` records absolute PDF paths, PNG prefixes, page counts, real attachment filenames and SHA-256 hashes. Contact sheets `contact-1.png` through `contact-5.png` cover every rendered page.

46 PDFs / 49 rendered pages: 36 automatic order cases (six payment/fulfillment variants in six languages, including a paid Orange Money edge case); six dashboard receipt/tracking/correction cases (delivery and pickup); one four-page 26-item/long-note stress example; one French encoding example; one single-item/no-notes example; one test-mode example. All customer names, emails, addresses, order references, items and tracking codes are fictional. Fixed brand/support and Orange Money merchant payment instructions remain the actual production template content.

Preview generator `node backend/preview-customer-pdfs.cjs` exercises actual `deliver` with provider HTTP intercepted in memory, actual manual payment approval/sealing with in-memory storage, and actual dashboard attachment `render`. It never sends email. Every automatic attachment is compared byte-for-byte to `makePdf` for the same fictional snapshot. Dashboard attachments use their unchanged actual generator.

Render command per manifest entry: `pdftoppm -scale-to 1100 -png <pdf> <pngPrefix>`. Local MiKTeX required initialization outside the sandbox and warned about unused Symbol/ArialUnicode display fonts; Latin text, currency, logo and brand title render correctly. All pages were visually inspected on contact sheets, with selected full-size pages inspected separately. All standard two-item examples now fit on one page; long notes paginate rather than shrink or truncate text. The title and subtitle align left. Quantity, unit price and total headers and values share right edges in all six locales; the date shares the totals right edge.

## Validation and boundaries

- `node --test tests/*.test.cjs`: 422 passed, zero failed. Log: `tests-all.txt` in the artifact directory.
- Targeted checks cover exact provider PDF bytes, filenames, payment semantics, pickup/manual ETA rules, all six locales, encoding, multipage logo/font repetition, text margins/footer bounds, and numeric header/value alignment. New tests use output behavior rather than commit hashes. Supplier/email markup/operational source immutability was verified separately with read-only git comparisons, keeping release-specific evidence out of permanent tests.
- Safe Worker build: `wrangler deploy --dry-run --config backend/wrangler.toml --outdir output/pdf/customer-redesign/worker-dry-run`. Success: 1158.34 KiB raw / 698.74 KiB gzip, ending `--dry-run: exiting now.` Log: `worker-dry-run.txt`. This only bundled local code; no Worker request, scheduler, R2 access or deployment was executed.
- Existing sealed/prepared retry payloads are intentionally unchanged and keep their original PDF bytes. Only newly prepared PDFs would acquire this design after a separately approved release.
- No customer data accessed, email sent, automation enabled, commit, push or deployment performed. Dirty root and existing tracking worktree were not modified.

## Final audit snapshot

The first Neon audit found unnecessary second pages, subtitle alignment and numeric alignment issues. Those findings are fixed. Pending Orange Money instructions now remain with the status in a gold-accented payment card on page 1. Paid Orange Money omits recipient/payment-due instructions; both states have regression coverage across all six locales. Single-item/no-notes and test-mode previews were added.

The final code, tests, PDFs, PNGs, index and evidence are frozen in `frozen-snapshot.json` in the artifact directory. A fresh read-only Neon audit is requested against those exact hashes. No snapshot files are to be changed during that audit.

STOP: user must review examples and explicitly approve before any shipping. Local visual approval is not deployment approval.
