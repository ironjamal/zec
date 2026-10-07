import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_ROOT = "https://sheets.googleapis.com/v4/spreadsheets";

export class GoogleSheetsConfigurationError extends Error {
  constructor() {
    super("Google Sheets environment variables are missing or invalid.");
    this.name = "GoogleSheetsConfigurationError";
  }
}

export class GoogleSheetsProviderError extends Error {
  constructor(status, stage, safeBody) {
    super("Google Sheets request failed.");
    this.name = "GoogleSheetsProviderError";
    this.status = status;
    this.stage = stage;
    this.safeBody = safeBody;
  }
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

function configurationFromEnvironment(env) {
  const spreadsheetId = cleanEnvironmentValue(env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const serviceAccountEmail = cleanEnvironmentValue(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL);
  const privateKey = cleanEnvironmentValue(env.GOOGLE_SHEETS_PRIVATE_KEY).replace(/\\n/g, "\n");
  const sheetName = cleanEnvironmentValue(env.GOOGLE_SHEETS_TAB_NAME) || "Enquiries";

  if (!spreadsheetId || !serviceAccountEmail || !privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----")) {
    throw new GoogleSheetsConfigurationError();
  }
  if (/[\u0000-\u001f\u007f]/.test(sheetName) || /[\[\]:*?\/\\]/.test(sheetName)) {
    throw new GoogleSheetsConfigurationError();
  }
  return { spreadsheetId, serviceAccountEmail, privateKey, sheetName };
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function createServiceAccountAssertion(serviceAccountEmail, privateKey) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccountEmail,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  }));
  const unsignedAssertion = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedAssertion);
  return `${unsignedAssertion}.${signer.sign(privateKey, "base64url")}`;
}

function redact(value, submission, configuration, additionalSecrets = []) {
  let safe = String(value || "");
  const privateValues = [
    ...Object.values(submission),
    configuration.spreadsheetId,
    configuration.serviceAccountEmail,
    configuration.privateKey,
    ...additionalSecrets
  ].filter((item) => typeof item === "string" && item.length > 0).sort((left, right) => right.length - left.length);
  for (const privateValue of privateValues) safe = safe.replaceAll(privateValue, "[redacted]");
  return safe.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 600);
}

async function safeResponseBody(response, submission, configuration, additionalSecrets = []) {
  let body = "";
  try {
    body = await response.text();
  } catch {
    return "<unreadable response body>";
  }

  try {
    const parsed = JSON.parse(body);
    const providerError = parsed?.error;
    if (typeof providerError === "string") {
      return JSON.stringify({ error: redact(providerError, submission, configuration, additionalSecrets) }).slice(0, 600);
    }
    const safeFields = {};
    if (providerError && typeof providerError === "object") {
      for (const field of ["code", "status", "message"]) {
        if (typeof providerError[field] === "string" || typeof providerError[field] === "number") {
          safeFields[field] = typeof providerError[field] === "string"
            ? redact(providerError[field], submission, configuration, additionalSecrets)
            : providerError[field];
        }
      }
    } else if (typeof parsed?.message === "string") {
      safeFields.message = redact(parsed.message, submission, configuration, additionalSecrets);
    }
    return JSON.stringify(safeFields).slice(0, 600);
  } catch {
    return redact(body, submission, configuration, additionalSecrets);
  }
}

function buildAppendUrl(spreadsheetId, sheetName) {
  const range = `'${sheetName.replaceAll("'", "''")}'!A:L`;
  const url = new URL(`${SHEETS_API_ROOT}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`);
  url.searchParams.set("valueInputOption", "RAW");
  url.searchParams.set("insertDataOption", "INSERT_ROWS");
  url.searchParams.set("includeValuesInResponse", "false");
  return url;
}

export function enquiryRow(submission, submittedAt = new Date().toISOString()) {
  return [
    submittedAt,
    submission.projectType,
    submission.projectTypeLabel,
    submission.description,
    submission.name,
    submission.email,
    submission.budget || "",
    submission.budgetLabel || "",
    submission.businessName || "",
    submission.website || "",
    submission.timeline || "",
    submission.clientNumber
  ];
}

export async function appendContactSubmission(submission, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const configuration = configurationFromEnvironment(env);
  let assertion;
  try {
    assertion = createServiceAccountAssertion(configuration.serviceAccountEmail, configuration.privateKey);
  } catch {
    throw new GoogleSheetsConfigurationError();
  }

  const signal = AbortSignal.timeout(15000);
  const tokenResponse = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString(),
    signal
  });
  if (!tokenResponse.ok) {
    const safeBody = await safeResponseBody(tokenResponse, submission, configuration, [assertion]);
    throw new GoogleSheetsProviderError(Number(tokenResponse.status) || 502, "token", safeBody);
  }

  let tokenPayload;
  try {
    tokenPayload = await tokenResponse.json();
  } catch {
    throw new GoogleSheetsProviderError(502, "token", "<invalid token response>");
  }
  const accessToken = typeof tokenPayload?.access_token === "string" ? tokenPayload.access_token : "";
  if (!accessToken) throw new GoogleSheetsProviderError(502, "token", "<access token missing from response>");

  const appendResponse = await fetchImpl(buildAppendUrl(configuration.spreadsheetId, configuration.sheetName), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [enquiryRow(submission)] }),
    signal
  });
  if (!appendResponse.ok) {
    const safeBody = await safeResponseBody(appendResponse, submission, configuration, [assertion, accessToken]);
    throw new GoogleSheetsProviderError(Number(appendResponse.status) || 502, "append", safeBody);
  }
}
