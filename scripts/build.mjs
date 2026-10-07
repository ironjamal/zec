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
const ogImageAlt = "Black-and-white photograph of a geometric concrete building, also used in the ZEC hero.";

if (!/^https?:\/\//i.test(SITE_URL)) throw new Error("SITE_URL must be an absolute http(s) URL.");
if (new URL(SITE_URL).pathname.replace(/\/$/, "") !== BASE_PATH) throw new Error(`SITE_URL path and BASE_PATH must match (SITE_URL path: ${new URL(SITE_URL).pathname}, BASE_PATH: ${BASE_PATH || "(empty)"}).`);
if (!Array.isArray(services) || services.length !== 7) throw new Error("Expected seven service records.");
if (new Set(services.map((service) => service.slug)).size !== services.length) throw new Error("Service slugs must be unique.");
for (const service of services) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service.slug)) throw new Error(`Invalid service slug: ${service.slug}`);
  if (typeof service.metaDescription !== "string" || service.metaDescription.length < 100 || service.metaDescription.length > 160) throw new Error(`${service.name} needs a page-specific meta description between 100 and 160 characters.`);
  if (!Array.isArray(service.audience) || service.audience.length < 3 || service.audience.length > 4) throw new Error(`${service.name} must define three or four audience situations.`);
  if (!Array.isArray(service.deliverables) || service.deliverables.length < 6 || service.deliverables.length > 8) throw new Error(`${service.name} must define six to eight deliverables.`);
  if (!Array.isArray(service.process) || service.process.length !== 6) throw new Error(`${service.name} must define six method stages.`);
  if (!Array.isArray(service.useCases) || service.useCases.length !== 3) throw new Error(`${service.name} must define three generic use cases.`);
  if (!Array.isArray(service.faqs) || service.faqs.length < 4 || service.faqs.length > 5) throw new Error(`${service.name} must define four or five FAQs.`);
  if (!Array.isArray(service.related) || service.related.length !== 2 || service.related.some((slug) => !serviceBySlug.has(slug))) throw new Error(`${service.name} must reference two existing related services.`);
}
const homepageOffers = siteConfig.homepage?.offers || [];
const conceptWork = siteConfig.homepage?.conceptWork || [];
const publishedSampleDeliverables = (siteConfig.confirm?.WORK_ITEMS || []).filter((item) => item.isPlaceholder !== true && item.route);
const groupedServiceSlugs = homepageOffers.flatMap((offer) => offer.serviceSlugs || []);
if (homepageOffers.length !== 3) throw new Error("The homepage must define exactly three offers.");
if (new Set(homepageOffers.map((offer) => offer.id)).size !== homepageOffers.length || homepageOffers.some((offer) => !/^[a-z0-9-]+$/.test(offer.id))) throw new Error("Offer IDs must be unique lowercase slugs.");
if (groupedServiceSlugs.length !== services.length || new Set(groupedServiceSlugs).size !== services.length || services.some((service) => !groupedServiceSlugs.includes(service.slug))) throw new Error("The three offers must group every service page exactly once.");
if (conceptWork.length !== 3) throw new Error("The homepage must define three selected concept projects.");
if (new Set(conceptWork.map((item) => item.id)).size !== conceptWork.length || conceptWork.some((item) => !/^[a-z0-9-]+$/.test(item.id) || !["shop", "website", "dashboard"].includes(item.preview) || typeof item.name !== "string" || typeof item.category !== "string" || typeof item.outcome !== "string" || !Array.isArray(item.tags) || item.tags.length < 1)) throw new Error("Selected concept projects need unique IDs, a supported preview, a name, a category, an outcome and tags.");
if (!Array.isArray(siteConfig.homepage?.processStages) || siteConfig.homepage.processStages.length !== 6) throw new Error("The homepage must define six process stages.");
if (publishedSampleDeliverables.some((item) => typeof item.metaDescription !== "string" || item.metaDescription.length < 100 || item.metaDescription.length > 160)) throw new Error("Published sample pages need meta descriptions between 100 and 160 characters.");
if (new Set(publishedSampleDeliverables.map((item) => item.route)).size !== publishedSampleDeliverables.length || publishedSampleDeliverables.some((item) => !/^\/samples\/[a-z0-9-]+$/.test(item.route) || !Array.isArray(item.sections) || item.sections.length < 2)) throw new Error("Published sample deliverables need unique sample routes and at least two content sections.");

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
  let digits = String(number).replace(/\D/g, "");
  if (/^0\d{10}$/.test(digits)) digits = `20${digits.slice(1)}`;
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

function homeSectionUrl(id) {
  return `${sitePath("/")}#${id}`;
}

function workNavigationLabel() {
  const items = siteConfig.confirm?.WORK_ITEMS || [];
  const publishedProof = items.filter((item) => item.isPlaceholder !== true && isSet(item.label) && isSet(item.title));
  return publishedProof.length >= 2 ? "Work" : "Samples";
}

function renderHeader(headerTemplate) {
  return fill(headerTemplate, {
    FORM_URL: escapeHtml(formUrl),
    BASE_PATH: escapeHtml(BASE_PATH),
    WORK_LABEL: escapeHtml(workNavigationLabel())
  });
}

function renderFooter(footerTemplate) {
  const offers = homepageOffers.map((offer) => `<a href="${escapeHtml(homeSectionUrl(`offer-${offer.id}`))}">${escapeHtml(offer.title)}</a>`).join("");
  const footerOffers = `<nav class="footer-offers" aria-label="Offers"><span>Offers</span>${offers}</nav>`;
  return fill(footerTemplate, {
    FORM_URL: escapeHtml(formUrl),
    BASE_PATH: escapeHtml(BASE_PATH),
    WORK_LABEL: escapeHtml(workNavigationLabel()),
    FOOTER_OFFERS: footerOffers,
    FOOTER_CONTACT_LINKS: contactLinks("footer-contact-links"),
    FOOTER_LOCATION_TIMEZONE: escapeHtml(siteConfig.confirm.LOCATION_TIMEZONE)
  });
}

function serviceOfferGroups() {
  return homepageOffers.map((offer) => {
    const serviceLinks = offer.serviceSlugs.map((slug) => {
      const service = serviceBySlug.get(slug);
      if (!service) throw new Error(`Offer ${offer.title} references unknown service ${slug}.`);
      return `<a class="service-depth-link" href="${sitePath(`/services/${service.slug}`)}"><span class="service-no">${service.number}</span><span><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(service.summary)}</small></span><span class="service-arrow" aria-hidden="true">→</span></a>`;
    }).join("");
    const ecommercePlacement = siteConfig.confirm.ECOMMERCE_OFFER_PLACEMENT === "Core service" ? "E-commerce is a core service within Websites & stores." : `E-commerce placement: ${siteConfig.confirm.ECOMMERCE_OFFER_PLACEMENT}`;
    const placement = offer.id === "websites-stores" ? `<p class="service-placement-note">${escapeHtml(ecommercePlacement)}</p>` : "";
    return `<section class="service-offer-group" aria-labelledby="service-offer-${escapeHtml(offer.id)}"><div><h3 id="service-offer-${escapeHtml(offer.id)}">${escapeHtml(offer.title)}</h3><p>${escapeHtml(offer.description)}</p>${placement}</div><div class="service-depth-links">${serviceLinks}</div></section>`;
  }).join("\n");
}

function renderSituations() {
  return siteConfig.homepage.situations.map((situation) => {
    const offer = homepageOffers.find((item) => item.id === situation.offerId);
    if (!offer) throw new Error(`Situation references unknown offer ${situation.offerId}.`);
    return `<a class="situation-card" href="#offer-${escapeHtml(offer.id)}"><span class="situation-offer">${escapeHtml(offer.title)}</span><h3>${escapeHtml(situation.text)}</h3><span class="situation-link">Explore this offer <span aria-hidden="true">↓</span></span></a>`;
  }).join("");
}

function renderOfferCards() {
  return homepageOffers.map((offer) => {
    const startUrl = `${formUrl}?type=${encodeURIComponent(offer.projectType)}`;
    const servicesUrl = `${sitePath("/services")}#service-offer-${offer.id}`;
    return `<article class="offer-card" id="offer-${escapeHtml(offer.id)}"><p class="offer-index">${String(homepageOffers.indexOf(offer) + 1).padStart(2, "0")}</p><h3>${escapeHtml(offer.title)}</h3><p>${escapeHtml(offer.description)}</p><p class="offer-fit">${escapeHtml(offer.fit)}</p><a class="offer-services-link" href="${escapeHtml(servicesUrl)}">Explore service pages</a><a class="offer-cta primary-action" href="${escapeHtml(startUrl)}">${escapeHtml(offer.cta)} <span aria-hidden="true">→</span></a></article>`;
  }).join("");
}

function renderHomeWork() {
  const items = siteConfig.confirm?.WORK_ITEMS || [];
  return items.map((item) => {
    const id = /^[a-z0-9-]+$/.test(item.id || "") ? ` id="${escapeHtml(item.id)}"` : "";
    const previewLink = item.route ? `<a class="work-sample-link" href="${escapeHtml(sitePath(item.route))}">Read the sample <span aria-hidden="true">→</span></a>` : "";
    const previewRows = (item.sections || []).slice(0, 3).map((section, index) => `<div class="sample-preview-row"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(section.heading)}</strong><p>${escapeHtml(section.text)}</p></div></div>`).join("");
    const preview = `<div class="sample-preview" aria-hidden="true"><div class="sample-preview-topline"><span>ZEC / SAMPLE</span><span>0${items.indexOf(item) + 1}</span></div><div class="sample-preview-sheet"><p class="sample-preview-kicker">PROJECT DOCUMENT</p><h4>${escapeHtml(item.title)}</h4><div class="sample-preview-rows">${previewRows}</div><span class="sample-preview-footer">STRATEGY / STRUCTURE / SCOPE</span></div></div>`;
    return `<article class="work-sample"${id}>${preview}<p class="work-sample-label">${escapeHtml(item.label)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>${previewLink}</article>`;
  }).join("");
}

function renderConceptPreview(preview) {
  const previews = {
    shop: `<div class="concept-browser"><div class="concept-browser-bar"><span></span><span></span><span></span><b>PRODUCT CATALOGUE / 01</b></div><div class="concept-page concept-page-shop"><div class="concept-page-nav"><strong>STUDIO GOODS</strong><span>OBJECTS&nbsp;&nbsp; ABOUT&nbsp;&nbsp; BAG 0</span></div><p class="concept-eyebrow">A SMALL COLLECTION</p><h4>Objects for<br>everyday life.</h4><div class="concept-product-grid"><div><span>FORM / 01</span><b>Everyday chair</b></div><div><span>FORM / 02</span><b>Side table</b></div><div><span>FORM / 03</span><b>Desk lamp</b></div></div></div></div>`,
    website: `<div class="concept-browser"><div class="concept-browser-bar"><span></span><span></span><span></span><b>SERVICE WEBSITE / 02</b></div><div class="concept-page concept-page-website"><div class="concept-page-nav"><strong>ATELIER / HOME</strong><span>SPACES&nbsp;&nbsp; APPROACH&nbsp;&nbsp; CONTACT</span></div><p class="concept-eyebrow">DESIGN / BUILD / CARE</p><h4>Space to do<br>your best work.</h4><div class="concept-website-bottom"><span>WORKPLACE DESIGN FOR GROWING TEAMS</span><b>EXPLORE THE APPROACH&nbsp; →</b></div></div></div>`,
    dashboard: `<div class="concept-browser"><div class="concept-browser-bar"><span></span><span></span><span></span><b>TEAM DASHBOARD / 03</b></div><div class="concept-dashboard"><aside><strong>FIELDNOTE</strong><span>OVERVIEW</span><span>PROJECTS</span><span>PEOPLE</span><span>SETTINGS</span></aside><div class="concept-dashboard-main"><div class="concept-dashboard-heading"><span>WORKSPACE / OVERVIEW</span><b>THIS WEEK&nbsp;⌄</b></div><h4>Good morning,<br>team.</h4><div class="concept-dashboard-cards"><div><span>OPEN PROJECTS</span><strong>04</strong></div><div><span>NEEDS REVIEW</span><strong>02</strong></div><div><span>UP NEXT</span><strong>03</strong></div></div><div class="concept-dashboard-list"><span>PROJECT</span><span>STATUS</span><b>Website refresh</b><em>IN REVIEW</em><b>Product launch</b><em>IN PROGRESS</em></div></div></div></div>`
  };
  if (!previews[preview]) throw new Error(`Unsupported selected-work preview: ${preview}`);
  return previews[preview];
}

function renderSelectedWork() {
  return conceptWork.map((item) => {
    const tags = item.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("");
    return `<article class="selected-work-card"><div class="selected-work-preview selected-work-preview--${escapeHtml(item.preview)}" aria-hidden="true">${renderConceptPreview(item.preview)}</div><div class="selected-work-copy"><div class="selected-work-meta"><span>Concept work</span><span>${escapeHtml(item.category)}</span></div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.outcome)}</p><ul aria-label="Project categories">${tags}</ul></div></article>`;
  }).join("\n");
}

function renderProcessStages() {
  const stages = siteConfig.homepage.processStages;
  return stages.map((stage, index) => `<li class="process-step${index === 0 ? " is-active" : ""}" data-title="${escapeHtml(stage.name)}" data-copy="${escapeHtml(stage.description)}"><span class="process-step-number">${String(index + 1).padStart(2, "0")}</span><div class="process-step-detail"><h3>${escapeHtml(stage.name)}</h3><p>${escapeHtml(stage.description)}</p><p class="process-step-output"><span>Output</span>${escapeHtml(stage.output)}</p></div></li>`).join("\n");
}

function timelineLabel(type) {
  const labels = { landing_page: "Landing page", business_website: "Business website", web_app: "Web app" };
  return labels[type] || type.replaceAll("_", " ");
}

function renderProcessTimelines() {
  const ranges = siteConfig.confirm.TIMELINE_RANGES;
  const entries = typeof ranges === "string" ? [["Project", ranges]] : Object.entries(ranges || {});
  return entries.map(([type, range]) => `<li class="process-timeline"><span>${escapeHtml(timelineLabel(type))}</span><strong>${escapeHtml(range)}</strong></li>`).join("\n");
}

function renderProcessNotes() {
  return (siteConfig.homepage.processNotes || []).map((note) => `<section class="process-note"><h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.text)}</p></section>`).join("\n");
}

function renderSampleSections(sections) {
  return sections.map((section, index) => `<article class="sample-document-part"><span>${String(index + 1).padStart(2, "0")}</span><div><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.text)}</p></div></article>`).join("\n");
}

function founderPortrait(person) {
  const imagePath = isSet(person.photo) && /^\/assets\/[a-z0-9/_-]+\.(?:webp|png|jpe?g)$/i.test(person.photo) ? sitePath(person.photo) : "";
  if (imagePath) return `<img src="${escapeHtml(imagePath)}" alt="Photo of ${escapeHtml(person.name)}" loading="lazy" decoding="async">`;
  return `<div class="founder-portrait-placeholder"><span>Photo to add</span><small>${escapeHtml(person.photo || "[CONFIRM: FOUNDER_PHOTO]")}</small></div>`;
}

function renderFounderStrip() {
  const founder = siteConfig.confirm.FOUNDER;
  return `<div class="founder-strip"><div class="founder-strip-portrait">${founderPortrait(founder)}</div><div class="founder-strip-name"><span>Studio founder</span><h3>${escapeHtml(founder.name)}</h3><p>${escapeHtml(founder.role)}</p></div><p class="founder-credential"><span>Credential</span>${escapeHtml(founder.credential)}</p></div>`;
}

function renderEmailCta() {
  const email = siteConfig.contact?.email || "";
  if (isSet(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `<a class="about-email-cta" href="mailto:${escapeHtml(email)}">Email us <span aria-hidden="true">→</span></a>`;
  return `<p class="about-email-placeholder">Email us: ${escapeHtml(email)} <small>Confirm before launch</small></p>`;
}

function renderHomeFaqs() {
  const timelineRanges = typeof siteConfig.confirm.TIMELINE_RANGES === "string"
    ? siteConfig.confirm.TIMELINE_RANGES
    : Object.entries(siteConfig.confirm.TIMELINE_RANGES || {}).map(([type, range]) => {
      const labels = { landing_page: "Landing page", business_website: "Business website", web_app: "Web app" };
      return `${labels[type] || type}: ${range}`;
    }).join("; ");
  const replacements = {
    PRICE_FLOOR: siteConfig.confirm.PRICE_FLOOR,
    TIMELINE_RANGES: timelineRanges,
    IDEAL_CLIENT: siteConfig.homepage.idealClient,
    NOT_FOR: siteConfig.confirm.NOT_FOR.join(", "),
    LOCATION_TIMEZONE: siteConfig.confirm.LOCATION_TIMEZONE
  };
  return siteConfig.homepage.faqs.map((faq) => {
    let answer = faq.answer;
    for (const [key, value] of Object.entries(replacements)) answer = answer.replaceAll(`{${key}}`, escapeHtml(value));
    return `<details class="faq-item"><summary><span>${escapeHtml(faq.question)}</span><i aria-hidden="true"></i></summary><div class="faq-answer"><p>${answer}</p></div></details>`;
  }).join("\n");
}

function listItems(items, className, renderItem) {
  return `<ol class="${className}">${items.map((item, index) => renderItem(item, index)).join("")}</ol>`;
}

function pageHead({ title, description, canonical, jsonLdContent }) {
  return {
    TITLE: escapeHtml(title),
    DESCRIPTION: escapeHtml(description),
    CANONICAL: escapeHtml(canonical),
    OG_TYPE: "website",
    OG_IMAGE: escapeHtml(ogImage),
    OG_IMAGE_ALT: escapeHtml(ogImageAlt),
    OG_IMAGE_TYPE: "image/jpeg",
    OG_IMAGE_WIDTH: "1200",
    OG_IMAGE_HEIGHT: "630",
    JSONLD: jsonLdContent
  };
}

function renderHome(homeTemplate, header, footer, script) {
  const title = "ZEC | Websites, Stores & Software for Growing Businesses";
  const description = "ZEC is an independent digital studio designing and building business websites, online stores, web apps and first product releases for growing businesses.";
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ZEC",
    url: absoluteSiteUrl("/"),
    logo: absoluteSiteUrl("/logo.png"),
    description
  };
  return fill(homeTemplate, {
    ...pageHead({ title, description, canonical: absoluteSiteUrl("/"), jsonLdContent: jsonLd(organization) }),
    OG_TYPE: "website",
    BASE_PATH: escapeHtml(BASE_PATH),
    HEADER: header,
    FOOTER: footer,
    SCRIPT: script,
    FORM_URL: escapeHtml(formUrl),
    SAMPLE_BRIEF_URL: escapeHtml(sitePath("/samples/project-brief")),
    ABOUT_INTRO: escapeHtml(siteConfig.homepage.aboutIntro),
    PROCESS_CURRENT_NUMBER: `01/${String(siteConfig.homepage.processStages.length).padStart(2, "0")}`,
    REPLY_TIME: escapeHtml(siteConfig.confirm.REPLY_TIME),
    IDEAL_CLIENT: escapeHtml(siteConfig.homepage.idealClient),
    NOT_FOR_ITEMS: siteConfig.confirm.NOT_FOR.map((item) => `<li${item.includes("[CONFIRM:") ? " class=\"is-confirm\"" : ""}>${escapeHtml(item)}</li>`).join(""),
    SITUATIONS: renderSituations(),
    WORK_ITEMS: renderHomeWork(),
    SELECTED_WORK: renderSelectedWork(),
    FOUNDER_STRIP: renderFounderStrip(),
    ECOMMERCE_OFFER_PLACEMENT: escapeHtml(siteConfig.confirm.ECOMMERCE_OFFER_PLACEMENT === "Core service" ? "E-commerce is a core service." : siteConfig.confirm.ECOMMERCE_OFFER_PLACEMENT),
    HOME_OFFERS: renderOfferCards(),
    PROCESS_CURRENT_TITLE: escapeHtml(siteConfig.homepage.processStages[0].name),
    PROCESS_CURRENT_COPY: escapeHtml(siteConfig.homepage.processStages[0].description),
    PROCESS_STEPS: renderProcessStages(),
    PROCESS_TIMELINES: renderProcessTimelines(),
    PROCESS_NOTES: renderProcessNotes(),
    FOUNDER_NAME: escapeHtml(siteConfig.confirm.FOUNDER.name),
    FOUNDER_ROLE: escapeHtml(siteConfig.confirm.FOUNDER.role),
    TEAM_STRUCTURE: escapeHtml(siteConfig.confirm.TEAM_STRUCTURE),
    LOCATION_TIMEZONE: escapeHtml(siteConfig.confirm.LOCATION_TIMEZONE),
    EMAIL_CTA: renderEmailCta(),
    HOME_FAQS: renderHomeFaqs(),
    FINAL_EMAIL: publicEmailMarkup()
  });
}

function renderSampleDeliverable(item, template, header, footer, script) {
  const canonical = absoluteSiteUrl(item.route);
  const title = `${item.title} — Sample | ZEC`;
  const description = item.metaDescription;
  const otherSamples = publishedSampleDeliverables
    .filter((other) => other.route !== item.route)
    .map((other) => `<a href="${escapeHtml(sitePath(other.route))}">View ${escapeHtml(other.title)}</a>`)
    .join("");
  const pageSchema = { "@context": "https://schema.org", "@type": "CreativeWork", name: title, url: canonical, description };
  return fill(template, {
    ...pageHead({ title, description, canonical, jsonLdContent: jsonLd(pageSchema) }),
    BASE_PATH: escapeHtml(BASE_PATH),
    HEADER: header,
    FOOTER: footer,
    SCRIPT: script,
    SAMPLE_LABEL: escapeHtml(item.label),
    SAMPLE_TITLE: escapeHtml(item.title),
    SAMPLE_DESCRIPTION: escapeHtml(item.description),
    SAMPLE_SECTIONS: renderSampleSections(item.sections),
    HOME_URL: escapeHtml(sitePath("/")),
    FORM_URL: escapeHtml(formUrl),
    OTHER_SAMPLES: otherSamples
  });
}

function renderStart(template, header, footer, script) {
  const canonical = absoluteSiteUrl("/start");
  const title = "Start a Project with ZEC | Websites & Software";
  const description = `Tell ZEC about a website, store or software project. Share what needs to work; ZEC will reply ${siteConfig.confirm.REPLY_TIME.toLowerCase()} with questions or a fit check.`;
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
    START_CONTACT_LINKS: contactLinks("start-contact-links"),
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
  const title = `${service.name} | ZEC Digital Studio`;
  const description = service.metaDescription;
  const organization = { "@type": "Organization", name: "ZEC", url: absoluteSiteUrl("/") };
  const schemas = [
    { "@context": "https://schema.org", "@type": "Service", name: service.name, serviceType: service.name, description: service.intro, url: canonical, provider: organization },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: service.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) }
  ].map(jsonLd).join("\n  ");
  const related = service.related.map((slug) => {
    const item = serviceBySlug.get(slug);
    if (!item) throw new Error(`${service.name} references unknown related service ${slug}.`);
    return `<a class="service-entry" href="${sitePath(`/services/${item.slug}`)}"><span class="service-no">${item.number}</span><span class="service-name">${escapeHtml(item.name)}</span><span class="service-detail">${escapeHtml(item.summary)}</span><span class="service-arrow" aria-hidden="true">→</span></a>`;
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
    CONTACT_LINKS: contactLinks()
  };
  return fill(template, values);
}

function renderHub(template, header, footer, script) {
  const title = "Services: Websites, Web Apps & Product Builds | ZEC";
  const description = "Explore ZEC's websites and stores, web apps and internal tools, and product builds, with seven service pages for project detail.";
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
    SERVICE_GROUPS: serviceOfferGroups(),
    CONTACT_LINKS: contactLinks()
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
const sampleTemplate = fs.readFileSync(path.join(templateDir, "sample-deliverable.html"), "utf8");
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
for (const item of publishedSampleDeliverables) write(pageOutputPath(item.route), renderSampleDeliverable(item, sampleTemplate, header, footer, scriptTemplate));
write("404.html", fill(fs.readFileSync(path.join(templateDir, "404.html"), "utf8"), {
  BASE_PATH: escapeHtml(BASE_PATH),
  HOME_URL: sitePath("/"),
  SERVICES_URL: sitePath("/services"),
  HEADER: header,
  FOOTER: footer,
  SCRIPT: scriptTemplate,
  FORM_URL: escapeHtml(formUrl)
}));

const sitemapRoutes = ["/", "/services", "/start", ...services.map((service) => `/services/${service.slug}`), ...publishedSampleDeliverables.map((item) => item.route)];
const sitemapUrls = sitemapRoutes.map(absoluteSiteUrl);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: ${BASE_PATH || "/"}/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
if (target === "github-pages") write(".nojekyll", "");

console.log(`Built ${target} output at ${outputDir}: homepage, start form, service directory, ${services.length} service pages and ${publishedSampleDeliverables.length} sample previews (BASE_PATH=${BASE_PATH || "(empty)"}, SITE_URL=${SITE_URL}).`);
