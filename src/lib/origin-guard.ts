import { getRequestHeader } from "@tanstack/react-start/server";

const ALLOWED_SUFFIXES = [
  "lovable.app",
  "lovable.dev",
  "lovableproject.com",
  "lovable.build",
  "localhost",
];

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
  if (ALLOWED_SUFFIXES.some((s) => originHost === s || originHost.endsWith("." + s))) return;
  throw new Error("Forbidden");
}
