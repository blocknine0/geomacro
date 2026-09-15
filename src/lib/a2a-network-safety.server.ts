import { lookup } from "node:dns/promises";
import * as net from "node:net";

const FORBIDDEN_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.internal.",
  "metadata.azure.internal",
  "169.254.169.254",
  "100.100.100.200",
]);

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

export function isForbiddenA2AAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const version = net.isIP(normalized);

  if (version === 4) {
    const parts = parseIpv4(normalized);
    if (!parts) return true;
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (version === 6) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith("ff")) return true;
    if (normalized.startsWith("2001:db8")) return true;
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      return isForbiddenA2AAddress(mapped);
    }
  }

  return version === 0;
}

export function parseA2APublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("A2A_URL_INVALID");
  }

  if (url.protocol !== "https:") throw new Error("A2A_URL_HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("A2A_URL_CREDENTIALS_FORBIDDEN");
  if (url.port && url.port !== "443") throw new Error("A2A_URL_PORT_FORBIDDEN");

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    FORBIDDEN_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("A2A_URL_HOST_FORBIDDEN");
  }

  if (net.isIP(hostname) && isForbiddenA2AAddress(hostname)) {
    throw new Error("A2A_URL_ADDRESS_FORBIDDEN");
  }

  return url;
}

export async function assertA2APublicHttpsUrl(raw: string): Promise<URL> {
  const url = parseA2APublicHttpsUrl(raw);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  if (net.isIP(hostname)) return url;

  let addresses: Awaited<ReturnType<typeof lookup>>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("A2A_URL_DNS_UNAVAILABLE");
  }

  if (addresses.length === 0 || addresses.some((entry) => isForbiddenA2AAddress(entry.address))) {
    throw new Error("A2A_URL_ADDRESS_FORBIDDEN");
  }

  return url;
}

export async function fetchA2AJson(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const url = await assertA2APublicHttpsUrl(rawUrl);
  const timeoutMs = Math.max(500, Math.min(10_000, Math.trunc(init.timeoutMs ?? 5_000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _ignored, ...requestInit } = init;
    return await fetch(url, {
      ...requestInit,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
