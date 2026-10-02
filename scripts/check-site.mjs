import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const services = JSON.parse(fs.readFileSync(path.join(root, "data", "services.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(root, "data", "site-config.json"), "utf8"));
const siteUrl = (process.env.SITE_URL || config.siteUrl).replace(/\/$/, "");
const pages = [
  { file: "index.html", url: `${siteUrl}/` },
  { file: "services/index.html", url: `${siteUrl}/services` },
  ...services.map((service) => ({ file: `services/${service.slug}/index.html`, url: `${siteUrl}/services/${service.slug}` }))
];
const errors = [];
const titles = new Set();
const canonicals = new Set();

function sourceFileForUrl(rawUrl) {
  const pathname = decodeURIComponent(rawUrl || "/").split("?")[0].replace(/\/$/, "") || "/";
  let target = path.join(root, pathname.replace(/^\//, ""));
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
  else if (!path.extname(target) && fs.existsSync(path.join(target, "index.html"))) target = path.join(target, "index.html");
  return target;
}

for (const page of pages) {
  const absolutePath = path.join(root, page.file);
  if (!fs.existsSync(absolutePath)) { errors.push(`Missing page: ${page.file}`); continue; }
  const html = fs.readFileSync(absolutePath, "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || "";
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1] || "";
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || "";
  const twitterImage = html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i)?.[1] || "";
  if (!title || !description || !canonical) errors.push(`Missing title, description or canonical: ${page.file}`);
  if (canonical !== page.url) errors.push(`Incorrect canonical in ${page.file}: ${canonical}`);
  if (titles.has(title)) errors.push(`Duplicate title: ${title}`);
  if (canonicals.has(canonical)) errors.push(`Duplicate canonical: ${canonical}`);
  titles.add(title); canonicals.add(canonical);
  if (!/^https?:\/\//i.test(ogImage) || ogImage !== twitterImage) errors.push(`Open Graph/Twitter image must be the same absolute URL: ${page.file}`);
  if ((html.match(/<h1\b/gi) || []).length !== 1) errors.push(`Expected exactly one H1: ${page.file}`);
  if (/\{\{[A-Z0-9_]+\}\}/.test(html)) errors.push(`Unresolved template token: ${page.file}`);

  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const raw = match[1].replaceAll("&amp;", "&");
    if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(raw)) continue;
    const [targetPart, fragment] = raw.split("#", 2);
    if (raw.startsWith("#") || (!targetPart && fragment)) {
      if (fragment && !ids.has(fragment)) errors.push(`Missing anchor #${fragment} in ${page.file}`);
      continue;
    }
    if (!targetPart) continue;
    const target = sourceFileForUrl(targetPart);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) errors.push(`Broken local link ${raw} in ${page.file}`);
    else if (fragment && target === absolutePath && !ids.has(fragment)) errors.push(`Missing anchor #${fragment} in ${page.file}`);
    else if (fragment && target !== absolutePath && target.endsWith("index.html")) {
      const targetHtml = fs.readFileSync(target, "utf8");
      if (!new RegExp(`\\bid="${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(targetHtml)) errors.push(`Missing anchor ${raw} in ${page.file}`);
    }
  }

  const schemaScripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (page.file === "index.html" && !schemaScripts.some((item) => JSON.parse(item[1])["@type"] === "Organization")) errors.push("Homepage is missing Organization JSON-LD.");
  if (page.file.startsWith("services/") && !page.file.endsWith("services/index.html")) {
    const types = schemaScripts.map((item) => JSON.parse(item[1])["@type"]);
    if (!types.includes("Service") || !types.includes("FAQPage")) errors.push(`Missing Service/FAQPage JSON-LD: ${page.file}`);
  }
}

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (sitemapUrls.length !== pages.length || pages.some((page) => !sitemapUrls.includes(page.url))) errors.push("Sitemap does not list every generated page exactly once.");
if (!fs.readFileSync(path.join(root, "robots.txt"), "utf8").includes(`${siteUrl}/sitemap.xml`)) errors.push("robots.txt does not point to the sitemap.");
const ogPath = path.join(root, "assets", "og-image.jpg");
if (!fs.existsSync(ogPath)) errors.push("Missing 1200×630 share image.");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${pages.length} pages, unique metadata, JSON-LD, sitemap and local links. No issues found.`);
}

