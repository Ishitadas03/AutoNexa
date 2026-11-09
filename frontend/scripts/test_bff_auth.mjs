/**
 * AutoNexa Phase 17F - BFF Authentication & Session Proxying Verification Suite
 *
 * Validates:
 * 1. Auth routes (/api/bff/auth/*) do NOT require client admin API keys (unauthenticated users can register/login).
 * 2. Incoming session cookies (Cookie: autonexa_session=...) are forwarded to backend.
 * 3. Backend Set-Cookie headers are propagated intact to the frontend response.
 * 4. Backend X-Session-Token header is forwarded to client.
 * 5. Non-auth privileged routes (/api/bff/datasets/123/train) STILL strictly enforce client admin key.
 * 6. Path traversal and unauthorized modules remain rejected.
 */

import { NextRequest } from "next/server.js";
import assert from "node:assert";

// Dynamic import of route handler
const bffModule = await import("../src/app/api/bff/[...path]/route.ts");

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
console.log(" AutoNexa Phase 17F: BFF Authentication & Cookie Proxying Verification");
console.log("===============================================================================\n");

// Configure environment
process.env.BACKEND_INTERNAL_URL = "http://mock-fastapi.internal:8000";

let lastFetchCall = null;
let mockResponseStatus = 200;
let mockResponseHeaders = {};
let mockResponseBody = { status: "ok" };

// Mock globalThis.fetch to avoid sandbox TCP socket isolation
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  lastFetchCall = {
    url: String(url),
    method: options?.method || "GET",
    headers: options?.headers || {},
    body: options?.body || null,
  };

  const headers = new Headers(mockResponseHeaders);
  return new Response(JSON.stringify(mockResponseBody), {
    status: mockResponseStatus,
    headers,
  });
};

try {
  // -----------------------------------------------------------------------------
  // Test Group 1: Auth Routes Exempt from Admin Key
  // -----------------------------------------------------------------------------
  console.log("1. Auth Route Privilege & Accessibility Checks");

  await runTest("POST /auth/register allowed without client admin key", async () => {
    mockResponseStatus = 201;
    mockResponseBody = { email: "user@example.com", is_verified: false, role: "user" };
    mockResponseHeaders = { "Content-Type": "application/json" };

    const req = new NextRequest("http://localhost:3000/api/bff/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
    });

    const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["auth", "register"] }) });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(lastFetchCall.url, "http://mock-fastapi.internal:8000/api/v1/auth/register");
    assert.strictEqual(lastFetchCall.method, "POST");
  });

  await runTest("POST /auth/login allowed without client admin key and forwards body", async () => {
    mockResponseStatus = 200;
    mockResponseBody = { user: { email: "user@example.com" }, session_token: "tok-12345" };
    mockResponseHeaders = {
      "Content-Type": "application/json",
      "Set-Cookie": "autonexa_session=test-token-opaque; Path=/; HttpOnly; SameSite=Lax",
      "X-Session-Token": "tok-12345",
    };

    const req = new NextRequest("http://localhost:3000/api/bff/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
    });

    const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["auth", "login"] }) });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastFetchCall.url, "http://mock-fastapi.internal:8000/api/v1/auth/login");

    // Verify Set-Cookie and X-Session-Token propagation to client response
    const setCookie = res.headers.get("set-cookie");
    assert.match(setCookie, /autonexa_session=test-token-opaque/);
    assert.match(setCookie, /HttpOnly/i);
    assert.strictEqual(res.headers.get("x-session-token"), "tok-12345");
  });

  // -----------------------------------------------------------------------------
  // Test Group 2: Cookie Forwarding on GET /auth/me
  // -----------------------------------------------------------------------------
  console.log("\n2. Session Cookie Forwarding Checks");

  await runTest("GET /auth/me forwards Cookie header to backend", async () => {
    mockResponseStatus = 200;
    mockResponseBody = { email: "user@example.com", is_verified: true, role: "user" };
    mockResponseHeaders = { "Content-Type": "application/json" };

    const req = new NextRequest("http://localhost:3000/api/bff/auth/me", {
      method: "GET",
      headers: {
        Cookie: "autonexa_session=active-session-token-999; other_cookie=xyz",
      },
    });

    const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["auth", "me"] }) });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastFetchCall.url, "http://mock-fastapi.internal:8000/api/v1/auth/me");
    assert.match(lastFetchCall.headers["Cookie"], /autonexa_session=active-session-token-999/);
  });

  // -----------------------------------------------------------------------------
  // Test Group 3: Non-Auth Routes STILL Require Admin Key
  // -----------------------------------------------------------------------------
  console.log("\n3. Privileged Non-Auth Route Regression Checks");

  await runTest("Privileged mutation POST /datasets/1/train still returns 401 without admin key", async () => {
    const req = new NextRequest("http://localhost:3000/api/bff/datasets/1/train", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_column: "target" }),
    });

    const res = await bffModule.POST(req, { params: Promise.resolve({ path: ["datasets", "1", "train"] }) });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.match(body.detail, /Privileged operations require an explicit administrator API key/i);
  });

  await runTest("Privileged deletion DELETE /experiments/exp-1 still returns 401 without admin key", async () => {
    const req = new NextRequest("http://localhost:3000/api/bff/experiments/exp-1", {
      method: "DELETE",
    });

    const res = await bffModule.DELETE(req, { params: Promise.resolve({ path: ["experiments", "exp-1"] }) });
    assert.strictEqual(res.status, 401);
  });

  // -----------------------------------------------------------------------------
  // Test Group 4: Path Traversal and Method Controls
  // -----------------------------------------------------------------------------
  console.log("\n4. Security Boundary Controls");

  await runTest("Rejects path traversal in auth route with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/bff/auth/../admin/users", {
      method: "GET",
    });

    const res = await bffModule.GET(req, { params: Promise.resolve({ path: ["auth", "..", "admin", "users"] }) });
    assert.strictEqual(res.status, 400);
  });

} finally {
  globalThis.fetch = originalFetch;
}

console.log("\n===============================================================================");
console.log(` Summary: ${passedTests}/${totalTests} tests passed`);
console.log("===============================================================================");

if (passedTests !== totalTests) {
  process.exit(1);
}
