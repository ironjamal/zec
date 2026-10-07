import test from "node:test";
import assert from "node:assert/strict";
import handler, { validateSubmission } from "../api/start.js";

const validBody = {
  projectType: "website",
  description: "Customers cannot compare our services online.",
  budget: "unsure",
  name: "Jordan Example",
  email: "jordan@example.com",
  company_website_check: ""
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

test("silently accepts a filled honeypot without delivering a message", async () => {
  const res = responseStub();
  await handler({ method: "POST", headers: {}, body: { company_website_check: "bot" } }, res);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { ok: true });
});

test("requires a delivery method after the reply-time promise is confirmed", async () => {
  const res = responseStub();
  const deliveryVariables = ["CONTACT_WEBHOOK_URL", "CONTACT_WEBHOOK_TOKEN", "CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL", "RESEND_API_KEY"];
  const savedValues = Object.fromEntries(deliveryVariables.map((key) => [key, process.env[key]]));
  for (const key of deliveryVariables) delete process.env[key];
  try {
    await handler({ method: "POST", headers: {}, body: validBody }, res);
  } finally {
    for (const key of deliveryVariables) {
      if (savedValues[key] === undefined) delete process.env[key];
      else process.env[key] = savedValues[key];
    }
  }
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /not configured yet/i);
});
