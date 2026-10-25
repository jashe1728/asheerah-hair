# Lossless image delivery - 25 October 2026

Owner requirement: reduce file sizes without changing the photographs, appearance or quality. No resizing, cropping, recolouring or lossy re-encoding is included in this release.

Seven existing images have smaller lossless WebP display copies. Their combined file size is reduced from 21,538,562 to 13,098,548 bytes (39.2%). This is a sum of individual assets, not the payload of one page.

| Image | Original bytes | Optimized bytes |
| --- | ---: | ---: |
| Chocolate Caramel gallery 2 | 4,470,479 | 2,722,946 |
| Chocolate Caramel gallery 3 | 4,918,305 | 2,969,608 |
| Water Curly crochet desktop | 2,911,601 | 1,757,564 |
| Water Wave crochet desktop | 2,772,791 | 1,644,832 |
| Burmese Curly crochet desktop | 2,314,575 | 1,468,560 |
| Pixie Curly crochet desktop | 2,264,234 | 1,414,064 |
| Desktop banner | 1,886,577 | 1,120,974 |

Each chosen image was decoded and compared against the source: dimensions and every RGBA byte are identical, including alpha. ICC profiles were compared; the source files contain no additional gamma/chromaticity/sRGB chunks requiring interpretation changes. The three X_Onika images and P6/27 JPEG were tested but preserved because the attempted lossless alternatives were larger. Additional lossless PNG attempts on X_Onika were also larger and discarded.

Original URLs and files remain available. The catalogue is unchanged. A small display-only module chooses optimized copies when the browser supports the format, and restores the original if an optimized image fails. Picture-source recovery preserves the desktop artwork rather than replacing it with a different mobile image. Original order/cart image identifiers are not rewritten. Existing gallery thumbnails remain in place.

Application changes are limited to the selected gallery image URL and desktop crochet picture-source URL. Index, shop and product pages load the display module before the app, with versioned asset references. The desktop banner has a native WebP source with the original PNG fallback. Mobile artwork, layouts, text, CSS, product options, prices, checkout, backend, webhook, Cloudflare configuration and provider secrets are unchanged.

Verification includes the existing regression suite plus format-support, blocked-canvas, failure-recovery and picture-source tests. Browser verification checks desktop crochet sources, the unchanged mobile sources and gallery selection. Unit tests do not constitute a real charged-purchase test. Live hosting checks are performed after publication. Rollback can restore the previous HTML/script references; all original image assets are retained.
