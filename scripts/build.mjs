import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(repoRoot, "data");
const templateDir = path.join(repoRoot, "templates");
const outputDir = path.join(repoRoot, "dist");
const siteConfig = JSON.parse(fs.readFileSync(path.join(dataDir, "site-config.json"), "utf8"));
const services = JSON.parse(fs.readFileSync(path.join(dataDir, "services.json"), "utf8"));
const serviceBySlug = new Map(services.map((service) => [service.slug, service]));
const targetIndex = process.argv.indexOf("--target");
const target = process.env.BUILD_TARGET || (targetIndex >= 0 ? process.argv[targetIndex + 1] : "vercel");
const targetConfig = siteConfig.targets?.[target];
if (!targetConfig) throw new Error(`Unknown build target: ${target}. Use vercel or github-pages.`);
const SITE_URL = (process.env.SITE_URL || targetConfig.siteUrl || siteConfig.siteUrl).replace(/\/$/, "");
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH ?? targetConfig.basePath ?? siteConfig.basePath ?? "");
const formUrl = sitePath("/start");
const ogImage = `${SITE_URL}/assets/og-image.jpg`;

if (!/^https?:\/\//i.test(SITE_URL)) throw new Error("SITE_URL must be an absolute http(s) URL.");
if (new URL(SITE_URL).pathname.replace(/\/$/, "") !== BASE_PATH) throw new Error(`SITE_URL path and BASE_PATH must match (SITE_URL path: ${new URL(SITE_URL).pathname}, BASE_PATH: ${BASE_PATH || "(empty)"}).`);
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

function normalizeBasePath(value) {
  const cleaned = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (cleaned && !/^[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*$/.test(cleaned)) throw new Error(`Invalid BASE_PATH: ${value}`);
  return cleaned ? `/${cleaned}` : "";
}

function sitePath(route) {
  const normalized = `/${String(route || "").replace(/^\/+/, "")}`;
  if (BASE_PATH && (normalized === BASE_PATH || normalized.startsWith(`${BASE_PATH}/`))) return normalized;
  return `${BASE_PATH}${normalized}`;
}

function absoluteSiteUrl(route) {
  const normalized = `/${String(route || "").replace(/^\/+/, "")}`;
  return `${SITE_URL}${normalized}`;
}

function pageOutputPath(route) {
  if (route === "/") return "index.html";
  const relative = route.replace(/^\/+/, "");
  return path.join(relative, "index.html");
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
  return typeof value === "string" && value.trim() !== "" && !/\{\{[^}]+\}\}|\[CONFIRM:/i.test(value);
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
  if (siteConfig.contact?.whatsappEnabled && whatsappUrl) links.push(`<a href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">WhatsApp <span aria-hidden="true">↗</span></a>`);
  const email = siteConfig.contact?.email || "";
  if (isSet(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) links.push(`<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`);
  else links.push(`<span class="email-confirmation">Email: ${escapeHtml(email)} <small>Confirm before launch</small></span>`);
  return links.length ? `<div class="${className}">${links.join("")}</div>` : "";
}

function publicEmailMarkup() {
  const email = siteConfig.contact?.email || "";
  if (isSet(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`;
  return `<span class="confirm-placeholder">Email to add: ${escapeHtml(email)}</span>`;
}

function renderHeader(headerTemplate) {
  return fill(headerTemplate, { FORM_URL: escapeHtml(formUrl), BASE_PATH: escapeHtml(BASE_PATH) });
}

function renderFooter(footerTemplate) {
  const serviceLinks = services.map((service) => `<a href="${sitePath(`/services/${service.slug}`)}">${escapeHtml(service.name)}</a>`).join("");
  const footerServices = `<div class="container footer-services"><span class="footer-services-label">Services</span><nav class="footer-service-links" aria-label="Service pages"><a href="${sitePath("/services")}">All services</a>${serviceLinks}</nav></div>`;
  return fill(footerTemplate, {
    FORM_URL: escapeHtml(formUrl),
    BASE_PATH: escapeHtml(BASE_PATH),
    FOOTER_SERVICES: footerServices,
    FOOTER_CONTACT_LINKS: contactLinks("footer-contact-links")
  });
}

function serviceDirectory() {
  return services.map((service, index) => `<a class="service-entry${index === 0 ? " is-active" : ""}" href="${sitePath(`/services/${service.slug}`)}"><span class="service-no">${service.number}</span><span class="service-name">${escapeHtml(service.name)}</span><span class="service-detail">${escapeHtml(service.summary)}</span><span class="service-arrow" aria-hidden="true">↗</span></a>`).join("\n");
}

function contactSection(className = "contact-links") {
  return contactLinks(className);
}

function optionalWorkSection() {
  if (!siteConfig.showWork) return "";
  const items = siteConfig.confirm?.WORK_ITEMS || [];
  const cards = items.map((item) => `<article class="work-sample"><p class="work-sample-label">${escapeHtml(item.label)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`).join("");
  return `<section class="service-page-section optional-work-section" id="selected-work" aria-labelledby="selected-work-title"><div class="container"><p class="section-index"><span>10</span> Samples</p><div class="service-page-heading"><h2 id="selected-work-title">A look at the work.</h2><p>These marked placeholders are sample deliverables, not client projects.</p></div><div class="work-samples">${cards}</div></div></section>`;
}

function optionalTeamSection() {
  if (!siteConfig.showTeam) return "";
  const person = siteConfig.teamPlaceholder || {};
  const name = isSet(person.name) ? person.name : "Name to be added";
  const role = isSet(person.role) ? person.role : "Role to be added";
  const photo = isSet(person.photo) && person.photo.startsWith("/") ? sitePath(person.photo) : "";
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
    url: absoluteSiteUrl("/"),
    logo: absoluteSiteUrl("/logo.png"),
    description
  };
  return fill(homeTemplate, {
    ...pageHead({ title: "ZEC — Digital Products Built With Intent", description, canonical: absoluteSiteUrl("/"), jsonLdContent: jsonLd(organization) }),
    OG_TYPE: "website",
    BASE_PATH: escapeHtml(BASE_PATH),
    HEADER: header,
    FOOTER: footer,
    SCRIPT: script,
    FORM_URL: escapeHtml(formUrl),
    REPLY_TIME: escapeHtml(siteConfig.confirm.REPLY_TIME),
    SERVICE_DIRECTORY: serviceDirectory(),
    CONTACT_LINKS: contactSection(),
    OPTIONAL_WORK: optionalWorkSection(),
    OPTIONAL_TEAM: optionalTeamSection()
  });
}

function renderStart(template, header, footer, script) {
  const canonical = absoluteSiteUrl("/start");
  const title = "Tell ZEC what needs to work";
  const description = "Share a few details about your project. ZEC will reply with questions or a fit check before anything is scoped.";
  const organization = { "@context": "https://schema.org", "@type": "Organization", name: "ZEC", url: absoluteSiteUrl("/") };
  const projectTypeOptions = siteConfig.projectTypes
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  const budgetOptions = siteConfig.confirm.BUDGET_TIERS
    .map((item) => `<label class="budget-option"><input type="radio" name="budget" value="${escapeHtml(item.value)}"><span>${escapeHtml(item.label)}</span></label>`)
    .join("");
  const budgetNeedsConfirmation = siteConfig.confirm.BUDGET_TIERS.some((item) => item.label.includes("[CONFIRM:"));
  const booking = normalizeUrl(siteConfig.contact?.bookingUrl || "");
  const introCallLink = booking ? ` <a href="${escapeHtml(booking)}" target="_blank" rel="noopener noreferrer">Book a short intro call →</a>` : "";
  const typeAliases = escapeHtml(JSON.stringify(siteConfig.projectTypeAliases || {}));
  return fill(template, {
    ...pageHead({ title, description, canonical, jsonLdContent: jsonLd(organization) }),
    BASE_PATH: escapeHtml(BASE_PATH),
    HEADER: header,
    FOOTER: footer,
    SCRIPT: script,
    API_ENDPOINT: escapeHtml(sitePath("/api/start")),
    TYPE_ALIASES: typeAliases,
    PROJECT_TYPE_OPTIONS: projectTypeOptions,
    BUDGET_OPTIONS: budgetOptions,
    BUDGET_NOTE: budgetNeedsConfirmation ? "These ranges are placeholders and need confirmation before launch." : "Choose a range or say you are not sure yet.",
    REPLY_TIME: escapeHtml(siteConfig.confirm.REPLY_TIME),
    CONTACT_EMAIL: publicEmailMarkup(),
    INTRO_CALL_LINK: introCallLink
  });
}

function renderFaqs(faqs) {
  return faqs.map((faq) => `<details class="faq-item"><summary><span>${escapeHtml(faq.question)}</span><i aria-hidden="true"></i></summary><div class="faq-answer"><p>${escapeHtml(faq.answer)}</p></div></details>`).join("\n");
}

function renderService(service, template, header, footer, script) {
  const canonical = absoluteSiteUrl(`/services/${service.slug}`);
  const title = `ZEC — ${service.name} | Digital Products Built With Intent`;
  const description = service.summary;
  const organization = { "@type": "Organization", name: "ZEC", url: absoluteSiteUrl("/") };
  const schemas = [
    { "@context": "https://schema.org", "@type": "Service", name: service.name, serviceType: service.name, description: service.intro, url: canonical, provider: organization },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: service.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) }
  ].map(jsonLd).join("\n  ");
  const related = service.related.map((slug) => {
    const item = serviceBySlug.get(slug);
    if (!item) throw new Error(`${service.name} references unknown related service ${slug}.`);
    return `<a class="service-entry" href="${sitePath(`/services/${item.slug}`)}"><span class="service-no">${item.number}</span><span class="service-name">${escapeHtml(item.name)}</span><span class="service-detail">${escapeHtml(item.summary)}</span><span class="service-arrow" aria-hidden="true">↗</span></a>`;
  }).join("\n");
  const price = isSet(service.priceFrom) ? `Typically starts from ${escapeHtml(service.priceFrom)}.` : "Typically starts from a scoped estimate; the amount follows the agreed deliverables and integrations.";
  const duration = isSet(service.durationRange) ? escapeHtml(service.durationRange) : "Set after the workflow, integrations and review schedule are scoped.";
  const values = {
    ...pageHead({ title, description, canonical, jsonLdContent: schemas }),
    OG_TYPE: "website",
    BASE_PATH: escapeHtml(BASE_PATH),
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
  const canonical = absoluteSiteUrl("/services");
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: canonical,
    mainEntity: { "@type": "ItemList", itemListElement: services.map((service, index) => ({ "@type": "ListItem", position: index + 1, url: absoluteSiteUrl(`/services/${service.slug}`), name: service.name })) }
  };
  return fill(template, {
    ...pageHead({ title, description, canonical, jsonLdContent: jsonLd(collection) }),
    OG_TYPE: "website",
    BASE_PATH: escapeHtml(BASE_PATH),
    HEADER: header,
    FOOTER: footer,
    SCRIPT: script,
    FORM_URL: escapeHtml(formUrl),
    SERVICE_DIRECTORY: serviceDirectory(),
    CONTACT_LINKS: contactSection()
  });
}

function write(relativePath, content) {
  const targetPath = path.resolve(outputDir, relativePath);
  if (targetPath !== outputDir && !targetPath.startsWith(`${outputDir}${path.sep}`)) throw new Error(`Output path escaped dist: ${relativePath}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
}

const headerTemplate = fs.readFileSync(path.join(templateDir, "partials", "header.html"), "utf8");
const footerTemplate = fs.readFileSync(path.join(templateDir, "partials", "footer.html"), "utf8");
const scriptTemplate = fs.readFileSync(path.join(templateDir, "partials", "home-script.html"), "utf8");
const homeTemplate = fs.readFileSync(path.join(templateDir, "home.html"), "utf8");
const serviceTemplate = fs.readFileSync(path.join(templateDir, "service.html"), "utf8");
const hubTemplate = fs.readFileSync(path.join(templateDir, "services-index.html"), "utf8");
const startTemplate = fs.readFileSync(path.join(templateDir, "start.html"), "utf8");
const header = renderHeader(headerTemplate);
const footer = renderFooter(footerTemplate);

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.cpSync(path.join(repoRoot, "assets"), path.join(outputDir, "assets"), { recursive: true });
fs.copyFileSync(path.join(repoRoot, "logo.png"), path.join(outputDir, "logo.png"));
fs.copyFileSync(path.join(repoRoot, "favicon.png"), path.join(outputDir, "favicon.png"));

write(pageOutputPath("/"), renderHome(homeTemplate, header, footer, scriptTemplate));
write(pageOutputPath("/services"), renderHub(hubTemplate, header, footer, scriptTemplate));
write(pageOutputPath("/start"), renderStart(startTemplate, header, footer, scriptTemplate));
for (const service of services) write(pageOutputPath(`/services/${service.slug}`), renderService(service, serviceTemplate, header, footer, scriptTemplate));
write("404.html", fill(fs.readFileSync(path.join(templateDir, "404.html"), "utf8"), {
  BASE_PATH: escapeHtml(BASE_PATH),
  HOME_URL: sitePath("/"),
  SERVICES_URL: sitePath("/services"),
  HEADER: header,
  FOOTER: footer,
  SCRIPT: scriptTemplate,
  FORM_URL: escapeHtml(formUrl)
}));

const sitemapRoutes = ["/", "/services", "/start", ...services.map((service) => `/services/${service.slug}`)];
const sitemapUrls = sitemapRoutes.map(absoluteSiteUrl);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: ${BASE_PATH || "/"}/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
if (target === "github-pages") write(".nojekyll", "");

console.log(`Built ${target} output at ${outputDir}: homepage, start form, service directory and ${services.length} service pages (BASE_PATH=${BASE_PATH || "(empty)"}, SITE_URL=${SITE_URL}).`);
