import { lookup } from "node:dns/promises";

const FORBIDDEN_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.internal.",
  "metadata.azure.internal",
  "169.254.169.254",
  "100.100.100.200",
]);

function normalizedAddress(address: string) {
  return address.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function parseIpv4(address: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return null;
  const parts = address.split(".").map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function looksLikeIpv6(address: string) {
  return address.includes(":") && /^[0-9a-f:.]+$/i.test(address);
}

function mappedIpv4FromIpv6(address: string): string | null {
  const normalized = normalizedAddress(address);
  const marker = normalized.lastIndexOf(":ffff:");
  if (marker < 0 && !normalized.startsWith("::ffff:")) return null;

  const tail = normalized.slice(marker >= 0 ? marker + 6 : "::ffff:".length);
  if (parseIpv4(tail)) return tail;

  const groups = tail.split(":").filter(Boolean);
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) {
    return null;
  }
  const high = Number.parseInt(groups[0], 16);
  const low = Number.parseInt(groups[1], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function ipVersion(address: string): 0 | 4 | 6 {
  const normalized = normalizedAddress(address);
  if (parseIpv4(normalized)) return 4;
  if (looksLikeIpv6(normalized)) return 6;
  return 0;
}

export function isForbiddenA2AAddress(address: string): boolean {
  const normalized = normalizedAddress(address);
  const version = ipVersion(normalized);

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
    const mapped = mappedIpv4FromIpv6(normalized);
    if (mapped) return isForbiddenA2AAddress(mapped);
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith("ff")) return true;
    if (normalized.startsWith("2001:db8")) return true;
    if (normalized.startsWith("2001:10")) return true;
    return false;
  }

  return true;
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

  const hostname = normalizedAddress(url.hostname).replace(/\.$/, "");
  if (
    !hostname ||
    FORBIDDEN_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("A2A_URL_HOST_FORBIDDEN");
  }

  const version = ipVersion(hostname);
  if (version > 0 && isForbiddenA2AAddress(hostname)) {
    throw new Error("A2A_URL_ADDRESS_FORBIDDEN");
  }

  return url;
}

export async function assertA2APublicHttpsUrl(raw: string): Promise<URL> {
  const url = parseA2APublicHttpsUrl(raw);
  const hostname = normalizedAddress(url.hostname).replace(/\.$/, "");

  if (ipVersion(hostname) > 0) return url;

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
