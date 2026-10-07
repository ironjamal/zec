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

The `/start` page posts to the Vercel Function at `/api/start`. The function validates each submission server-side, requires a client phone or WhatsApp number, rejects a filled honeypot, and appends valid enquiries to Google Sheets. It does not accept submissions until `confirm.REPLY_TIME` has a confirmed value.

## Google Sheets setup

The form uses a Google service account from the Vercel Function. Enable the Google Sheets API in a Google Cloud project, create a service account and JSON key, then share the destination spreadsheet with the service account email as an Editor. Google documents the [service account setup](https://developers.google.com/identity/protocols/oauth2/service-account) and the [Sheets append API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append).

Create a tab named `Enquiries` (or set another name in `GOOGLE_SHEETS_TAB_NAME`) and add these headers in row 1, in this order:

`submitted_at`, `project_type`, `project_type_label`, `description`, `name`, `email`, `budget`, `budget_label`, `business_name`, `website`, `timeline`, `client_number`.

Add these server-side environment variables to the Vercel Preview and Production environments:

- `GOOGLE_SHEETS_SPREADSHEET_ID` — the ID between `/d/` and `/edit` in the spreadsheet URL.
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` — the service account email from its JSON key.
- `GOOGLE_SHEETS_PRIVATE_KEY` — the `private_key` value from that JSON key. Store it as a Vercel Secret; preserve the PEM content and line breaks. Never prefix it with `NEXT_PUBLIC_` or commit the JSON key.
- `GOOGLE_SHEETS_TAB_NAME` — optional; defaults to `Enquiries`.

Rows are sent with Google Sheets `valueInputOption=RAW`, so user-provided text is kept as text rather than evaluated as formulas. Email alerts and the visitor auto-reply are optional. To enable them, also set `RESEND_API_KEY` and `CONTACT_FROM_EMAIL` to a verified Resend sender. `CONTACT_TO_EMAIL` can override the recipient; it defaults to the public contact email in `data/site-config.json`. Without Resend settings, submissions are still saved in Google Sheets, but no email is sent.

`.env.example` lists variable names only. Keep actual values in ignored local environment files or the Vercel environment settings. The public email shown on the site is configured separately as `contact.email` in `data/site-config.json`.

The GitHub Pages build publishes static files only; it cannot run `/api/start`. Use the Vercel deployment to test form submission. The existing GitHub Actions Pages workflow deploys only on pushes to `main`.
