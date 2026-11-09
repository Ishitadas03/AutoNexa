import { NextRequest, NextResponse } from "next/server.js";

export const maxDuration = 60;

/**
 * Permitted top-level API route modules.
 * Any request attempting to access arbitrary paths outside this allowlist is rejected with HTTP 404.
 */
const ALLOWED_MODULES = new Set([
  "auth",
  "datasets",
  "experiments",
  "models",
  "serving",
  "monitoring",
  "benchmarks",
  "pipelines",
  "health",
  "metrics",
]);

/**
 * Validates path segments against path traversal attacks, URL manipulation, and control characters.
 */
function validatePathSegments(segments: string[]): boolean {
  if (!segments || segments.length === 0) return false;

  for (const seg of segments) {
    if (!seg || typeof seg !== "string") return false;
    // Reject path traversal tokens
    if (seg === ".." || seg === "." || seg.includes("..") || seg.includes("/") || seg.includes("\\")) {
      return false;
    }
    // Reject URL-encoded path traversal sequences (%2e, %2f, %5c)
    if (/%2e|%2f|%5c/i.test(seg)) {
      return false;
    }
    // Reject null bytes, control characters, or excessive length
    if (/[\x00-\x1f\x7f]/.test(seg) || seg.length > 128) {
      return false;
    }
    // Strict alphanumeric, hyphens, underscores, dots (for file names or version numbers)
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(seg)) {
      return false;
    }
  }

  // Top-level segment must be in the allowed modules list
  if (!ALLOWED_MODULES.has(segments[0].toLowerCase())) {
    return false;
  }

  return true;
}

/**
 * Identifies privileged administrative endpoints that modify state or execute resource-intensive AutoML jobs.
 * Anonymous / unauthenticated callers are strictly prohibited from invoking these endpoints through the BFF.
 */
function isPrivilegedEndpoint(method: string, segments: string[]): boolean {
  const upperMethod = method.toUpperCase();
  const root = segments[0]?.toLowerCase() || "";

  // Auth module routes manage user registration, verification, sessions, and recovery directly
  if (root === "auth") return false;

  // All deletion operations on core resources are administrative
  if (upperMethod === "DELETE") return true;

  const second = segments[1]?.toLowerCase() || "";
  const last = segments[segments.length - 1]?.toLowerCase() || "";

  // Diagnostic health probe exposes database internal schemas
  if (root === "health" && second === "diagnostics") return true;

  if (upperMethod === "POST") {
    // Dataset mutations: training and direct uploads through BFF
    if (root === "datasets" && (last === "train" || last === "upload")) return true;

    // Model registry transitions, registration, and deletion
    if (root === "models" && (second === "register" || last === "stage")) return true;

    // Pipelines: creation and cancellation
    if (root === "pipelines") return true;

    // Model serving administrative routes (cache invalidation, registration)
    if (root === "serving" && (second === "cache" || last === "register" || last === "invalidate")) return true;

    // Operational monitoring alerts, references, windows, and retraining
    if (root === "monitoring") {
      if (
        last === "acknowledge" ||
        last === "reference" ||
        last === "windows" ||
        last === "ground-truth" ||
        last === "trigger" ||
        last === "promote"
      ) {
        return true;
      }
    }
    // Heavy research benchmarks & HPO
    if (root === "benchmarks") {
      if (
        second === "repeated-runs" ||
        second === "hpo-experiment" ||
        second === "multi-objective" ||
        second === "robust" ||
        last === "select"
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Resolves the backend FastAPI origin without assuming frontend Vercel URL is the backend origin.
 */
function getBackendBaseUrl(): string {
  const internalUrl = process.env.BACKEND_INTERNAL_URL?.trim();
  if (internalUrl) return internalUrl.replace(/\/$/, "");

  const publicUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (publicUrl && !publicUrl.includes("localhost") && !publicUrl.includes("127.0.0.1")) {
    return publicUrl.replace(/\/$/, "");
  }

  // In production, do NOT assume Vercel frontend URL is the backend origin!
  // If no backend URL is set, return empty string to fail fast with HTTP 503
  if (process.env.NODE_ENV === "production" && !internalUrl && !publicUrl) {
    return "";
  }

  return publicUrl ? publicUrl.replace(/\/$/, "") : "http://127.0.0.1:8000";
}

/**
 * Strips secret tokens or server paths from error details.
 */
function sanitizeError(msg: string | undefined): string {
  if (!msg) return "An internal error occurred.";
  return msg
    .replace(/[a-zA-Z0-9_\-]{20,}/g, "[REDACTED]")
    .replace(/[A-Za-z]:\\[^"'\s]+/g, "[REDACTED_PATH]");
}

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams.path || [];

    // 1. Path Traversal & Segments Validation
    if (!validatePathSegments(pathSegments)) {
      if (pathSegments.length > 0 && !ALLOWED_MODULES.has(pathSegments[0].toLowerCase())) {
        return NextResponse.json(
          { detail: `Endpoint '/api/v1/${pathSegments.join("/")}' not found on AutoNexa API.` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { detail: "Invalid path: Path traversal and malformed path segments are prohibited." },
        { status: 400 }
      );
    }

    // 2. Resolve backend URL
    const backendBase = getBackendBaseUrl();
    if (!backendBase) {
      return NextResponse.json(
        { detail: "Backend configuration missing: BACKEND_INTERNAL_URL must be configured with the FastAPI backend origin." },
        { status: 503 }
      );
    }

    const targetPath = pathSegments.join("/");
    const search = req.nextUrl?.search || (req.url ? new URL(req.url).search : "");
    const backendUrl = `${backendBase}/api/v1/${targetPath}${search}`;

    // 3. Authentication & RBAC Policy Enforcement
    const clientApiKey =
      req.headers.get("x-api-key")?.trim() ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

    const isPrivileged = isPrivilegedEndpoint(req.method, pathSegments);

    let effectiveApiKey: string;

    if (isPrivileged) {
      // Privileged operations REQUIRE an explicit client administrator credential.
      // Server-side admin credentials are NEVER injected into unauthenticated requests.
      if (!clientApiKey) {
        return NextResponse.json(
          {
            detail:
              "Authentication required: Privileged operations require an explicit administrator API key via 'X-API-Key' or 'Authorization: Bearer <key>' header.",
          },
          { status: 401 }
        );
      }
      effectiveApiKey = clientApiKey;
    } else {
      // Safe read/inference operations:
      // If client provided a credential, forward it.
      // Otherwise inject the server's READ/INFERENCE credential (NEVER the Admin key!).
      effectiveApiKey =
        clientApiKey ||
        process.env.AUTONEXA_API_KEY_READ?.trim() ||
        process.env.API_KEY_READ?.trim() ||
        process.env.SERVING_API_KEY_READ?.trim() ||
        "autonexa-read-key-secret";
    }

    const headers: Record<string, string> = {
      "X-API-Key": effectiveApiKey,
    };

    const incomingContentType = req.headers.get("content-type");
    if (incomingContentType && !incomingContentType.includes("multipart/form-data")) {
      headers["Content-Type"] = incomingContentType;
    }

    const accept = req.headers.get("accept");
    if (accept) {
      headers["Accept"] = accept;
    }

    // Forward session cookie and headers from browser
    const incomingCookie = req.headers.get("cookie");
    if (incomingCookie) {
      headers["Cookie"] = incomingCookie;
    }
    const incomingSession = req.headers.get("x-session-token");
    if (incomingSession) {
      headers["X-Session-Token"] = incomingSession;
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      if (incomingContentType?.includes("multipart/form-data")) {
        fetchOptions.body = await req.formData();
      } else {
        const bodyText = await req.text();
        if (bodyText) {
          fetchOptions.body = bodyText;
        }
      }
    }

    const backendRes = await fetch(backendUrl, fetchOptions);

    const setCookieHeader = backendRes.headers.get("set-cookie");
    const sessionHeader = backendRes.headers.get("x-session-token");

    const resContentType = backendRes.headers.get("content-type") || "";
    if (resContentType.includes("application/json")) {
      const data = await backendRes.json();
      const jsonRes = NextResponse.json(data, { status: backendRes.status });
      if (setCookieHeader) {
        jsonRes.headers.set("set-cookie", setCookieHeader);
      }
      if (sessionHeader) {
        jsonRes.headers.set("x-session-token", sessionHeader);
      }
      return jsonRes;
    }

    // Binary / non-JSON responses (CSV blobs, raw text)
    const blob = await backendRes.blob();
    const responseHeaders: Record<string, string> = {};
    if (resContentType) {
      responseHeaders["Content-Type"] = resContentType;
    }
    if (setCookieHeader) {
      responseHeaders["Set-Cookie"] = setCookieHeader;
    }
    if (sessionHeader) {
      responseHeaders["X-Session-Token"] = sessionHeader;
    }
    const disposition = backendRes.headers.get("content-disposition");
    if (disposition) {
      responseHeaders["Content-Disposition"] = disposition;
    }

    return new NextResponse(blob, {
      status: backendRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return NextResponse.json(
      { detail: sanitizeError(error?.message) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, ctx);
}

export async function PUT() {
  return NextResponse.json(
    { detail: "Method Not Allowed: AutoNexa BFF accepts only GET, POST, and DELETE." },
    { status: 405, headers: { Allow: "GET, POST, DELETE" } }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { detail: "Method Not Allowed: AutoNexa BFF accepts only GET, POST, and DELETE." },
    { status: 405, headers: { Allow: "GET, POST, DELETE" } }
  );
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "GET, POST, DELETE" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, DELETE",
      "Access-Control-Allow-Methods": "GET, POST, DELETE",
    },
  });
}
