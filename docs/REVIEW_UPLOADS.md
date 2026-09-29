# Asheerah Hair review photo/video uploads

## Current state

The storefront code and Worker endpoints are prepared locally. Uploads are not live until the R2 bucket, Turnstile, Worker deployment, and public `config.js` settings below are completed. The R2 bucket is private; files are served through the Worker. New reviews are hidden until manually approved.

Limits: up to 3 attachments per review, JPEG/PNG/WebP images or MP4/WebM videos, 8 MiB per file and 20 MiB combined. The browser and Worker both enforce the limits; the Worker also checks file signatures and requires Turnstile verification.

## Cloudflare owner setup

Run from `backend/` after signing in to the correct Cloudflare account with `npx wrangler login`:

1. Create the bucket declared in `wrangler.toml`:
   `npx wrangler r2 bucket create asheerah-hair-review-media`
2. Create a Turnstile widget allowing `asheerahhair.com`, `www.asheerahhair.com`, and `jashe1728.github.io`. Keep the secret key out of the repository and chat.
3. Set Worker secrets directly in Cloudflare:
   `npx wrangler secret put TURNSTILE_SECRET`
   `npx wrangler secret put REVIEW_ADMIN_TOKEN`
   Generate a strong admin token and keep a copy in the owner's password manager for moderation. Never put either value in `config.js`.
4. Deploy the Worker:
   `npx wrangler deploy`
5. Copy the deployed Worker base URL into `config.js` as `reviewAPIURL`, and the Turnstile **site key** (public key) as `reviewTurnstileSiteKey`. These are public values; do not put the Turnstile secret in the site.
6. Publish the site through GitHub Pages after review. Confirm the deployed product page loads approved reviews and the attachment control is enabled. Test an upload, confirm it remains hidden, approve it, then verify it appears publicly.

The review routes work independently of Stripe checkout, but the Worker must allow both storefront origins in `SITE_ORIGINS`. Do not enable live payments as part of this setup.

## Manual moderation

Use the Worker URL and admin token in the owner's secure local shell; never send the token in chat. Every moderation API call must include the storefront `Origin` header.

List pending submissions:

```sh
curl -sS -H 'Origin: https://asheerahhair.com' \
  -H "Authorization: Bearer $REVIEW_ADMIN_TOKEN" \
  "$REVIEW_API_URL/reviews/pending"
```

The response includes each review ID, product, name, rating, text, and private R2 media keys. To inspect a pending file, URL-encode its media key and download it with the same authorization header:

```sh
MEDIA_PATH=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$MEDIA_KEY")
curl -sS -H 'Origin: https://asheerahhair.com' \
  -H "Authorization: Bearer $REVIEW_ADMIN_TOKEN" \
  "$REVIEW_API_URL/review-media/$MEDIA_PATH" -o review-media-preview
```

Approve or reject by ID:

```sh
curl -sS -X POST -H 'Origin: https://asheerahhair.com' \
  -H "Authorization: Bearer $REVIEW_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"reviewId":"<review-id>","decision":"approve"}' \
  "$REVIEW_API_URL/reviews/moderate"
```

Use `"decision":"reject"` to reject. Only approved reviews/media are public. Store the admin token in a password manager and restrict it to the site owner.

## Safety and limits

- Review text and the submitter-provided display name become public after approval. The site does not request an email address for reviews.
- Rejected media is deleted by the Worker; rejected review metadata is currently retained in the private bucket. Confirm a retention policy before accepting real customer submissions.
- The Worker requires anti-bot verification and strict allowed origins; this is not a substitute for monitoring R2 usage and reviewing suspicious submissions.
- `config.js` currently leaves `reviewAPIURL` and `reviewTurnstileSiteKey` blank, so the upload control remains disabled until setup is complete.
- A local test pass does not prove the bucket, Turnstile widget, secrets, Worker deployment, or public site have been configured. Verify each live component separately.
