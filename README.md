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

The `/start` page posts to the Vercel Function at `/api/start`. The function validates each submission server-side, rejects a filled honeypot, and stores valid enquiries in Supabase. It does not accept submissions until `confirm.REPLY_TIME` has a confirmed value.

Apply the SQL migration in `supabase/migrations/` to the Supabase project. In the Vercel project settings, add these required server-side environment variables for Preview and Production:

- `SUPABASE_URL` — the project URL from Supabase.
- `SUPABASE_SECRET_KEY` — a Supabase secret API key. Keep it server-side as a Vercel Secret; do not use a `NEXT_PUBLIC_` prefix or put it in browser code. Supabase secret keys have project-wide elevated access, so create one dedicated to this server endpoint and never commit it.

The migration creates `public.contact_submissions`, enables row-level security, and limits Data API access to inserts by Supabase's server role. Anonymous and authenticated clients cannot read or write submissions. The Data API must be enabled with the `public` schema exposed for the Vercel Function to insert rows.

Email alerts and the visitor auto-reply are optional. To enable them, also set `RESEND_API_KEY` and `CONTACT_FROM_EMAIL` to a verified Resend sender. `CONTACT_TO_EMAIL` can override the recipient; it defaults to the public contact email in `data/site-config.json`. Without Resend settings, submissions are still saved in Supabase, but no email is sent.

`.env.example` lists variable names only. Keep actual values in ignored local environment files or the Vercel environment settings. The public email shown on the site is configured separately as `contact.email` in `data/site-config.json`.

The GitHub Pages build publishes static files only; it cannot run `/api/start`. Use the Vercel deployment to test form submission. The existing GitHub Actions Pages workflow deploys only on pushes to `main`.
