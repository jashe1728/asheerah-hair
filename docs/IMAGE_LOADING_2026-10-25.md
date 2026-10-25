# Image loading investigation - 25 October 2026

Customers reported broken images on phones, without a specific page or device. All 100 unique image addresses collected from the catalogue and main storefront pages returned HTTP 200 with image content types. The homepage banner and Chocolate Caramel gallery decoded in the browser at a 390px viewport. A broken image was not reproduced; the customer-specific cause remains unconfirmed.

The Chocolate Caramel gallery used the complete 7.42 MB and 7.63 MB PNG files as small thumbnail images. Both thumbnails become visible near the initial gallery, so viewing the product could download both complete files before the customer selects them. Dedicated 192px PNG thumbnails now total 273,386 bytes, instead of 15,054,420 bytes (98.2% less). Selecting a thumbnail still opens the complete photograph.

Complete photographs have new versioned PNG copies, using lossless compression. Their dimensions, decoded RGBA pixels and transparency were compared to the originals and are identical. Sizes changed from 7,421,978 to 4,470,479 bytes, and 7,632,442 to 4,918,305 bytes. Original URLs remain available for existing carts, old orders and rollback.

The mobile-only banner now uses a progressive JPEG at the original 1086 x 1448 dimensions, quality 94, without cropping or replacing the model. Size changed from 2,095,932 to 385,079 bytes (81.6% less). The original mobile PNG and desktop artwork remain available; the desktop source is unchanged.

Changes are limited to image assets, two catalogue image references, the mobile picture source, thumbnail rendering and the product-page script cache version. The catalogue was compared structurally after reversing the two image-path substitutions: every other field, including prices and options, is unchanged. No backend, checkout, webhook, secret, DNS, Cloudflare configuration or monitoring change is included.

Verification: 222 Node tests passed. Browser checks confirmed dedicated thumbnail loads, selection of all three complete images and return to the first image. No charge or real order mutation was performed. Publication and live asset checks are verified separately after deployment. These changes reduce a confirmed loading bottleneck; they do not prove the original customer report was caused by image weight.

Rollback: restore the previous index.html, product.html, catalogue image paths and thumbnail rendering from parent 26023f5. Originals are retained, so no image recovery or payment-service deployment is required.
