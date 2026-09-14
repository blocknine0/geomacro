import { isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";

const MAX_URL_LENGTH = 2048;

function csvOrigins(value: string | undefined): Set<string> {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        try {
          return new URL(item).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
}

function jsonMap(value: string | undefined): Record<string, string> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const output: Record<string, string> = {};
    for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      try {
        output[new URL(key).origin] = raw.trim();
      } catch {
        // Ignore malformed configuration rather than expanding trust.
      }
    }
    return output;
  } catch {
    return {};
  }
}

function isBlockedIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
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
    a >= 224
  );
}

function isBlockedIpv6(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:169.254.")
  );
}

export function isBlockedA2AAddress(value: string) {
  const version = isIP(value);
  if (version === 4) return isBlockedIpv4(value);
  if (version === 6) return isBlockedIpv6(value);
  return true;
}

export function validateA2AEndpointUrl(
  raw: string,
  allowlist: Set<string>,
): URL {
  if (!raw || raw.length > MAX_URL_LENGTH) throw new Error("A2A_URL_INVALID");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("A2A_HTTPS_REQUIRED");
  if (url.username || url.password || url.hash) throw new Error("A2A_URL_CREDENTIALS_OR_FRAGMENT_FORBIDDEN");
  if (url.port && url.port !== "443") throw new Error("A2A_NONSTANDARD_PORT_FORBIDDEN");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("A2A_PRIVATE_HOST_FORBIDDEN");
  }
  if (isIP(hostname) && isBlockedA2AAddress(hostname)) throw new Error("A2A_PRIVATE_HOST_FORBIDDEN");
  if (!allowlist.has(url.origin)) throw new Error("A2A_ORIGIN_NOT_ALLOWLISTED");
  return url;
}

export async function assertA2ADnsPublic(url: URL) {
  if (isIP(url.hostname)) {
    if (isBlockedA2AAddress(url.hostname)) throw new Error("A2A_PRIVATE_HOST_FORBIDDEN");
    return;
  }

  const addresses = new Set<string>();
  const [v4, v6] = await Promise.all([
    resolve4(url.hostname).catch(() => [] as string[]),
    resolve6(url.hostname).catch(() => [] as string[]),
  ]);
  for (const address of [...v4, ...v6]) addresses.add(address);
  if (!addresses.size) throw new Error("A2A_DNS_UNRESOLVED");
  for (const address of addresses) {
    if (isBlockedA2AAddress(address)) throw new Error("A2A_DNS_PRIVATE_ADDRESS");
  }
}

export function a2aPushAllowedOrigins() {
  return csvOrigins(process.env.GEOMACRO_A2A_PUSH_ALLOWED_ORIGINS);
}

export function a2aRemoteAllowedOrigins() {
  return csvOrigins(process.env.GEOMACRO_A2A_REMOTE_ORIGINS);
}

export function a2aPushBearerForOrigin(origin: string) {
  return jsonMap(process.env.GEOMACRO_A2A_PUSH_BEARER_BY_ORIGIN_JSON)[origin] ?? null;
}

export function a2aRemoteBearerForOrigin(origin: string) {
  return jsonMap(process.env.GEOMACRO_A2A_REMOTE_AUTH_JSON)[origin] ?? null;
}

export async function secureA2AFetch(
  url: URL,
  init: RequestInit,
  options: { timeoutMs?: number; expectedOrigin?: string } = {},
) {
  if (options.expectedOrigin && url.origin !== options.expectedOrigin) {
    throw new Error("A2A_ORIGIN_CHANGED");
  }
  await assertA2ADnsPublic(url);
  return fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
  });
}
