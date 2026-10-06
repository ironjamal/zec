# ZEC

**Built with intent.**

ZEC designs websites, digital products, platforms and custom systems around real business workflows.

## Build targets

- `npm run build` — builds the Vercel site to `dist/` with an empty `BASE_PATH` and `https://zeceg.vercel.app` as `SITE_URL`.
- `npm run build:github-pages` — builds the GitHub Pages project site to `dist/` with `BASE_PATH=/zec` and `SITE_URL=https://ironjamal.github.io/zec`.
- `npm run check` and `npm run check:github-pages` — validate page metadata, schemas, sitemap, local links, base paths and placeholders for the corresponding target.
- `npm test` — run the built-in Node.js tests for the contact endpoint.

The source is dependency-free. Edit `data/services.json`, `data/site-config.json` and the shared templates, then run the appropriate target build. Environment variables `SITE_URL` and `BASE_PATH` can override the selected target for local checks.

## Routing and deployment

Both targets publish folder `index.html` routes, so `/services` and its service paths resolve without rewrites. Vercel uses `dist/` with `trailingSlash: false`; `cleanUrls` is disabled because routes are represented by folders. GitHub Pages uses the same folder structure under `/zec`; `.nojekyll` is included. The GitHub Actions workflow builds and deploys the Pages target on pushes to `main`.

## Pages

- `/` — ZEC homepage
- `/start` — project enquiry form
- `/services` — service directory
- Seven service pages under `/services/`
- `/404.html` — branded not-found page

## Configuration

Public content and all business details still awaiting confirmation live in `data/site-config.json` under `confirm`. Replace each visible `[CONFIRM: ...]` value before launch. This includes the reply-time promise, budget ranges, price floor and currency, timelines, fit notes, founder/team details, location/timezone, work samples and the e-commerce offer placement. WhatsApp is disabled by default. The homepage currently shows two clearly labelled sample placeholders, not client work.

The `/start` page posts to the Vercel Function at `/api/start`. The function validates the submission server-side, rejects a filled honeypot, and does not accept submissions until `confirm.REPLY_TIME` has been replaced with a confirmed value.

Configure one delivery method in the Vercel project environment:

- **Resend email:** set `RESEND_API_KEY`, `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL`. The endpoint emails the enquiry to `CONTACT_TO_EMAIL` and sends the configured three-step auto-reply to the person who submitted it.
- **Webhook:** set `CONTACT_WEBHOOK_URL`; optionally set `CONTACT_WEBHOOK_TOKEN` for a bearer token. The webhook receives the enquiry and an `autoReply` object containing the configured subject and message.

`.env.example` lists the variable names only. Keep actual values in local ignored environment files or the Vercel environment settings. The public email shown on the site is configured separately as `contact.email` in `data/site-config.json`.

**TODO for webhook-only delivery:** configure the receiving webhook to send the supplied `autoReply` email. The site includes the template in the webhook payload, but the webhook provider must send it. The Resend delivery option sends the auto-reply directly.

The GitHub Pages build publishes static files only; it cannot run `/api/start`. Use the Vercel deployment to test form submission. The existing GitHub Actions Pages workflow deploys only on pushes to `main`.
