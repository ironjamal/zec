import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function filesIn(directory, extensions) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(fullPath, extensions);
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [fullPath] : [];
  });
}

const javascriptFiles = [
  ...filesIn(path.join(repoRoot, "scripts"), [".mjs", ".js"]),
  ...filesIn(path.join(repoRoot, "api"), [".mjs", ".js"]),
  ...filesIn(path.join(repoRoot, "tests"), [".mjs", ".js"])
];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) errors.push(`${path.relative(repoRoot, file)}: ${result.stderr || result.stdout || "syntax check failed"}`);
}

const htmlTemplates = filesIn(path.join(repoRoot, "templates"), [".html"]);
let inlineScriptCount = 0;
for (const file of htmlTemplates) {
  const html = fs.readFileSync(file, "utf8");
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    if (/\bsrc\s*=/.test(match[1]) || /\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1])) continue;
    inlineScriptCount += 1;
    try {
      new vm.Script(match[2], { filename: `${path.relative(repoRoot, file)} inline script` });
    } catch (error) {
      errors.push(`${path.relative(repoRoot, file)} inline script: ${error.message}`);
    }
  }
}

const jsonFiles = [path.join(repoRoot, "package.json"), ...filesIn(path.join(repoRoot, "data"), [".json"] )];
for (const file of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(repoRoot, file)}: ${error.message}`);
  }
}

const cssFile = path.join(repoRoot, "assets", "design.css");
const css = fs.readFileSync(cssFile, "utf8");
let depth = 0;
let quote = "";
for (let index = 0; index < css.length; index += 1) {
  const current = css[index];
  if (quote) {
    if (current === "\\") index += 1;
    else if (current === quote) quote = "";
    continue;
  }
  if (current === "/" && css[index + 1] === "*") {
    const end = css.indexOf("*/", index + 2);
    if (end < 0) { errors.push("assets/design.css: unclosed comment"); break; }
    index = end + 1;
  } else if (current === "'" || current === '"') quote = current;
  else if (current === "{") depth += 1;
  else if (current === "}") {
    depth -= 1;
    if (depth < 0) { errors.push("assets/design.css: unexpected closing brace"); depth = 0; }
  }
}
if (quote) errors.push("assets/design.css: unclosed string");
if (depth !== 0) errors.push("assets/design.css: unbalanced braces");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Lint checks passed: ${javascriptFiles.length} JavaScript files, ${inlineScriptCount} inline scripts, ${jsonFiles.length} JSON files and CSS block delimiters.`);
}
