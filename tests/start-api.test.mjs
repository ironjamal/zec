import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import handler, { validateSubmission } from "../api/start.js";

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const testPrivateKey = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const serviceAccountEmail = "test-sheets-writer@example.iam.gserviceaccount.com";
const publicKey = keyPair.publicKey;
const validBody = {
  projectType: "website",
  description: "Customers cannot compare our services online.",
  budget: "unsure",
  name: "Jordan Example",
  email: "jordan@example.com",
  clientNumber: "+201003246428",
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

function providerResponse(status, payload) {
  const body = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body)
  };
}

const environmentKeys = [
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SHEETS_PRIVATE_KEY",
  "GOOGLE_SHEETS_TAB_NAME",
  "RESEND_API_KEY",
  "CONTACT_FROM_EMAIL",
  "CONTACT_TO_EMAIL"
];

function googleSheetsEnvironment(overrides = {}) {
  return {
    GOOGLE_SHEETS_SPREADSHEET_ID: "test-spreadsheet-id",
    GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: serviceAccountEmail,
    GOOGLE_SHEETS_PRIVATE_KEY: testPrivateKey,
    ...overrides
  };
}

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

test("accepts a well-formed project enquiry with a client number", () => {
  const { errors, value } = validateSubmission(validBody);
  assert.deepEqual(errors, {});
  assert.equal(value.projectTypeLabel, "Website or landing page");
  assert.equal(value.email, "jordan@example.com");
  assert.equal(value.budget, "unsure");
  assert.equal(value.clientNumber, "+201003246428");
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

test("rejects missing required fields, client number and an invalid website URL", () => {
  const { errors } = validateSubmission({
    projectType: "unknown",
    description: "short",
    name: "",
    email: "not-an-email",
    website: "javascript:alert(1)"
  });
  assert.deepEqual(Object.keys(errors).sort(), ["clientNumber", "description", "email", "name", "projectType", "website"]);
});

test("accepts the previous phone property as a compatibility alias", () => {
  const { errors, value } = validateSubmission({ ...validBody, clientNumber: undefined, phone: "+201003246428" });
  assert.deepEqual(errors, {});
  assert.equal(value.clientNumber, "+201003246428");
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

test("requires Google Sheets settings", async () => {
  const res = responseStub();
  await withEnvironment({}, async () => {
    await handler({ method: "POST", headers: {}, body: validBody }, res);
  });
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /not configured yet/i);
});

test("stores a valid enquiry in Google Sheets with a signed server-side service account token", async () => {
  const res = responseStub();
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), ...options });
    if (String(url) === "https://oauth2.googleapis.com/token") {
      return providerResponse(200, { access_token: "test-access-token", token_type: "Bearer", expires_in: 3600 });
    }
    return providerResponse(200, { updates: { updatedRows: 1 } });
  };
  try {
    await withEnvironment(googleSheetsEnvironment({
      GOOGLE_SHEETS_SPREADSHEET_ID: "  \"test-spreadsheet-id\"  ",
      GOOGLE_SHEETS_PRIVATE_KEY: `  '${testPrivateKey.replace(/\r?\n/g, "\\n")}'  `
    }), async () => {
      await handler({ method: "POST", headers: {}, body: validBody }, res);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].headers["Content-Type"], "application/x-www-form-urlencoded");

  const tokenForm = new URLSearchParams(requests[0].body);
  assert.equal(tokenForm.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const assertion = tokenForm.get("assertion");
  const [encodedHeader, encodedClaims, encodedSignature] = assertion.split(".");
  const unsignedAssertion = `${encodedHeader}.${encodedClaims}`;
  assert.deepEqual(JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")), { alg: "RS256", typ: "JWT" });
  const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8"));
  assert.equal(claims.iss, serviceAccountEmail);
  assert.equal(claims.scope, "https://www.googleapis.com/auth/spreadsheets");
  assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(verify("RSA-SHA256", Buffer.from(unsignedAssertion), publicKey, Buffer.from(encodedSignature, "base64url")), true);

  const appendRequest = requests[1];
  const appendUrl = new URL(appendRequest.url);
  assert.equal(appendUrl.origin, "https://sheets.googleapis.com");
  const rangeMatch = appendUrl.pathname.match(/\/values\/(.+):append$/);
  assert.ok(rangeMatch);
  assert.equal(decodeURIComponent(rangeMatch[1]), "'Enquiries'!A:L");
  assert.equal(appendUrl.searchParams.get("valueInputOption"), "RAW");
  assert.equal(appendUrl.searchParams.get("insertDataOption"), "INSERT_ROWS");
  assert.equal(appendUrl.searchParams.get("includeValuesInResponse"), "false");
  assert.equal(appendRequest.method, "POST");
  assert.equal(appendRequest.headers.Authorization, "Bearer test-access-token");
  const rows = JSON.parse(appendRequest.body).values;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 12);
  assert.match(rows[0][0], /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(rows[0].slice(1), [
    "website",
    "Website or landing page",
    "Customers cannot compare our services online.",
    "Jordan Example",
    "jordan@example.com",
    "unsure",
    "Not sure yet, help me scope",
    "",
    "",
    "",
    "+201003246428"
  ]);
});

test("reports a safe Google Sheets permission error without logging private data", async () => {
  const res = responseStub();
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const errorLogs = [];
  globalThis.fetch = async (url) => {
    if (String(url) === "https://oauth2.googleapis.com/token") {
      return providerResponse(200, { access_token: "test-access-token", token_type: "Bearer", expires_in: 3600 });
    }
    return providerResponse(403, {
      error: {
        code: 403,
        status: "PERMISSION_DENIED",
        message: `Cannot append ${validBody.email} / ${validBody.clientNumber} with ${serviceAccountEmail}`
      }
    });
  };
  console.error = (...values) => errorLogs.push(values.join(" "));
  try {
    await withEnvironment(googleSheetsEnvironment(), async () => {
      await handler({ method: "POST", headers: {}, body: validBody }, res);
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /rejected your enquiry.*Google Sheets HTTP 403/i);
  assert.match(errorLogs.join(" "), /HTTP 403/);
  assert.match(errorLogs.join(" "), /PERMISSION_DENIED/);
  assert.match(errorLogs.join(" "), /\[redacted\]/);
  assert.doesNotMatch(JSON.stringify({ body: res.body, logs: errorLogs }), /test-access-token|Jordan Example|jordan@example.com|\+201003246428|test-sheets-writer/);
});

test("reports a Google Sheets server failure as a temporary save error", async () => {
  const res = responseStub();
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  globalThis.fetch = async (url) => String(url) === "https://oauth2.googleapis.com/token"
    ? providerResponse(200, { access_token: "test-access-token" })
    : providerResponse(503, { error: { code: 503, message: "Service unavailable" } });
  console.error = () => {};
  try {
    await withEnvironment(googleSheetsEnvironment(), async () => {
      await handler({ method: "POST", headers: {}, body: validBody }, res);
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /could not save your enquiry.*Google Sheets HTTP 503/i);
});

test("form includes a visible required client number and posts relative to the Vercel API", async () => {
  const html = await readFile(new URL("../templates/start.html", import.meta.url), "utf8");
  const form = html.match(/<form\b[^>]*id="start-form"[^>]*>[\s\S]*?<\/form>/)?.[0] || "";
  assert.match(form, /action="\{\{API_ENDPOINT\}\}"/);
  assert.match(form, /method="post"/);
  assert.match(form, /data-endpoint="\{\{API_ENDPOINT\}\}"/);
  assert.match(html, /fetch\(form\.dataset\.endpoint/);
  for (const field of ["projectType", "description", "name", "email", "businessName", "website", "timeline", "clientNumber", "form_guard"]) {
    assert.match(form, new RegExp(`name="${field}"`), `missing form field ${field}`);
  }
  assert.match(form, /name="clientNumber"[^>]*required/);
  assert.match(form, /class="budget-options">\{\{BUDGET_OPTIONS\}\}<\/div>/);
  assert.match(html, /if \(!response\.ok\)[\s\S]*?error\.textContent = result\.error[\s\S]*?error\.hidden = false/);
});
