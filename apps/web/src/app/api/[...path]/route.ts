import { NextRequest } from "next/server";

const API_INTERNAL_BASE = process.env.API_INTERNAL_BASE ?? "http://api:3001/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildTargetUrl(pathnameParts: string[], request: NextRequest) {
  const upstream = new URL(API_INTERNAL_BASE.endsWith("/") ? API_INTERNAL_BASE : `${API_INTERNAL_BASE}/`);
  const cleanPath = pathnameParts.map((segment) => encodeURIComponent(segment)).join("/");
  upstream.pathname = `${upstream.pathname.replace(/\/$/, "")}/${cleanPath}`;
  upstream.search = request.nextUrl.search;
  return upstream.toString();
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path = [] } = await context.params;
  const targetUrl = buildTargetUrl(path, request);
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  };

  const upstreamResponse = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstreamResponse.headers);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}
