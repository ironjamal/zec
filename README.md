# ZEC

**Built with intent.**

ZEC designs websites, digital products, platforms and custom systems around real business workflows.

## Build

Run `node scripts/build.mjs` from any directory. The dependency-free build reads `data/services.json`, `data/site-config.json` and the shared templates, then writes the static pages and sitemap.

Set `SITE_URL` to override the canonical site origin for a build.

## Pages

- `/` — ZEC homepage
- `/services` — service directory
- Seven service pages under `/services/`

## Configuration

Edit `data/services.json` for service copy, `{{PRICE_FROM}}` and `{{DURATION_RANGE}}` values. Edit `data/site-config.json` for the site URL, project form, WhatsApp number, email, optional booking link, and the disabled work and team sections.

Contact links render when real values are supplied. The work and team sections stay hidden until their flags are enabled.

