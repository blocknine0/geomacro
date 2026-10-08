import { createHash, createHmac } from "node:crypto";
import type { GeomacroRiskObject } from "./risk-object-contract";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "./risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "./commercial-risk-object-policy";

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

export async function fetchPublicRiskObjectVerificationKeys(): Promise<RiskObjectVerificationKeys | null> {
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
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      ok?: boolean;
      keys?: Array<{
        key_id?: unknown;
        public_key_spki_b64?: unknown;
        status?: unknown;
        not_before?: unknown;
        not_after?: unknown;
      }>;
    };
    if (payload?.ok !== true || !Array.isArray(payload.keys) || payload.keys.length < 1) {
      return null;
    }

    const keys: RiskObjectVerificationKeys = {};
    for (const raw of payload.keys) {
      const keyId = String(raw?.key_id ?? "").trim();
      const publicKey = String(raw?.public_key_spki_b64 ?? "").trim();
      const status = String(raw?.status ?? "").trim();
      if (
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(keyId) ||
        !publicKey ||
        (status !== "active" && status !== "retired" && status !== "revoked")
      ) {
        return null;
      }
      keys[keyId] = {
        public_key_spki_b64: publicKey,
        status,
        not_before:
          raw?.not_before == null || String(raw.not_before).trim() === ""
            ? null
            : String(raw.not_before),
        not_after:
          raw?.not_after == null || String(raw.not_after).trim() === ""
            ? null
            : String(raw.not_after),
      };
    }

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

    const verificationKeys = await fetchPublicRiskObjectVerificationKeys();
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
