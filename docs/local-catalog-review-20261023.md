# Local catalog review — 23 October 2026

## Publication boundary

Only the existing P6/27 media and portrait fitting were published: fb35eb7 and 5e1f84e. Existing prices are unchanged. GitHub Pages reported successful deployment; the live product cover, video source and image fitting were verified in the browser.

Shelton authorized publishing both new wigs on 23 October 2026, explicitly without image expansion. Publish the six original product photos and Chocolate video; leave generated expansions and unrelated source/preview files untracked. The contact bubble was already published separately.

## Local previews

- http://127.0.0.1:8767/product.html?h=chocolate-caramel-highlight-wig
- http://127.0.0.1:8767/product.html?h=x-onika-ginger-bombshell

Both have the supplied model photo first, 200% density only, and HD 5x5/13x4 lace. Chocolate has 16–28 inch options, with 20 and 5x5 marked modelo. Ginger has 26 and 13x4 marked modelo. Ginger uses the available L3 source-table lengths, 16–40 inches, following the original instruction without importing Chocolate's 16–28 restriction.

Chocolate's supplied MOV is converted to H.264/AAC MP4 with faststart, about 7.9 MB instead of 81.4 MB. P6/27's supplied MP4 is remuxed with faststart. No clearly identified Ginger video was found in Downloads. Do not substitute the unrelated Burmese bundles video.

## Price provenance

Read-only source: OneDrive/Desktop/Business/Asheerah Hair/Cópia de NEW_4_l3_ponytail_halfwig_update.xlsx.

- Chocolate: Colored Wig-Bundle Pricelist, L1 HD5x5/13x4 200%, M15:N21, minimum selling prices. EUR238.99–382.99.
- Ginger: same sheet, L3 HD5x5/13x4 200%, E15:F27, minimum selling prices PLUS EUR20 per variant. EUR229.99–589.99.
- P6/27: Crochet Price Table, colored 100/200/300g, K13:M16. Existing catalog prices already match exactly.
- New wigs have no invented strike-through price or discount. Source workbook was not modified or recalculated; saved table values were extracted.

## Implementation and verification

New product model_options annotate visible options without changing canonical option values. Catalog variants still carry cap size through existing cart matching. New prices/products are now authorized for release. Preserve the canonical option values and translated model labels.

Contact bubble files: assets/js/contact-bubbles.js and assets/css/contact-bubbles.css. Three official channels use the existing public contact links. The existing assistant remains separate. The menu supports outside-click/Escape dismissal, aria-expanded, inert collapsed links and reduced-motion preference. Desktop and 390px mobile inspected; no horizontal overflow observed.

98 Node tests pass, including all new wig variant prices and restrictions. Existing tests were adjusted for the new model label dependency and catalog additions. Production payment/backend configuration was not modified. Browser verification did not submit purchases or reviews.
