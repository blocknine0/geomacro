import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Strict same-origin check for AI-gateway-backed server functions.
 *
 * Previously this allowed any *.lovable.app / *.lovable.dev host, which let
 * other Lovable projects (and trivially-spoofed Origin headers from
 * non-browser clients) burn this project's GROQ_API_KEY
 * quota. We now require an exact host match against the request's own Host
 * header, plus localhost for dev. Header spoofing from non-browser clients
 * still works in principle (Origin is client-set), but the guard no longer
 * grants free passage to the entire Lovable hosting fleet.
 */
export function assertSameOrigin() {
  const origin = getRequestHeader("origin") ?? getRequestHeader("referer") ?? "";
  const host = getRequestHeader("host") ?? "";
  if (!origin || !host) throw new Error("Forbidden");
  let originHost = "";
  try {
    originHost = new URL(origin).hostname;
  } catch {
    throw new Error("Forbidden");
  }
  const reqHost = host.split(":")[0];
  if (originHost === reqHost) return;
  // Dev only: vite preview on localhost / 127.0.0.1 (either side).
  if (originHost === "localhost" || originHost === "127.0.0.1") return;
  if (reqHost === "localhost" || reqHost === "127.0.0.1") return;
  // Allow this project's known public hosts (preview + published + custom domains).
  const ALLOWED = new Set([
    "geomacro.live",
    "www.geomacro.live",
    "geomacrooracle.lovable.app",
    "id-preview--06310982-d80d-4d51-a786-7a015bd39be3.lovable.app",
  ]);
  if (ALLOWED.has(originHost)) return;
  throw new Error("Forbidden");
}
