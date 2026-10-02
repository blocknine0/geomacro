import {
  computeGeomacroIntelligenceProductHash,
  GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
} from "./geomacro-intelligence-contract";

const INTERNAL_KEY = /(^|_)(source|provider|licen[cs]e|provenance|retrieval)(_|$)/i;
const CURRENT_PROVIDER_IDENTITY = /\b(?:world[\s_-]+bank|gdelt|usgs|u\.?s\.?[\s_-]+geological[\s_-]+survey)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function allowedProviderKey(path: string[], key: string) {
  return key === "provider" && path.at(-1) === "payment";
}

function sanitizeString(key: string, value: string) {
  if (key === "delivery" && value.startsWith("GOVERNED_")) {
    return "GOVERNED_DERIVED_MODULE_STATE";
  }
  if (!CURRENT_PROVIDER_IDENTITY.test(value)) return value;
  if (key.includes("methodology")) return "geomacro-governed-derived-v1";
  return "governed derived intelligence";
}

function sanitize(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitize(entry, [...path, String(index)]));
  }
  if (!isRecord(value)) {
    return typeof value === "string" ? sanitizeString(path.at(-1) ?? "", value) : value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (INTERNAL_KEY.test(key) && !allowedProviderKey(path, key)) continue;
    output[key] = sanitize(child, [...path, key]);
  }
  return output;
}

/**
 * Strip internal evidence/source identity from a user or machine response.
 * This is a final defensive boundary; product builders must still avoid adding
 * source-specific fields in the first place.
 */
export function sanitizePublicPaidOutput<T>(payload: T): T {
  return sanitize(payload) as T;
}

/**
 * Legacy delivery-ledger payloads may predate the source-free boundary. Sanitize
 * them before replay and re-hash the structured intelligence core so the public
 * product hash still describes the bytes/fields the customer actually receives.
 */
export function sanitizeAndRehashPaidPreparedResponse(
  prepared: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = sanitizePublicPaidOutput(prepared) as Record<string, unknown>;
  if (sanitized.schema_version !== GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA) return sanitized;

  const {
    delivered_product_hash: _oldHash,
    availability,
    payment,
    ...coreWithoutProductHash
  } = sanitized;
  const deliveredProductHash = computeGeomacroIntelligenceProductHash(coreWithoutProductHash);
  return {
    ...coreWithoutProductHash,
    delivered_product_hash: deliveredProductHash,
    ...(availability === undefined ? {} : { availability }),
    ...(payment === undefined ? {} : { payment }),
  };
}

export function assertPublicPaidOutputBoundary(payload: unknown): void {
  const walk = (value: unknown, path: string[] = []) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, [...path, String(index)]));
      return;
    }
    if (!isRecord(value)) {
      if (typeof value === "string" && CURRENT_PROVIDER_IDENTITY.test(value)) {
        throw new Error(`PAID_OUTPUT_PROVIDER_IDENTITY_LEAK:${path.join(".")}`);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (INTERNAL_KEY.test(key) && !allowedProviderKey(path, key)) {
        throw new Error(`PAID_OUTPUT_INTERNAL_SOURCE_FIELD:${[...path, key].join(".")}`);
      }
      walk(child, [...path, key]);
    }
  };

  walk(payload);
}
