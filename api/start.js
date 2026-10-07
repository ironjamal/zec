import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const siteConfig = require("../data/site-config.json");
const projectTypes = new Map(siteConfig.projectTypes.map((item) => [item.value, item.label]));
const budgetValues = new Set(siteConfig.confirm.BUDGET_TIERS.map((item) => item.value));

function cleanText(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/\0/g, "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength)
    : "";
}

function cleanEnvironmentValue(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed.at(-1);
  if (trimmed.length >= 2 && ((first === "\"" && last === "\"") || (first === "'" && last === "'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function redactProviderError(value, submission, secretKey) {
  let safe = String(value || "");
  const privateValues = [...Object.values(submission), secretKey]
    .filter((item) => typeof item === "string" && item.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const privateValue of privateValues) safe = safe.replaceAll(privateValue, "[redacted]");
  return safe.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 600);
}

async function readSafeSupabaseError(response, submission, secretKey) {
  let responseBody = "";
  try {
    responseBody = await response.text();
  } catch {
    return "<unreadable response body>";
  }

  try {
    const parsed = JSON.parse(responseBody);
    const safeFields = {};
    for (const field of ["code", "message", "hint"]) {
      if (typeof parsed?.[field] === "string") safeFields[field] = redactProviderError(parsed[field], submission, secretKey);
    }
    return JSON.stringify(safeFields).slice(0, 600);
  } catch {
    return redactProviderError(responseBody, submission, secretKey);
  }
}

function validHttpUrl(value) {
  if (!value) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validateSubmission(body) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const errors = {};
  const projectType = cleanText(input.projectType, 40);
  const description = cleanText(input.description, 1600);
  const name = cleanText(input.name, 120);
  const email = cleanText(input.email, 254).toLowerCase();
  const budget = cleanText(input.budget, 40);
  const businessName = cleanText(input.businessName, 160);
  const website = cleanText(input.website, 2048);
  const timeline = cleanText(input.timeline, 160);
  const phone = cleanText(input.phone, 80);

  if (!projectTypes.has(projectType)) errors.projectType = "Choose one of the listed project types.";
  if (description.length < 10) errors.description = "Add a little more detail about what needs to work.";
  if (!name) errors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (budget && !budgetValues.has(budget)) errors.budget = "Choose one of the listed budget options.";
  if (website && !validHttpUrl(website)) errors.website = "Enter a full website address, including https://.";

  return {
    errors,
    value: {
      projectType,
      projectTypeLabel: projectTypes.get(projectType) || "",
      description,
      name,
      email,
      budget,
      budgetLabel: siteConfig.confirm.BUDGET_TIERS.find((item) => item.value === budget)?.label || "",
      businessName,
      website,
      timeline,
      phone
    }
  };
}

function confirmedReplyTime() {
  const value = siteConfig.confirm.REPLY_TIME;
  return typeof value === "string" && value.trim() && !value.includes("[CONFIRM:") ? value : "";
}

function bookingUrl() {
  const value = siteConfig.contact.bookingUrl;
  return validHttpUrl(value) ? value : "";
}

function autoReplyText(replyTime) {
  const booking = bookingUrl();
  const bookingLink = booking ? `: ${booking}` : "; reply to this email if you would like to arrange one";
  return siteConfig.autoReplyTemplate.body
    .replace("{REPLY_TIME}", replyTime)
    .replace("{BOOKING_LINK}", bookingLink);
}

function submissionText(submission) {
  return [
    `Project type: ${submission.projectTypeLabel}`,
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Budget: ${submission.budgetLabel || "Not provided"}`,
    `Business: ${submission.businessName || "Not provided"}`,
    `Website: ${submission.website || "Not provided"}`,
    `Timeline: ${submission.timeline || "Not provided"}`,
    `Phone: ${submission.phone || "Not provided"}`,
    "",
    "What needs to work:",
    submission.description
  ].join("\n");
}

function supabaseInsertUrl(value) {
  try {
    const url = new URL(value);
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!localHost && url.protocol !== "https:") || (localHost && !["http:", "https:"].includes(url.protocol))) return "";
    if (url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, "")) return "";
    return new URL("/rest/v1/contact_submissions", url.origin).toString();
  } catch {
    return "";
  }
}

async function saveToSupabase(submission, endpoint, secretKey) {
  const row = {
    project_type: submission.projectType,
    project_type_label: submission.projectTypeLabel,
    description: submission.description,
    name: submission.name,
    email: submission.email,
    budget: submission.budget || null,
    budget_label: submission.budgetLabel || null,
    business_name: submission.businessName || null,
    website: submission.website || null,
    timeline: submission.timeline || null,
    phone: submission.phone || null
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: secretKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000)
  });
  return response;
}

async function sendResendEmail(apiKey, from, to, subject, text, replyTo) {
  const payload = { from, to: [to], subject, text };
  if (replyTo) payload.reply_to = replyTo;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000)
  });
  return response.ok;
}

async function deliverWithResend(submission, replyTime, env) {
  const recipient = env.CONTACT_TO_EMAIL || siteConfig.contact.email;
  const notificationSent = await sendResendEmail(
    env.RESEND_API_KEY,
    env.CONTACT_FROM_EMAIL,
    recipient,
    `New project enquiry: ${submission.projectTypeLabel}`,
    submissionText(submission),
    submission.email
  );
  if (!notificationSent) return false;

  const autoReplySent = await sendResendEmail(
    env.RESEND_API_KEY,
    env.CONTACT_FROM_EMAIL,
    submission.email,
    siteConfig.autoReplyTemplate.subject,
    autoReplyText(replyTime)
  );
  if (!autoReplySent) console.error("Contact notification was delivered, but the auto-reply email failed.");
  return true;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to submit this form." });
  }

  const contentLength = Number(req.headers?.["content-length"] || 0);
  if (contentLength > 20000) return res.status(413).json({ error: "The form submission is too large." });

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (cleanText(body.form_guard, 200)) {
    return res.status(400).json({ error: "The form submission could not be accepted. Please try again or email us." });
  }

  const { errors, value } = validateSubmission(body);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Check the highlighted fields.", fields: errors });

  const replyTime = confirmedReplyTime();
  if (!replyTime) return res.status(503).json({ error: "The contact form is not ready yet. Please email us instead." });

  const endpoint = supabaseInsertUrl(cleanEnvironmentValue(process.env.SUPABASE_URL));
  const secretKey = cleanEnvironmentValue(process.env.SUPABASE_SECRET_KEY);
  if (!endpoint || !secretKey) {
    return res.status(503).json({ error: "The contact form is not configured yet. Please email us instead." });
  }

  try {
    const response = await saveToSupabase(value, endpoint, secretKey);
    if (!response.ok) {
      const providerStatus = Number(response.status) || 502;
      const providerError = await readSafeSupabaseError(response, value, secretKey);
      console.error(`Contact form save to Supabase returned HTTP ${providerStatus}. Safe response body: ${providerError}`);
      const error = providerStatus >= 500
        ? `The form service could not save your enquiry (Supabase HTTP ${providerStatus}). Please try again or email us.`
        : `The form service rejected your enquiry (Supabase HTTP ${providerStatus}). Please try again or email us.`;
      return res.status(502).json({ error });
    }
  } catch (error) {
    console.error("Contact form save to Supabase failed.", error?.name || "");
    return res.status(502).json({ error: "We could not send your message. Please try again or email us." });
  }

  const env = process.env;
  if (env.RESEND_API_KEY && env.CONTACT_FROM_EMAIL) {
    try {
      const notificationSent = await deliverWithResend(value, replyTime, env);
      if (!notificationSent) console.error("Contact form was saved, but its email notification failed.");
    } catch (error) {
      console.error("Contact form was saved, but its email notification failed.", error?.name || "");
    }
  } else if (env.RESEND_API_KEY || env.CONTACT_FROM_EMAIL) {
    console.error("Contact form was saved, but Resend notification settings are incomplete.");
  }
  return res.status(200).json({ ok: true });
}
