# ZEC

**Built with intent.**

ZEC designs websites, digital products, platforms and custom systems around real business workflows.

## Build targets

- `npm run build` — builds the Vercel site to `dist/` with an empty `BASE_PATH` and `https://zeceg.vercel.app` as `SITE_URL`.
- `npm run build:github-pages` — builds the GitHub Pages project site to `dist/` with `BASE_PATH=/zec` and `SITE_URL=https://ironjamal.github.io/zec`.
- `npm run check` and `npm run check:github-pages` — validate page metadata, schemas, sitemap, local links, base paths and placeholders for the corresponding target.

The source is dependency-free. Edit `data/services.json`, `data/site-config.json` and the shared templates, then run the appropriate target build. Environment variables `SITE_URL` and `BASE_PATH` can override the selected target for local checks.

## Routing and deployment

Both targets publish folder `index.html` routes, so `/services` and its service paths resolve without rewrites. Vercel uses `dist/` with `trailingSlash: false`; `cleanUrls` is disabled because routes are represented by folders. GitHub Pages uses the same folder structure under `/zec`; `.nojekyll` is included. The GitHub Actions workflow builds and deploys the Pages target on pushes to `main`.

## Pages

- `/` — ZEC homepage
- `/services` — service directory
- Seven service pages under `/services/`
- `/404.html` — branded not-found page

## Configuration

Edit `priceFrom` and `durationRange` in each service entry when rates and typical project schedules are ready. Fill `contact.whatsappNumber`, `contact.email` and `contact.bookingUrl` in `data/site-config.json`. Selected work and team sections remain hidden until their flags are enabled and real details are added.
