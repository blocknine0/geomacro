import { createHash, createHmac } from "node:crypto";
import type { GeomacroRiskObject } from "./risk-object-contract";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "./risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "./commercial-risk-object-policy";
import { pinnedRiskObjectVerificationKeys } from "./risk-object-public-registry";

const DEFAULT_CONTROL_PLANE_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev";
const PUBLIC_TRUST_REGISTRY_URL =
  "https://geomacro.live/api/risk-object-keys";
const HASH_RE = /^[a-f0-9]{64}$/;
const REQUEST_TIMEOUT_MS = 2_500;
const TRUST_CACHE_MS = 60_000;

let trustCache:
  | {
      expires_at_ms: number;
      keys: RiskObjectVerificationKeys;
    }
  | null = null;

function controlPlaneToken() {
  const root = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
  if (root.length < 32) return null;
  return createHmac("sha256", root)
    .update("geomacro-control-plane-v1")
    .digest("hex");
}

function recordSha256(object: GeomacroRiskObject) {
  return createHash("sha256")
    .update(canonicalRiskObjectJson(object), "utf8")
    .digest("hex");
}

/**
 * Independent clients must not let a compromised website trust endpoint
 * introduce an attacker signing key or revive a retired/revoked signer.
 * Any approved key rotation requires an explicit canonical pin update AND
 * a matching public deployment; network failures never select a fallback.
 */
export function parsePinnedPublicRiskObjectRegistry(
  value: unknown,
): RiskObjectVerificationKeys | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as { ok?: unknown; keys?: unknown };
  if (payload.ok !== true || !Array.isArray(payload.keys) ||
      payload.keys.length === 0 || payload.keys.length > 16) return null;

  const remote: RiskObjectVerificationKeys = Object.create(null);
  for (const candidate of payload.keys) {
    if (!candidate || typeof candidate !== "object" ||
        Array.isArray(candidate)) return null;
    const raw = candidate as Record<string, unknown>;
    if (typeof raw.key_id !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw.key_id) ||
        raw.key_id === "__proto__" || raw.key_id === "constructor" ||
        raw.key_id === "prototype" ||
        Object.hasOwn(remote, raw.key_id) ||
        typeof raw.public_key_spki_b64 !== "string" ||
        !["active", "retired", "revoked"].includes(String(raw.status))) return null;
    remote[raw.key_id] = {
      public_key_spki_b64: raw.public_key_spki_b64,
      status: raw.status as "active" | "retired" | "revoked",
      not_before: raw.not_before == null ? null : String(raw.not_before),
      not_after: raw.not_after == null ? null : String(raw.not_after),
    };
  }

  let pinned: RiskObjectVerificationKeys;
  try { pinned = pinnedRiskObjectVerificationKeys(); } catch { return null; }
  const ids = Object.keys(pinned);
  if (Object.keys(remote).length !== ids.length) return null;
  for (const id of ids) {
    const expected = pinned[id];
    const found = remote[id];
    if (!found || typeof expected === "string" || typeof found === "string" ||
        expected.public_key_spki_b64 !== found.public_key_spki_b64 ||
        expected.status !== found.status ||
        (expected.not_before ?? null) !== (found.not_before ?? null) ||
        (expected.not_after ?? null) !== (found.not_after ?? null)) return null;
  }
  return remote;
}

export async function loadPublicRiskObjectVerificationKeys(): Promise<RiskObjectVerificationKeys | null> {
  const now = Date.now();
  if (trustCache && trustCache.expires_at_ms > now) {
    return trustCache.keys;
  }

  try {
    const response = await fetch(PUBLIC_TRUST_REGISTRY_URL, {
      headers: {
        accept: "application/json",
        "cache-control": "no-cache",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
    if (!response.ok) return null;

    const statedSize = Number(response.headers.get("content-length") ?? 0);
    if (!Number.isFinite(statedSize) || statedSize > 32 * 1024) return null;
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 32 * 1024) return null;
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return null; }
    const keys = parsePinnedPublicRiskObjectRegistry(payload);
    if (!keys) return null;

    trustCache = {
      keys,
      expires_at_ms: now + TRUST_CACHE_MS,
    };
    return keys;
  } catch {
    return null;
  }
}

export async function readD1VerifiedHotCountryGro(
  countryIso3: string,
  atOrBefore: string,
): Promise<GeomacroRiskObject | null> {
  const iso3 = countryIso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) return null;

  const requestedMs = Date.parse(atOrBefore);
  if (!Number.isFinite(requestedMs)) return null;

  const token = controlPlaneToken();
  if (!token) return null;

  const base = String(
    process.env.GEOMACRO_CONTROL_PLANE_URL ?? DEFAULT_CONTROL_PLANE_URL,
  ).replace(/\/+$/, "");
  if (!/^https:\/\/[A-Za-z0-9._-]+(?::\d+)?$/.test(base)) return null;

  try {
    const url = new URL(`${base}/v1/country-gro-hot/${iso3}`);
    url.searchParams.set("at_or_before", new Date(requestedMs).toISOString());
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "cache-control": "no-cache",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as Record<string, any>;
    const object = payload?.object as GeomacroRiskObject | undefined;
    if (
      payload?.ok !== true ||
      payload?.serving_store !== "cloudflare-d1" ||
      payload?.archive_store !== "backblaze-b2" ||
      payload?.archive_write_acknowledged !== true ||
      payload?.archive_readback_required_for_serving !== false ||
      !HASH_RE.test(String(payload?.record_sha256 ?? "")) ||
      !HASH_RE.test(String(payload?.archive_sha256 ?? "")) ||
      !object ||
      object.subject?.type !== "country" ||
      object.subject?.id !== iso3 ||
      object.object_id !== payload.object_id ||
      object.integrity?.payload_hash !== payload.payload_hash ||
      object.integrity?.signing_key_id !== payload.signing_key_id
    ) return null;

    const generatedMs = Date.parse(String(object.generated_at ?? ""));
    const expiresMs = Date.parse(String(object.expires_at ?? ""));
    if (
      !Number.isFinite(generatedMs) ||
      !Number.isFinite(expiresMs) ||
      generatedMs > requestedMs ||
      expiresMs <= requestedMs ||
      recordSha256(object) !== payload.record_sha256
    ) return null;

    const verificationKeys = await loadPublicRiskObjectVerificationKeys();
    if (!verificationKeys) return null;

    const signature = verifyRiskObjectSignature(object, verificationKeys);
    if (!signature.valid) return null;

    const commercial = verifyCommercialRiskObjectArtifact(object, {
      now: new Date(requestedMs),
      verification_keys: verificationKeys,
    });
    if (!commercial.deliverable) return null;

    return object;
  } catch {
    return null;
  }
}
