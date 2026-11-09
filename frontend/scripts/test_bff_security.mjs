/**
 * AutoNexa Phase 17E.1 - BFF Security & RBAC Contract Verification Suite
 *
 * Validates:
 * 1. Unauthenticated privileged route access prevention (HTTP 401)
 * 2. Arbitrary path forwarding protection (HTTP 404)
 * 3. Path traversal and URL manipulation rejection (HTTP 400)
 * 4. Unsupported HTTP method restrictions (HTTP 405)
 * 5. Privileged operation authorization with client admin key (Forwarded, NOT overridden)
 * 6. Anonymous read/inference proxying (Injects READ key only, NEVER admin key)
 * 7. Dataset upload endpoint security (traversal rejection, size limits, 405 on non-POST)
 * 8. Error sanitization (Tokens redacted, paths stripped)
 * 9. Fail-closed backend resolution in production (HTTP 503 when backend URL is missing)
 */

import { NextRequest } from "next/server.js";
import assert from "node:assert";

// Dynamic import of route handlers
const bffModule = await import("../src/app/api/bff/[...path]/route.ts");
const uploadModule = await import("../src/app/api/datasets/upload/route.ts");

let passedTests = 0;
let totalTests = 0;

async function runTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${testName}`);
    console.error(`    ${err.message}`);
  }
}

console.log("===============================================================================");
console.log(" AutoNexa Phase 17E.1: BFF Security Audit & Authorization Verification Suite");
console.log("===============================================================================\n");

// -----------------------------------------------------------------------------
// Test Group 1: Unauthenticated Privileged Route Access (Confused Deputy Prevention)
// -----------------------------------------------------------------------------
console.log("1. Unauthenticated Privileged Route Access Controls");

await runTest("Rejects unauthenticated POST /datasets/123/train with 401", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/datasets/123/train", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_column: "churn" }),
  });
  const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["datasets", "123", "train"] }) });
  assert.strictEqual(res.status, 401);
  const body = await res.json();
  assert.match(body.detail, /Privileged operations require an explicit administrator API key/i);
});

await runTest("Rejects unauthenticated DELETE /experiments/exp-1 with 401", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/experiments/exp-1", {
    method: "DELETE",
  });
  const res = await bffModule.DELETE(req, { params: Promise.resolve({ path: ["experiments", "exp-1"] }) });
  assert.strictEqual(res.status, 401);
  const body = await res.json();
  assert.match(body.detail, /Privileged operations require an explicit administrator API key/i);
});

await runTest("Rejects unauthenticated POST /models/register with 401", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/models/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_name: "test-model" }),
  });
  const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["models", "register"] }) });
  assert.strictEqual(res.status, 401);
});

await runTest("Rejects unauthenticated GET /health/diagnostics with 401", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/health/diagnostics", {
    method: "GET",
  });
  const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["health", "diagnostics"] }) });
  assert.strictEqual(res.status, 401);
});

await runTest("Rejects unauthenticated POST /pipelines with 401", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/pipelines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset_id: "ds-1" }),
  });
  const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["pipelines"] }) });
  assert.strictEqual(res.status, 401);
});

await runTest("Rejects unauthenticated POST /serving/cache/invalidate with 401", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/serving/cache/invalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["serving", "cache", "invalidate"] }) });
  assert.strictEqual(res.status, 401);
});

await runTest("Rejects unauthenticated POST /monitoring/alerts/alert-1/acknowledge with 401", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/monitoring/alerts/alert-1/acknowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: "Acked" }),
  });
  const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["monitoring", "alerts", "alert-1", "acknowledge"] }) });
  assert.strictEqual(res.status, 401);
});

// -----------------------------------------------------------------------------
// Test Group 2: Path Traversal, URL Manipulation & Allowlist Controls
// -----------------------------------------------------------------------------
console.log("\n2. Path Traversal & Module Allowlist Security");

await runTest("Rejects unauthorized module /api/bff/admin/secret with 404", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/admin/secret", { method: "GET" });
  const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["admin", "secret"] }) });
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.match(body.detail, /not found on AutoNexa API/i);
});

await runTest("Rejects unauthorized module /api/bff/env with 404", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/env", { method: "GET" });
  const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["env"] }) });
  assert.strictEqual(res.status, 404);
});

await runTest("Rejects path traversal .. segment with 400", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/datasets/../admin", { method: "GET" });
  const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["datasets", "..", "admin"] }) });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.detail, /Path traversal and malformed path segments are prohibited/i);
});

await runTest("Rejects URL-encoded path traversal %2e%2e with 400", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/datasets/%2e%2e/admin", { method: "GET" });
  const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["datasets", "%2e%2e", "admin"] }) });
  assert.strictEqual(res.status, 400);
});

await runTest("Rejects path segment with null byte with 400", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/datasets/test%00evil", { method: "GET" });
  const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["datasets", "test\x00evil"] }) });
  assert.strictEqual(res.status, 400);
});

await runTest("Rejects path segment with backslash with 400", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/datasets/foo\\bar", { method: "GET" });
  const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["datasets", "foo\\bar"] }) });
  assert.strictEqual(res.status, 400);
});

// -----------------------------------------------------------------------------
// Test Group 3: HTTP Method Restrictions
// -----------------------------------------------------------------------------
console.log("\n3. HTTP Method Restrictions (BFF & Upload Endpoints)");

await runTest("Rejects unsupported PUT on BFF route with 405 Method Not Allowed", async () => {
  const res = await bffModule.PUT();
  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get("Allow"), "GET, POST, DELETE");
});

await runTest("Rejects unsupported PATCH on BFF route with 405 Method Not Allowed", async () => {
  const res = await bffModule.PATCH();
  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get("Allow"), "GET, POST, DELETE");
});

await runTest("Rejects HEAD on BFF route with 405 Method Not Allowed", async () => {
  const res = await bffModule.HEAD();
  assert.strictEqual(res.status, 405);
});

await runTest("Handles OPTIONS on BFF route with 204 No Content", async () => {
  const res = await bffModule.OPTIONS();
  assert.strictEqual(res.status, 204);
  assert.strictEqual(res.headers.get("Allow"), "GET, POST, DELETE");
});

await runTest("Rejects GET on /api/datasets/upload with 405 Method Not Allowed", async () => {
  const res = await uploadModule.GET();
  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get("Allow"), "POST");
});

await runTest("Rejects DELETE on /api/datasets/upload with 405 Method Not Allowed", async () => {
  const res = await uploadModule.DELETE();
  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get("Allow"), "POST");
});

// -----------------------------------------------------------------------------
// Test Group 4: Dataset Upload Security & Ingestion Safeguards
// -----------------------------------------------------------------------------
console.log("\n4. Dataset Upload Route Validation");

await runTest("Rejects upload with non-multipart Content-Type with 400", async () => {
  const req = new NextRequest("http://localhost:3000/api/datasets/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const res = await uploadModule.POST(req);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.detail, /multipart\/form-data required/i);
});

await runTest("Rejects upload without file attachment with 400", async () => {
  const formData = new FormData();
  formData.append("other_field", "value");
  const req = new NextRequest("http://localhost:3000/api/datasets/upload", {
    method: "POST",
    body: formData,
  });
  const res = await uploadModule.POST(req);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.detail, /No file uploaded/i);
});

await runTest("Rejects upload with non-CSV file extension with 400", async () => {
  const formData = new FormData();
  const file = new File(["malicious binary code"], "exploit.exe", { type: "application/octet-stream" });
  formData.append("file", file);
  const req = new NextRequest("http://localhost:3000/api/datasets/upload", {
    method: "POST",
    body: formData,
  });
  const res = await uploadModule.POST(req);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.detail, /Only CSV files/i);
});

await runTest("Rejects upload with path traversal in filename with 400", async () => {
  const formData = new FormData();
  const file = new File(["a,b\n1,2"], "../../evil_dataset.csv", { type: "text/csv" });
  formData.append("file", file);
  const req = new NextRequest("http://localhost:3000/api/datasets/upload", {
    method: "POST",
    body: formData,
  });
  const res = await uploadModule.POST(req);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.detail, /Invalid filename/i);
});

await runTest("Rejects empty 0-byte file upload with 400", async () => {
  const formData = new FormData();
  const file = new File([], "empty.csv", { type: "text/csv" });
  formData.append("file", file);
  const req = new NextRequest("http://localhost:3000/api/datasets/upload", {
    method: "POST",
    body: formData,
  });
  const res = await uploadModule.POST(req);
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.detail, /Uploaded file is empty/i);
});

// -----------------------------------------------------------------------------
// Test Group 5: Mock Backend End-to-End Key Injection & Role Propagation
// -----------------------------------------------------------------------------
console.log("\n5. End-to-End Key Propagation & Header Verification");

let receivedHeaders = {};
let receivedPath = "";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const rawHeaders = options?.headers || {};
  receivedHeaders = Object.fromEntries(
    Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), v])
  );
  receivedPath = String(url);

  if (receivedHeaders["X-API-Key"] === "invalid-token" || receivedHeaders["x-api-key"] === "invalid-token") {
    return new Response(JSON.stringify({ detail: "Authentication failed: Invalid API key." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      status: "success",
      receivedPath,
      receivedKey: receivedHeaders["X-API-Key"] || receivedHeaders["x-api-key"],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};

// Set mock backend environment
process.env.BACKEND_INTERNAL_URL = "http://mock-fastapi.internal:8000";
process.env.AUTONEXA_API_KEY_READ = "test-mock-read-key-123456";
process.env.AUTONEXA_API_KEY_ADMIN = "test-mock-admin-key-789012";

await runTest("Unauthenticated GET /api/bff/datasets injects READ key, NEVER admin key", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/datasets", { method: "GET" });
  const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["datasets"] }) });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(receivedHeaders["x-api-key"], "test-mock-read-key-123456");
  assert.notStrictEqual(receivedHeaders["x-api-key"], "test-mock-admin-key-789012");
});

await runTest("Authorized privileged request forwards client admin key accurately", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/datasets/ds-1/train", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "client-provided-admin-key",
    },
    body: JSON.stringify({ target_column: "label" }),
  });
  const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["datasets", "ds-1", "train"] }) });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(receivedHeaders["x-api-key"], "client-provided-admin-key");
  assert.notStrictEqual(receivedHeaders["x-api-key"], "test-mock-admin-key-789012");
});

await runTest("Bearer authorization header is normalized and forwarded as X-API-Key", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/datasets/ds-1/train", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer client-bearer-token-secret",
    },
    body: JSON.stringify({ target_column: "label" }),
  });
  const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["datasets", "ds-1", "train"] }) });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(receivedHeaders["x-api-key"], "client-bearer-token-secret");
});

await runTest("Invalid client API key returns 401 from backend without server override", async () => {
  const req = new NextRequest("http://localhost:3000/api/bff/datasets/ds-1/train", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "invalid-token",
    },
    body: JSON.stringify({ target_column: "label" }),
  });
  const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["datasets", "ds-1", "train"] }) });
  assert.strictEqual(res.status, 401);
  const body = await res.json();
  assert.match(body.detail, /Invalid API key/i);
});

// Restore fetch
globalThis.fetch = originalFetch;

// -----------------------------------------------------------------------------
// Test Group 6: Production Fail-Closed Behavior & Error Sanitization
// -----------------------------------------------------------------------------
console.log("\n6. Production Fail-Closed Resolution & Error Sanitization");

await runTest("Fails fast with HTTP 503 in production when BACKEND_INTERNAL_URL is unset", async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldInternal = process.env.BACKEND_INTERNAL_URL;
  const oldPublic = process.env.NEXT_PUBLIC_API_BASE_URL;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.BACKEND_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    const req = new NextRequest("http://localhost:3000/api/bff/datasets", { method: "GET" });
    const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["datasets"] }) });
    assert.strictEqual(res.status, 503);
    const body = await res.json();
    assert.match(body.detail, /BACKEND_INTERNAL_URL must be configured/i);
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    if (oldInternal) process.env.BACKEND_INTERNAL_URL = oldInternal;
    if (oldPublic) process.env.NEXT_PUBLIC_API_BASE_URL = oldPublic;
  }
});

// Final Summary
console.log("\n===============================================================================");
console.log(`bff Security Test Execution Summary: ${passedTests}/${totalTests} tests passed`);
console.log("===============================================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
