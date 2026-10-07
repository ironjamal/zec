# ZEC

**Built with intent.**

ZEC designs websites, digital products, platforms and custom systems around real business workflows.

## Build targets

- `npm run build` — builds the Vercel site to `dist/` with an empty `BASE_PATH` and `https://zeceg.vercel.app` as `SITE_URL`.
- `npm run build:github-pages` — builds the GitHub Pages project site to `dist/` with `BASE_PATH=/zec` and `SITE_URL=https://ironjamal.github.io/zec`.
- `npm run check` and `npm run check:github-pages` — validate page metadata, schemas, sitemap, local links, base paths and placeholders for the corresponding target.
- `npm run lint` — dependency-free syntax checks for JavaScript, inline scripts, JSON and CSS block structure.
- `npm test` — run the built-in Node.js tests for the contact endpoint.

The source is dependency-free. Edit `data/services.json`, `data/site-config.json` and the shared templates, then run the appropriate target build. Environment variables `SITE_URL` and `BASE_PATH` can override the selected target for local checks.

## Routing and deployment

Both targets publish folder `index.html` routes, so `/services` and its service paths resolve without rewrites. Vercel uses `dist/` with `trailingSlash: false`; `cleanUrls` is disabled because routes are represented by folders. GitHub Pages uses the same folder structure under `/zec`; `.nojekyll` is included. The GitHub Actions workflow builds and deploys the Pages target on pushes to `main`.

## Pages

- `/` — ZEC homepage
- `/start` — project enquiry form
- `/services` — service directory
- Seven service pages under `/services/`
- `/samples/project-brief` and `/samples/page-map` — illustrative HTML deliverable previews
- `/404.html` — branded not-found page

## Configuration

The homepage has nine sections. Its four situations, three offers and six process stages are grouped in `data/site-config.json` under `homepage`; the seven existing service URLs remain available as depth pages grouped below the offers on `/services`. Offer links carry a `type` query value to preselect the matching project type on `/start`. The Work navigation label reads “Samples” until at least two non-placeholder proof items are configured.

Public contact, pricing, timelines, fit notes, founder/team details and location are configured in `data/site-config.json`. WhatsApp is enabled with the supplied Egyptian mobile number; the site converts its leading zero to Egypt's `20` country code for the wa.me link. The two sample deliverables are generic planning examples, clearly labeled as illustrative and not client work.

`npm run lint` uses Node.js built-ins so the project stays dependency-free. It checks JavaScript and inline-script syntax, parses the JSON data files, and checks CSS comments, strings and block braces. It is a syntax and structure check, not a stylistic ESLint rule set.

The `/start` page posts to the Vercel Function at `/api/start`. The function validates the submission server-side, rejects a filled honeypot, and does not accept submissions until `confirm.REPLY_TIME` has been replaced with a confirmed value.

Configure one delivery method in the Vercel project environment:

- **Resend email:** set `RESEND_API_KEY`, `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL`. The endpoint emails the enquiry to `CONTACT_TO_EMAIL` and sends the configured three-step auto-reply to the person who submitted it.
- **Webhook:** set `CONTACT_WEBHOOK_URL`; optionally set `CONTACT_WEBHOOK_TOKEN` for a bearer token. The webhook receives the enquiry and an `autoReply` object containing the configured subject and message.

`.env.example` lists the variable names only. Keep actual values in local ignored environment files or the Vercel environment settings. The public email shown on the site is configured separately as `contact.email` in `data/site-config.json`.

**TODO for webhook-only delivery:** configure the receiving webhook to send the supplied `autoReply` email. The site includes the template in the webhook payload, but the webhook provider must send it. The Resend delivery option sends the auto-reply directly.

The GitHub Pages build publishes static files only; it cannot run `/api/start`. Use the Vercel deployment to test form submission. The existing GitHub Actions Pages workflow deploys only on pushes to `main`.
