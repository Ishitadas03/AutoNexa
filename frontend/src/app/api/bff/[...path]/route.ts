import { NextRequest, NextResponse } from "next/server.js";

export const maxDuration = 60;

function getBackendBaseUrl(): string {
  const internalUrl = process.env.BACKEND_INTERNAL_URL?.trim();
  if (internalUrl) return internalUrl.replace(/\/$/, "");

  const publicUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (publicUrl) return publicUrl.replace(/\/$/, "");

  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/$/, "")}`;
  }

  return "http://127.0.0.1:8000";
}

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams.path || [];
    const targetPath = pathSegments.join("/");
    const search = req.nextUrl?.search || (req.url ? new URL(req.url).search : "");
    const backendUrl = `${getBackendBaseUrl()}/api/v1/${targetPath}${search}`;

    const clientApiKey =
      req.headers.get("x-api-key")?.trim() ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

    const apiKey =
      clientApiKey ||
      process.env.AUTONEXA_API_KEY_ADMIN?.trim() ||
      process.env.API_KEY_ADMIN?.trim() ||
      process.env.SERVING_API_KEY_ADMIN?.trim() ||
      "autonexa-admin-key-secret";

    const headers: Record<string, string> = {
      "X-API-Key": apiKey,
    };

    const incomingContentType = req.headers.get("content-type");
    if (incomingContentType && !incomingContentType.includes("multipart/form-data")) {
      headers["Content-Type"] = incomingContentType;
    }

    const accept = req.headers.get("accept");
    if (accept) {
      headers["Accept"] = accept;
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

    const resContentType = backendRes.headers.get("content-type") || "";
    if (resContentType.includes("application/json")) {
      const data = await backendRes.json();
      return NextResponse.json(data, { status: backendRes.status });
    }

    // For non-JSON responses (CSV blobs, raw text, etc.)
    const blob = await backendRes.blob();
    const responseHeaders: Record<string, string> = {};
    if (resContentType) {
      responseHeaders["Content-Type"] = resContentType;
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
      { detail: error?.message || "Internal error proxying request to backend." },
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

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, ctx);
}
