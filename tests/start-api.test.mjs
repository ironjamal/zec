import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler, { validateSubmission } from "../api/start.js";

const validBody = {
  projectType: "website",
  description: "Customers cannot compare our services online.",
  budget: "unsure",
  name: "Jordan Example",
  email: "jordan@example.com",
  form_guard: ""
};

function responseStub() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

const environmentKeys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "RESEND_API_KEY", "CONTACT_FROM_EMAIL", "CONTACT_TO_EMAIL"];

async function withEnvironment(values, callback) {
  const saved = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  for (const key of environmentKeys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const key of environmentKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("accepts a well-formed project enquiry", () => {
  const { errors, value } = validateSubmission(validBody);
  assert.deepEqual(errors, {});
  assert.equal(value.projectTypeLabel, "Website or landing page");
  assert.equal(value.email, "jordan@example.com");
  assert.equal(value.budget, "unsure");
});

test("accepts each confirmed EGP budget option", () => {
  const budgets = [
    "under-7500-egp",
    "7500-15000-egp",
    "15000-30000-egp",
    "30000-60000-egp",
    "60000-120000-egp",
    "120000-plus-egp"
  ];
  for (const budget of budgets) {
    const { errors, value } = validateSubmission({ ...validBody, budget });
    assert.deepEqual(errors, {});
    assert.equal(value.budget, budget);
  }
});

test("rejects missing required fields and an invalid website URL", () => {
  const { errors } = validateSubmission({
    projectType: "unknown",
    description: "short",
    name: "",
    email: "not-an-email",
    website: "javascript:alert(1)"
  });
  assert.deepEqual(Object.keys(errors).sort(), ["description", "email", "name", "projectType", "website"]);
});

test("rejects methods other than POST", async () => {
  const res = responseStub();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("rejects a filled honeypot instead of reporting a false success", async () => {
  const res = responseStub();
  await handler({ method: "POST", headers: {}, body: { form_guard: "autofilled" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /could not be accepted/i);
});

test("requires Supabase settings after the reply-time promise is confirmed", async () => {
  const res = responseStub();
  await withEnvironment({}, async () => {
    await handler({ method: "POST", headers: {}, body: validBody }, res);
  });
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /not configured yet/i);
});

test("stores a valid enquiry with the server-side Supabase key", async () => {
  const res = responseStub();
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), ...options };
    return { ok: true, status: 201 };
  };
  try {
    await withEnvironment({
      SUPABASE_URL: "  \"https://zec-project.supabase.co/\"  ",
      SUPABASE_SECRET_KEY: "  'unit-test-key'  "
    }, async () => {
      await handler({ method: "POST", headers: {}, body: validBody }, res);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(request.url, "https://zec-project.supabase.co/rest/v1/contact_submissions");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.apikey, "unit-test-key");
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(request.headers.Prefer, "return=minimal");
  assert.deepEqual(JSON.parse(request.body), {
    project_type: "website",
    project_type_label: "Website or landing page",
    description: "Customers cannot compare our services online.",
    name: "Jordan Example",
    email: "jordan@example.com",
    budget: "unsure",
    budget_label: "Not sure yet, help me scope",
    business_name: null,
    website: null,
    timeline: null,
    phone: null
  });
});

test("logs a safe Supabase error body and returns a clear error without private data", async () => {
  const res = responseStub();
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const errorLogs = [];
  const privateKey = "unit-test-key-do-not-log";
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({
      code: "42501",
      message: `Rejected request for ${validBody.email} using ${privateKey}`,
      details: `Full user data: ${validBody.name}, ${validBody.description}`
    })
  });
  console.error = (...values) => errorLogs.push(values.join(" "));
  try {
    await withEnvironment({
      SUPABASE_URL: "https://zec-project.supabase.co",
      SUPABASE_SECRET_KEY: privateKey
    }, async () => {
      await handler({ method: "POST", headers: {}, body: validBody }, res);
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /rejected your enquiry.*HTTP 401/i);
  assert.match(errorLogs.join(" "), /HTTP 401/);
  assert.match(errorLogs.join(" "), /42501/);
  assert.match(errorLogs.join(" "), /\[redacted\]/);
  assert.doesNotMatch(JSON.stringify({ body: res.body, logs: errorLogs }), /unit-test-key|Jordan Example|jordan@example.com|Customers cannot compare/);
});

test("form posts relative to the Vercel API and keeps its request fields aligned with the API", async () => {
  const html = await readFile(new URL("../templates/start.html", import.meta.url), "utf8");
  const form = html.match(/<form\b[^>]*id="start-form"[^>]*>[\s\S]*?<\/form>/)?.[0] || "";
  assert.match(form, /action="\{\{API_ENDPOINT\}\}"/);
  assert.match(form, /method="post"/);
  assert.match(form, /data-endpoint="\{\{API_ENDPOINT\}\}"/);
  assert.match(html, /fetch\(form\.dataset\.endpoint/);
  for (const field of ["projectType", "description", "name", "email", "businessName", "website", "timeline", "phone", "form_guard"]) {
    assert.match(form, new RegExp(`name="${field}"`), `missing form field ${field}`);
  }
  assert.match(form, /class="budget-options">\{\{BUDGET_OPTIONS\}\}<\/div>/);
  assert.match(html, /if \(!response\.ok\)[\s\S]*?error\.textContent = result\.error[\s\S]*?error\.hidden = false/);
});

test("reports upstream Supabase server errors as a temporary save failure", async () => {
  const res = responseStub();
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => "upstream unavailable" });
  console.error = () => {};
  try {
    await withEnvironment({
      SUPABASE_URL: "https://zec-project.supabase.co",
      SUPABASE_SECRET_KEY: "unit-test-key"
    }, async () => {
      await handler({ method: "POST", headers: {}, body: validBody }, res);
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /could not save your enquiry.*HTTP 503/i);
});
