import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repoRoot, "dist");
const services = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "services.json"), "utf8"));
const siteConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "site-config.json"), "utf8"));
const sampleItems = siteConfig.confirm?.WORK_ITEMS || [];
const sampleRoutes = sampleItems.filter((item) => item.isPlaceholder !== true && item.route).map((item) => item.route);
const targetIndex = process.argv.indexOf("--target");
const target = process.env.BUILD_TARGET || (targetIndex >= 0 ? process.argv[targetIndex + 1] : "vercel");
const targetConfig = siteConfig.targets?.[target];
if (!targetConfig) throw new Error(`Unknown build target: ${target}. Use vercel or github-pages.`);
const siteUrl = (process.env.SITE_URL || targetConfig.siteUrl || siteConfig.siteUrl).replace(/\/$/, "");
const baseValue = process.env.BASE_PATH ?? targetConfig.basePath ?? siteConfig.basePath ?? "";
const basePath = String(baseValue || "").trim().replace(/^\/+|\/+$/g, "");
const basePrefix = basePath ? `/${basePath}` : "";
const siteOrigin = new URL(siteUrl).origin;
const sitePathname = new URL(siteUrl).pathname.replace(/\/$/, "");
const errors = [];
const titles = new Set();
const canonicalUrls = new Set();
const routes = ["/", "/services", "/start", ...services.map((service) => `/services/${service.slug}`), ...sampleRoutes];
const homepageOffers = siteConfig.homepage?.offers || [];
const projectTypeValues = new Set((siteConfig.projectTypes || []).map((item) => item.value));

if (sitePathname !== basePrefix) errors.push(`SITE_URL path (${sitePathname || "(empty)"}) does not match BASE_PATH (${basePrefix || "(empty)"}).`);

function absoluteSiteUrl(route) {
  const normalized = `/${String(route || "").replace(/^\/+/, "")}`;
  return `${siteUrl}${normalized}`;
}

function pageFile(route) {
  if (route === "/") return path.join(outputRoot, "index.html");
  const relative = route.replace(/^\/+/, "");
  return path.join(outputRoot, relative, "index.html");
}

function resolveLocalPath(pathname) {
  let routePath = decodeURIComponent(pathname || "/").split("?")[0];
  if (basePrefix) {
    if (routePath === basePrefix || routePath === `${basePrefix}/`) routePath = "/";
    else if (routePath.startsWith(`${basePrefix}/`)) routePath = routePath.slice(basePrefix.length);
    else return null;
  }
  routePath = routePath.replace(/\/$/, "") || "/";
  const relative = routePath.replace(/^\/+/, "");
  const direct = path.resolve(outputRoot, relative || "index.html");
  if (direct !== outputRoot && !direct.startsWith(`${outputRoot}${path.sep}`)) return null;
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
    const indexFile = path.join(direct, "index.html");
    if (fs.existsSync(indexFile)) return indexFile;
  }
  if (!path.extname(direct)) {
    const htmlFile = `${direct}.html`;
    if (fs.existsSync(htmlFile) && fs.statSync(htmlFile).isFile()) return htmlFile;
  }
  return null;
}

function collectSchemaUrls(value, results = []) {
  if (Array.isArray(value)) value.forEach((item) => collectSchemaUrls(item, results));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if ((key === "url" || key === "logo") && typeof child === "string") results.push(child);
      else collectSchemaUrls(child, results);
    }
  }
  return results;
}

if (!fs.existsSync(outputRoot)) throw new Error("Missing dist output. Run the target build before checking.");

const pages = routes.map((route) => ({ route, file: pageFile(route), url: absoluteSiteUrl(route) }));
for (const page of pages) {
  if (!fs.existsSync(page.file)) { errors.push(`Missing page output: ${path.relative(outputRoot, page.file)}`); continue; }
  const html = fs.readFileSync(page.file, "utf8");
  if (/docs\.google\.com\/forms/i.test(html)) errors.push(`Google Form link remains in ${page.route}.`);
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || "";
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1] || "";
  const ogUrl = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)?.[1] || "";
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || "";
  const twitterImage = html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i)?.[1] || "";
  if (!title || !description || !canonical) errors.push(`Missing title, description or canonical: ${page.route}`);
  if (canonical !== page.url) errors.push(`Incorrect canonical in ${page.route}: ${canonical}`);
  if (ogUrl !== page.url) errors.push(`Incorrect og:url in ${page.route}: ${ogUrl}`);
  if (titles.has(title)) errors.push(`Duplicate title: ${title}`);
  if (canonicalUrls.has(canonical)) errors.push(`Duplicate canonical: ${canonical}`);
  titles.add(title); canonicalUrls.add(canonical);
  const expectedImage = absoluteSiteUrl("/assets/og-image.jpg");
  if (ogImage !== expectedImage || twitterImage !== expectedImage) errors.push(`Open Graph/Twitter image does not match target SITE_URL: ${page.route}`);
  if ((html.match(/<h1\b/gi) || []).length !== 1) errors.push(`Expected exactly one H1: ${page.route}`);
  if (/\{\{[^}]*\}\}|\bundefined\b|\bnull\b/i.test(html)) errors.push(`Raw placeholder/undefined/null in ${page.route}`);
  const primaryNav = html.match(/<nav class="primary-nav"[^>]*>([\s\S]*?)<\/nav>/i)?.[1] || "";
  const footerNav = html.match(/<nav class="footer-nav"[^>]*>([\s\S]*?)<\/nav>/i)?.[1] || "";
  for (const label of ["Services", "Process", "About"]) {
    if (!primaryNav.includes(label)) errors.push(`Primary navigation is missing ${label} on ${page.route}.`);
    if (!footerNav.includes(label)) errors.push(`Footer navigation is missing ${label} on ${page.route}.`);
  }
  if (!primaryNav.includes("Samples") && !primaryNav.includes("Work")) errors.push(`Primary navigation is missing its Work/Samples link on ${page.route}.`);
  if (!footerNav.includes("Samples") && !footerNav.includes("Work")) errors.push(`Footer navigation is missing its Work/Samples link on ${page.route}.`);
  const footerOffers = html.match(/<nav class="footer-offers"[^>]*>([\s\S]*?)<\/nav>/i)?.[1] || "";
  if ((footerOffers.match(/<a\b/g) || []).length !== 3) errors.push(`Footer must link to all three offers on ${page.route}.`);
  if (!/class="footer-location"/.test(html)) errors.push(`Footer is missing the location/timezone placeholder on ${page.route}.`);
  if (page.route === "/") {
    const homeMain = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
    const homeSections = [...homeMain.matchAll(/<section\b[^>]*\bid="([^"]+)"/gi)].map((match) => match[1]);
    const expectedSections = ["top", "who-for", "situations", "selected-work", "offers", "process", "about", "faq", "contact"];
    if (JSON.stringify(homeSections) !== JSON.stringify(expectedSections)) errors.push(`Homepage sections do not match the required nine-section order: ${homeSections.join(", ")}`);
    if ((homeMain.match(/class="situation-card"/g) || []).length !== 4) errors.push("Homepage must render four situation cards.");
    if ((homeMain.match(/class="offer-card"/g) || []).length !== 3) errors.push("Homepage must render exactly three offer cards.");
    if ((homeMain.match(/class="faq-item"/g) || []).length !== 7) errors.push("Homepage must render seven FAQs.");
    if ((homeMain.match(/class="work-sample"/g) || []).length < 2) errors.push("Homepage must render at least two labelled work or sample items.");
    if ((homeMain.match(/class="process-step-output"/g) || []).length !== 6) errors.push("Homepage must show one output for each process stage.");
    if ((homeMain.match(/class="process-timeline"/g) || []).length < 3) errors.push("Homepage must show the confirmed typical project timelines.");
    if (!homeMain.includes(siteConfig.homepage.aboutIntro)) errors.push("Homepage is missing the configured About introduction.");
    for (const offer of homepageOffers) {
      const offerType = siteConfig.projectTypeAliases?.[offer.projectType] || offer.projectType;
      const offerUrl = `${basePrefix}/start?type=${encodeURIComponent(offer.projectType)}`;
      if (!projectTypeValues.has(offerType)) errors.push(`Offer ${offer.id} does not map to a valid project type.`);
      if (!html.includes(`href="${offerUrl}"`)) errors.push(`Offer ${offer.id} is missing its /start?type= deep link.`);
    }
    if (!html.includes(`${basePrefix}/assets/zec-architecture-break.webp`) || !html.includes(`${basePrefix}/assets/zec-hero-architecture.webp`)) errors.push("Homepage must keep the existing desktop and mobile hero photos.");
    if (/class="(?:visual-break|manifesto-section|capabilities-section|solutions-section)"/.test(homeMain)) errors.push("Homepage still contains a section removed by the nine-section redesign.");
    const hasPublishedWork = sampleItems.filter((item) => item.isPlaceholder !== true && item.label && item.title).length >= 2;
    if (hasPublishedWork ? !primaryNav.includes("Work") : !primaryNav.includes("Samples")) errors.push("Homepage Work/Samples navigation label does not match the configured proof items.");
  }
  if (page.route.startsWith("/samples/")) {
    if (!/class="sample-page"/.test(html)) errors.push(`Sample route is missing its sample page content: ${page.route}`);
    if (!html.includes("Illustrative sample; not a client project or case study.")) errors.push(`Sample route is missing its non-client disclaimer: ${page.route}`);
    if ((html.match(/class="sample-document-part"/g) || []).length < 2) errors.push(`Sample route needs at least two preview sections: ${page.route}`);
  }
  if (page.route === "/services/websites") {
    const websiteIntro = services.find((service) => service.slug === "websites")?.intro || "";
    const serviceMain = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
    if (websiteIntro && serviceMain.split(websiteIntro).length - 1 !== 1) errors.push("The Websites page repeats its introductory paragraph.");
  }
  if (page.route === "/services") {
    if ((html.match(/class="service-offer-group"/g) || []).length !== 3) errors.push("Services page must group depth pages under three offers.");
    if ((html.match(/class="service-depth-link"/g) || []).length !== services.length) errors.push("Services page must list every depth page exactly once.");
  }
  if (page.route === "/start") {
    if (!/<form\b[^>]*id="start-form"/i.test(html)) errors.push("Start page is missing its project enquiry form.");
    if (!/company_website_check/.test(html)) errors.push("Start page is missing its spam honeypot field.");
    const requiredFields = html.match(/<(?:input|select|textarea)\b[^>]*\brequired(?:\s|>|=)/gi) || [];
    if (requiredFields.length > 5) errors.push(`Start page has more than five required form fields (${requiredFields.length}).`);
    if (!/aria-live="polite"/.test(html) || !/id="start-confirmation"/.test(html)) errors.push("Start page is missing its accessible confirmation panel.");
    if (!/new URLSearchParams\(window\.location\.search\)\.get\("type"\)/.test(html) || !/aliases\[queryType\.toLowerCase\(\)\]/.test(html)) errors.push("Start page is missing offer type preselection from its query string.");
  }

  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of html.matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)) {
    const raw = match[1].replaceAll("&amp;", "&");
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(raw)) {
      if (/^https?:/i.test(raw)) {
        const parsedExternal = new URL(raw);
        if (parsedExternal.origin === siteOrigin) {
          if (basePrefix && !(parsedExternal.pathname === basePrefix || parsedExternal.pathname.startsWith(`${basePrefix}/`))) errors.push(`Same-site absolute link escapes BASE_PATH: ${raw} in ${page.route}`);
          if (!resolveLocalPath(parsedExternal.pathname)) errors.push(`Broken same-site URL ${raw} in ${page.route}`);
        }
      }
      continue;
    }
    const [targetPart, fragment] = raw.split("#", 2);
    if (!targetPart) {
      if (fragment && !ids.has(fragment)) errors.push(`Missing anchor #${fragment} in ${page.route}`);
      continue;
    }
    let parsed;
    try { parsed = new URL(targetPart, `${siteUrl}${page.route === "/" ? "/" : page.route}`); }
    catch { errors.push(`Invalid local URL ${raw} in ${page.route}`); continue; }
    if (parsed.origin !== siteOrigin) continue;
    if (basePrefix && !(parsed.pathname === basePrefix || parsed.pathname.startsWith(`${basePrefix}/`))) errors.push(`Internal link escapes BASE_PATH: ${raw} in ${page.route}`);
    const targetFile = resolveLocalPath(parsed.pathname);
    if (!targetFile) errors.push(`Broken internal link ${raw} in ${page.route}`);
    else if (fragment) {
      const targetHtml = fs.readFileSync(targetFile, "utf8");
      const targetIds = new Set([...targetHtml.matchAll(/\bid="([^"]+)"/g)].map((item) => item[1]));
      if (!targetIds.has(fragment)) errors.push(`Missing anchor ${raw} in ${page.route}`);
    }
  }

  const schemaScripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let schemaTypes = [];
  let schemaUrls = [];
  try {
    const schemas = schemaScripts.map((item) => JSON.parse(item[1]));
    schemaTypes = schemas.map((schema) => schema["@type"]);
    schemaUrls = schemas.flatMap((schema) => collectSchemaUrls(schema));
  } catch (error) { errors.push(`Invalid JSON-LD in ${page.route}: ${error.message}`); }
  if (page.route === "/" && !schemaTypes.includes("Organization")) errors.push("Homepage is missing Organization JSON-LD.");
  if (page.route.startsWith("/services/") && (!schemaTypes.includes("Service") || !schemaTypes.includes("FAQPage"))) errors.push(`Missing Service/FAQPage JSON-LD: ${page.route}`);
  for (const schemaUrl of schemaUrls) if (!schemaUrl.startsWith(`${siteUrl}/`)) errors.push(`JSON-LD URL uses a different SITE_URL in ${page.route}: ${schemaUrl}`);
}

const notFoundFile = path.join(outputRoot, "404.html");
if (!fs.existsSync(notFoundFile)) errors.push("Missing branded 404.html.");
else {
  const notFound = fs.readFileSync(notFoundFile, "utf8");
  if ((notFound.match(/<h1\b/gi) || []).length !== 1) errors.push("Expected exactly one H1 in 404.html.");
  if (/\{\{[^}]*\}\}|\bundefined\b|\bnull\b/i.test(notFound)) errors.push("Raw placeholder/undefined/null in 404.html.");
  for (const match of notFound.matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)) {
    const raw = match[1].replaceAll("&amp;", "&");
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(raw)) continue;
    const targetPart = raw.split("#", 1)[0];
    if (!targetPart) continue;
    const parsed = new URL(targetPart, siteUrl);
    if (basePrefix && !(parsed.pathname === basePrefix || parsed.pathname.startsWith(`${basePrefix}/`))) errors.push(`404.html internal link escapes BASE_PATH: ${raw}`);
    if (!resolveLocalPath(parsed.pathname)) errors.push(`Broken 404.html internal link: ${raw}`);
  }
}

const sitemapFile = path.join(outputRoot, "sitemap.xml");
const sitemap = fs.existsSync(sitemapFile) ? fs.readFileSync(sitemapFile, "utf8") : "";
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (sitemapUrls.length !== pages.length || pages.some((page) => !sitemapUrls.includes(page.url))) errors.push("Sitemap does not list every generated page exactly once for this SITE_URL.");
if (sitemapUrls.some((url) => !url.startsWith(`${siteUrl}/`))) errors.push("Sitemap URL escapes SITE_URL.");
const robotsFile = path.join(outputRoot, "robots.txt");
if (!fs.existsSync(robotsFile) || !fs.readFileSync(robotsFile, "utf8").includes(`${siteUrl}/sitemap.xml`)) errors.push("robots.txt does not point to the target sitemap.");
for (const asset of ["logo.png", "favicon.png", "assets/zec-architecture-break.webp", "assets/zec-hero-architecture.webp", "assets/og-image.jpg", "assets/design.css"]) {
  if (!fs.existsSync(path.join(outputRoot, asset))) errors.push(`Missing built asset: ${asset}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${pages.length} ${target} pages, SITE_URL, BASE_PATH, metadata, JSON-LD, sitemap, placeholders and internal links. No issues found.`);
}
