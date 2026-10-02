import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(repoRoot, "data");
const templateDir = path.join(repoRoot, "templates");
const siteConfig = JSON.parse(fs.readFileSync(path.join(dataDir, "site-config.json"), "utf8"));
const services = JSON.parse(fs.readFileSync(path.join(dataDir, "services.json"), "utf8"));
const serviceBySlug = new Map(services.map((service) => [service.slug, service]));
const SITE_URL = (process.env.SITE_URL || siteConfig.siteUrl).replace(/\/$/, "");
const formUrl = siteConfig.projectFormUrl;
const ogImage = `${SITE_URL}/assets/og-image.jpg`;

if (!/^https?:\/\//i.test(SITE_URL)) throw new Error("SITE_URL must be an absolute http(s) URL.");
if (!Array.isArray(services) || services.length !== 7) throw new Error("Expected seven service records.");
if (new Set(services.map((service) => service.slug)).size !== services.length) throw new Error("Service slugs must be unique.");
for (const service of services) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service.slug)) throw new Error(`Invalid service slug: ${service.slug}`);
  if (!Array.isArray(service.audience) || service.audience.length < 3 || service.audience.length > 4) throw new Error(`${service.name} must define three or four audience situations.`);
  if (!Array.isArray(service.deliverables) || service.deliverables.length < 6 || service.deliverables.length > 8) throw new Error(`${service.name} must define six to eight deliverables.`);
  if (!Array.isArray(service.process) || service.process.length !== 6) throw new Error(`${service.name} must define six method stages.`);
  if (!Array.isArray(service.useCases) || service.useCases.length !== 3) throw new Error(`${service.name} must define three generic use cases.`);
  if (!Array.isArray(service.faqs) || service.faqs.length < 4 || service.faqs.length > 5) throw new Error(`${service.name} must define four or five FAQs.`);
  if (!Array.isArray(service.related) || service.related.length !== 2 || service.related.some((slug) => !serviceBySlug.has(slug))) throw new Error(`${service.name} must reference two existing related services.`);
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replaceAll("<", "\\u003c")}</script>`;
}

function fill(template, values) {
  let result = template;
  for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{{${key}}}`, String(value ?? ""));
  const unresolved = result.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (unresolved) throw new Error(`Unfilled template values: ${[...new Set(unresolved)].join(", ")}`);
  return result;
}

function isSet(value) {
  return typeof value === "string" && value.trim() !== "" && !/\{\{[^}]+\}\}/.test(value);
}

function normalizeUrl(value) {
  if (!isSet(value)) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function contactLinks(className = "contact-links") {
  const links = [];
  const number = siteConfig.contact?.whatsappNumber || "";
  const digits = String(number).replace(/\D/g, "");
  const whatsappUrl = normalizeUrl(number) || (isSet(number) && digits.length >= 8 ? `https://wa.me/${digits}` : "");
  if (whatsappUrl) links.push(`<a href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">WhatsApp <span aria-hidden="true">↗</span></a>`);
  const email = siteConfig.contact?.email || "";
  if (isSet(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) links.push(`<a href="mailto:${escapeHtml(email)}">Email <span aria-hidden="true">↗</span></a>`);
  const booking = normalizeUrl(siteConfig.contact?.bookingUrl || "");
  if (booking) links.push(`<a href="${escapeHtml(booking)}" target="_blank" rel="noopener noreferrer">Book a conversation <span aria-hidden="true">↗</span></a>`);
  return links.length ? `<nav class="${className}" aria-label="Direct contact">${links.join("")}</nav>` : "";
}

function renderHeader(headerTemplate) {
  return fill(headerTemplate, { FORM_URL: escapeHtml(formUrl) });
}

function renderFooter(footerTemplate) {
  const serviceLinks = services.map((service) => `<a href="/services/${service.slug}">${escapeHtml(service.name)}</a>`).join("");
  const footerServices = `<div class="container footer-services"><span class="footer-services-label">Services</span><nav class="footer-service-links" aria-label="Service pages"><a href="/services">All services</a>${serviceLinks}</nav></div>`;
  return fill(footerTemplate, {
    FORM_URL: escapeHtml(formUrl),
    FOOTER_SERVICES: footerServices,
    FOOTER_CONTACT_LINKS: contactLinks("footer-contact-links")
  });
}

function serviceDirectory() {
  return services.map((service, index) => `<a class="service-entry${index === 0 ? " is-active" : ""}" href="/services/${service.slug}"><span class="service-no">${service.number}</span><span class="service-name">${escapeHtml(service.name)}</span><span class="service-detail">${escapeHtml(service.summary)}</span><span class="service-arrow" aria-hidden="true">↗</span></a>`).join("\n");
}

function contactSection(className = "contact-links") {
  return contactLinks(className);
}

function optionalWorkSection() {
  if (!siteConfig.showWork) return "";
  const work = siteConfig.workPlaceholder || {};
  const title = isSet(work.title) ? work.title : "Project title to be added";
  const category = isSet(work.category) ? work.category : "Project category to be added";
  const description = isSet(work.description) ? work.description : "Add a real project summary when approved work is ready to share.";
  const image = normalizeUrl(work.image) || (isSet(work.image) && work.image.startsWith("/") ? work.image : "");
  const card = image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(isSet(work.imageAlt) ? work.imageAlt : "")}" loading="lazy" decoding="async">` : `<div class="work-image-placeholder" aria-hidden="true">Project image</div>`;
  const action = normalizeUrl(work.url);
  return `<section class="service-page-section optional-work-section" id="selected-work"><div class="container"><p class="section-index"><span>10</span> Selected work</p><div class="service-page-heading"><h2>Work, when it is ready to share.</h2><p>Only approved, real projects belong here.</p></div><article class="work-placeholder">${card}<div><p class="section-index">${escapeHtml(category)}</p><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${action ? `<a class="text-link" href="${escapeHtml(action)}">View project ↗</a>` : ""}</div></article></div></section>`;
}

function optionalTeamSection() {
  if (!siteConfig.showTeam) return "";
  const person = siteConfig.teamPlaceholder || {};
  const name = isSet(person.name) ? person.name : "Name to be added";
  const role = isSet(person.role) ? person.role : "Role to be added";
  const photo = isSet(person.photo) && person.photo.startsWith("/") ? person.photo : "";
  const visual = photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(isSet(person.photoAlt) ? person.photoAlt : "")}" loading="lazy" decoding="async">` : `<div class="team-photo-placeholder" aria-hidden="true">Portrait</div>`;
  return `<section class="service-page-section optional-team-section"><div class="container"><p class="section-index"><span>11</span> The people behind the work</p><div class="team-placeholder">${visual}<div><h2>${escapeHtml(name)}</h2><p>${escapeHtml(role)}</p></div></div></div></section>`;
}

function listItems(items, className, renderItem) {
  return `<ol class="${className}">${items.map((item, index) => renderItem(item, index)).join("")}</ol>`;
}

function pageHead({ title, description, canonical, jsonLdContent }) {
  return { TITLE: escapeHtml(title), DESCRIPTION: escapeHtml(description), CANONICAL: escapeHtml(canonical), OG_IMAGE: escapeHtml(ogImage), JSONLD: jsonLdContent };
}

function renderHome(homeTemplate, header, footer, script) {
  const description = "ZEC designs websites, web applications, e-commerce experiences, platforms and custom digital systems for businesses.";
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ZEC",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo.png`,
    description
  };
  const formUrlLiteral = "https://docs.google.com/forms/d/e/1FAIpQLScEimmQcJ5gNqr6mEWS4R6MxZFv5MR0CuxHeQQpt6AZggRN8A/viewform?usp=header";
  homeTemplate = homeTemplate.replaceAll(formUrlLiteral, escapeHtml(formUrl));
  return fill(homeTemplate, {
    ...pageHead({ title: "ZEC — Digital Products Built With Intent", description, canonical: `${SITE_URL}/`, jsonLdContent: jsonLd(organization) }),
    OG_TYPE: "website",
    HEADER: header,
    FOOTER: footer,
    SCRIPT: script,
    FORM_URL: escapeHtml(formUrl),
    SERVICE_DIRECTORY: serviceDirectory(),
    CONTACT_LINKS: contactSection(),
    OPTIONAL_WORK: optionalWorkSection(),
    OPTIONAL_TEAM: optionalTeamSection()
  });
}

function renderFaqs(faqs) {
  return faqs.map((faq) => `<details class="faq-item"><summary><span>${escapeHtml(faq.question)}</span><i aria-hidden="true"></i></summary><div class="faq-answer"><p>${escapeHtml(faq.answer)}</p></div></details>`).join("\n");
}

function renderService(service, template, header, footer, script) {
  const canonical = `${SITE_URL}/services/${service.slug}`;
  const title = `ZEC — ${service.name} | Digital Products Built With Intent`;
  const description = service.summary;
  const organization = { "@type": "Organization", name: "ZEC", url: `${SITE_URL}/` };
  const schemas = [
    { "@context": "https://schema.org", "@type": "Service", name: service.name, serviceType: service.name, description: service.intro, url: canonical, provider: organization },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: service.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) }
  ].map(jsonLd).join("\n  ");
  const related = service.related.map((slug) => {
    const item = serviceBySlug.get(slug);
    if (!item) throw new Error(`${service.name} references unknown related service ${slug}.`);
    return `<a class="service-entry" href="/services/${item.slug}"><span class="service-no">${item.number}</span><span class="service-name">${escapeHtml(item.name)}</span><span class="service-detail">${escapeHtml(item.summary)}</span><span class="service-arrow" aria-hidden="true">↗</span></a>`;
  }).join("\n");
  const price = isSet(service.priceFrom) ? `Typically starts from ${escapeHtml(service.priceFrom)}.` : "Typically starts from a scoped estimate; the amount follows the agreed deliverables and integrations.";
  const duration = isSet(service.durationRange) ? escapeHtml(service.durationRange) : "Set after the workflow, integrations and review schedule are scoped.";
  const values = {
    ...pageHead({ title, description, canonical, jsonLdContent: schemas }),
    OG_TYPE: "website",
    HEADER: header,
    FOOTER: footer,
    SCRIPT: script,
    FORM_URL: escapeHtml(formUrl),
    NUMBER: service.number,
    SERVICE_NAME: escapeHtml(service.name),
    HERO_LINES: service.heroLines.map((line) => `<span>${escapeHtml(line)}</span>`).join(""),
    PROMISE: escapeHtml(service.promise),
    INTRO: escapeHtml(service.intro),
    METHOD_INTRO: "The stages stay consistent; the questions, decisions and handover are specific to this service.",
    DURATION: duration,
    PRICE_GUIDANCE: price,
    AUDIENCE: listItems(service.audience, "service-situations", (item, index) => `<li><span class="service-list-number">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(item)}</span></li>`).replace(/^<ol class="service-situations">|<\/ol>$/g, ""),
    DELIVERABLES: listItems(service.deliverables, "service-deliverables", (item, index) => `<li><span class="service-list-number">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(item)}</span></li>`).replace(/^<ol class="service-deliverables">|<\/ol>$/g, ""),
    PROCESS: service.process.map((stage, index) => `<li class="service-stage"><span class="service-list-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(stage.name)}</h3><p>${escapeHtml(stage.description)}</p><span class="service-stage-output">Output / ${escapeHtml(stage.deliverable)}</span></div></li>`).join("\n"),
    USE_CASES: listItems(service.useCases, "service-use-cases", (item, index) => `<li><span class="service-list-number">${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(item)}</p></li>`).replace(/^<ol class="service-use-cases">|<\/ol>$/g, ""),
    CAPABILITIES: service.capabilities.map((tag) => `<li>${escapeHtml(tag)}</li>`).join(""),
    FAQS: renderFaqs(service.faqs),
    RELATED_SERVICES: related,
    CONTACT_LINKS: contactSection()
  };
  return fill(template, values);
}

function renderHub(template, header, footer, script) {
  const title = "ZEC Services — Websites, Digital Products and Systems";
  const description = "Explore ZEC services across websites, web applications, digital platforms, e-commerce, SaaS MVPs, custom systems and workflow automation.";
  const canonical = `${SITE_URL}/services`;
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: canonical,
    mainEntity: { "@type": "ItemList", itemListElement: services.map((service, index) => ({ "@type": "ListItem", position: index + 1, url: `${SITE_URL}/services/${service.slug}`, name: service.name })) }
  };
  return fill(template, {
    ...pageHead({ title, description, canonical, jsonLdContent: jsonLd(collection) }),
    OG_TYPE: "website",
    HEADER: header,
    FOOTER: footer,
    SCRIPT: script,
    FORM_URL: escapeHtml(formUrl),
    SERVICE_DIRECTORY: serviceDirectory(),
    CONTACT_LINKS: contactSection()
  });
}

function write(relativePath, content) {
  const target = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

const headerTemplate = fs.readFileSync(path.join(templateDir, "partials", "header.html"), "utf8");
const footerTemplate = fs.readFileSync(path.join(templateDir, "partials", "footer.html"), "utf8");
const scriptTemplate = fs.readFileSync(path.join(templateDir, "partials", "home-script.html"), "utf8");
const homeTemplate = fs.readFileSync(path.join(templateDir, "home.html"), "utf8");
const serviceTemplate = fs.readFileSync(path.join(templateDir, "service.html"), "utf8");
const hubTemplate = fs.readFileSync(path.join(templateDir, "services-index.html"), "utf8");
const header = renderHeader(headerTemplate);
const footer = renderFooter(footerTemplate);

write("index.html", renderHome(homeTemplate, header, footer, scriptTemplate));
write("services/index.html", renderHub(hubTemplate, header, footer, scriptTemplate));
for (const service of services) write(`services/${service.slug}/index.html`, renderService(service, serviceTemplate, header, footer, scriptTemplate));

const sitemapUrls = [`${SITE_URL}/`, `${SITE_URL}/services`, ...services.map((service) => `${SITE_URL}/services/${service.slug}`)];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
write("README.md", `# ZEC\n\n**Built with intent.**\n\nZEC designs websites, digital products, platforms and custom systems around real business workflows.\n\n## Build\n\nRun \`node scripts/build.mjs\` from any directory. The dependency-free build reads \`data/services.json\`, \`data/site-config.json\` and the shared templates, then writes the static pages and sitemap.\n\nSet \`SITE_URL\` to override the canonical site origin for a build.\n\n## Pages\n\n- \`/\` — ZEC homepage\n- \`/services\` — service directory\n- Seven service pages under \`/services/\`\n\n## Configuration\n\nEdit \`data/services.json\` for service copy, \`{{PRICE_FROM}}\` and \`{{DURATION_RANGE}}\` values. Edit \`data/site-config.json\` for the site URL, project form, WhatsApp number, email, optional booking link, and the disabled work and team sections.\n\nContact links render when real values are supplied. The work and team sections stay hidden until their flags are enabled.\n`);

console.log(`Built homepage, service directory and ${services.length} service pages for ${SITE_URL}.`);

