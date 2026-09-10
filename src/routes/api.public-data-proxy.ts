import process from "node:process";
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_TABLES = new Set([
  "events",
  "gri_snapshots",
  "market_disputes",
  "jury_votes",
]);

const SAFE_REQUEST_HEADERS = [
  "accept",
  "accept-profile",
  "range",
  "range-unit",
  "prefer",
] as const;

const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "content-range",
  "range-unit",
  "preference-applied",
] as const;

const PRIVATE_SOURCE_KEYS = new Set([
  "source_name",
  "source_domain",
  "source_url",
  "sourceName",
  "sourceDomain",
  "sourceUrl",
  "publisher",
  "publisher_name",
  "publisherName",
]);

function redactPrivateSourceIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPrivateSourceIdentity);
  if (!value || typeof value !== "object") return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(input)) {
    if (PRIVATE_SOURCE_KEYS.has(key)) continue;
    output[key] = redactPrivateSourceIdentity(nested);
  }
  return output;
}

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function handle(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return bad(405, "Read-only endpoint");
  }

  const incoming = new URL(request.url);
  const target = incoming.searchParams.get("target");
  if (!target || target.length > 8_192) return bad(400, "Invalid target");

  let parsed: URL;
  try {
    parsed = new URL(target, "https://public-data.invalid");
  } catch {
    return bad(400, "Invalid target");
  }

  if (!parsed.pathname.startsWith("/rest/v1/")) {
    return bad(400, "Only PostgREST reads are supported");
  }

  const table = parsed.pathname.slice("/rest/v1/".length).split("/")[0];
  if (!ALLOWED_TABLES.has(table)) return bad(403, "Table not public through this endpoint");

  const base = process.env.APP_SUPABASE_URL;
  const anon = process.env.APP_SUPABASE_ANON_KEY;
  if (!base || !anon) return bad(503, "Public data backend unavailable");

  const upstream = new URL(parsed.pathname + parsed.search, base);
  const headers = new Headers({
    apikey: anon,
    authorization: `Bearer ${anon}`,
  });
  for (const name of SAFE_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let response: Response;
  try {
    response = await fetch(upstream, {
      method: request.method,
      headers,
      redirect: "error",
    });
  } catch (error) {
    console.error("[public-data-proxy] upstream request failed", error);
    return bad(502, "Public data backend request failed");
  }

  const outHeaders = new Headers({
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) outHeaders.set(name, value);
  }

  if (request.method === "HEAD") {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders,
    });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const text = await response.text();
    try {
      const parsedBody = JSON.parse(text) as unknown;
      const redacted = redactPrivateSourceIdentity(parsedBody);
      outHeaders.set("content-type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(redacted), {
        status: response.status,
        statusText: response.statusText,
        headers: outHeaders,
      });
    } catch {
      return bad(502, "Public data backend returned invalid JSON");
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}

export const Route = createFileRoute("/api/public-data-proxy")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      HEAD: ({ request }) => handle(request),
    },
  },
});
