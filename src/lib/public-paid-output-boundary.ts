import {
  computeGeomacroIntelligenceProductHash,
  GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
} from "./geomacro-intelligence-contract";
import { isApprovedWdiAttribution } from "./world-bank-derived-attribution";
import {isApprovedFedBoardMinutesAttribution}
  from "./federal-reserve-board-derived-attribution";

const INTERNAL_KEY = /(^|_)(source|provider|licen[cs]e|provenance|retrieval)(_|$)/i;
// Source IDs are not the only raw data leak. These *payload-bearing* keys
// must never enter a fresh paid quote, even when buried in a derived-looking
// answer, structural module, signed object or payment metadata.
const PRIVATE_BYTES_KEY =
  /^(?:raw(?:_[a-z0-9]+)*|(?:article|feed|original|upstream|source|dataset)_(?:body|bytes|content|html|xml|text|payload|dump|export|full_text)(?:_[a-z0-9]+)*|(?:b2|storage)_(?:data|body|bytes|blob|dump|object|path)(?:_[a-z0-9]+)*)$/iu;
// Explicit false-value safety flags are NOT source material.
const SAFE_FALSE_FLAGS=new Set([
  "raw_data_delivered","raw_upstream_disclosed","raw_source_material_delivered",
  "raw_source_content_logged","raw_content_delivered","raw_source_delivered",
  "raw_source_material_redistributed","raw_upstream_perception_source_material_redistributed",
  "article_text_redistributed",
  "raw_numeric_source_rows_redistributed",
]);
function forbiddenRawField(key:string,child:unknown){
  return PRIVATE_BYTES_KEY.test(key) &&
    !(SAFE_FALSE_FLAGS.has(key.toLowerCase())&&child===false);
}
const CURRENT_PROVIDER_IDENTITY = /\b(?:world[\s_-]+bank|gdelt|usgs|u\.?s\.?[\s_-]+geological[\s_-]+survey)\b/i;
// Existing key-based filtering missed source URLs embedded in normal strings
// such as "answer", "analysis" and "limitations". Paid intelligence is
// structured DERIVED output, never a third-party publisher link catalogue.
const EMBEDDED_SOURCE_LOCATOR = /(?:https?:\/\/|www\.)[^\s<>"'\x60]+/iu;
const TELEGRAM_OWNER_FORBIDDEN_FIELD=/^(?:sender|sender_name|from|telegram_username|channel_handle|channel_name|chat_id|message_id|post_id|post_link|telegram_url|telegram_link|media_reference|media_url|attachment|text_entities|forwarded_from|edited|internal_chat_fingerprint|internal_message_fingerprint)$/iu;
/** Strictly for Telegram Desktop owner-file derived rows; does NOT certify
 * Telegram copyright, content permissions, or x402 payable status. */
function assertOwnerTelegramExportCustomerMetadata(value:Record<string,unknown>) {
 if(value.provenance!=="TELEGRAM_PUBLIC_EXPORT")return;
 if(value.verification_status!=="UNVERIFIED_CLAIM"||
    value.scored!==false||value.execution_authorized!==false)
   throw Error("PAID_TELEGRAM_OWNER_VERIFICATION_INVARIANT_INVALID");
 if(typeof value.derived_summary!=="string"||value.derived_summary.length>280||
    !/^(?:Geopolitical claim|Macro\/FX claim|Critical-minerals claim) [a-z /-]{8,100}; unverified export-derived research only(?:\.|\. Explicit numeric units present: [a-z%, ]{1,60}\.)$/u.test(value.derived_summary))
   throw Error("PAID_TELEGRAM_OWNER_DERIVED_SUMMARY_NOT_CURATED");
 for(const [key,child] of Object.entries(value)){
   if(TELEGRAM_OWNER_FORBIDDEN_FIELD.test(key)||
      typeof child==="string"&&/@[a-z0-9_]{5,32}\b/iu.test(child))
     throw Error("PAID_TELEGRAM_OWNER_ORIGINAL_METADATA_FORBIDDEN");
 }
}
export type PaidOutputSanitizeOptions = { rejectEmbeddedLinks?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function allowedProviderKey(path: string[], key: string) {
  return key === "provider" && path.at(-1) === "payment";
}

function sanitizeString(
  key: string, value: string, options: PaidOutputSanitizeOptions,
) {
  if (EMBEDDED_SOURCE_LOCATOR.test(value)) {
    // Fresh products must be rejected *before durable preparation/settlement*.
    // Historical already-settled ledger replays remain safe by replacing
    // embedded upstream links and re-hashing the delivered derived output.
    if (options.rejectEmbeddedLinks) {
      throw new Error("PAID_OUTPUT_EMBEDDED_SOURCE_URL_UNQUALIFIED");
    }
    return "governed derived intelligence";
  }
  if (key === "delivery" && value.startsWith("GOVERNED_")) {
    return "GOVERNED_DERIVED_MODULE_STATE";
  }
  if (!CURRENT_PROVIDER_IDENTITY.test(value)) return value;
  if (key.includes("methodology")) return "geomacro-governed-derived-v1";
  return "governed derived intelligence";
}

function sanitize(
  value: unknown, path: string[] = [],
  options: PaidOutputSanitizeOptions = {},
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitize(entry, [...path, String(index)], options));
  }
  if (!isRecord(value)) {
    return typeof value === "string" ? sanitizeString(path.at(-1) ?? "", value, options) : value;
  }

  if(options.rejectEmbeddedLinks)assertOwnerTelegramExportCustomerMetadata(value);
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    // Retain explicit false-only safety assertions even though their key
    // contains "raw" or "source"; never let a true claim through this hole.
    if (SAFE_FALSE_FLAGS.has(key.toLowerCase()) && child === false) {
      output[key] = false;
      continue;
    }
    if (path.length === 0 && key === "data_attribution") {
      // Narrow exemptions for fixed WDI or Board original-article credit.
      // Attribution format alone never grants commercial source rights.
      if (!isApprovedWdiAttribution(child) &&
          !isApprovedFedBoardMinutesAttribution(child))
        throw Error("PAID_OUTPUT_UNQUALIFIED_DATA_ATTRIBUTION");
      output[key] = child;
      continue;
    }
    if (forbiddenRawField(key,child)) {
      if(options.rejectEmbeddedLinks)
        throw Error("PAID_OUTPUT_UNQUALIFIED_RAW_MATERIAL_FIELD");
      // Historical sanitization drops raw material; NEVER deliver bytes,
      // and recompute the structured product hash on replay preparation.
      continue;
    }
    if (INTERNAL_KEY.test(key) && !allowedProviderKey(path, key) &&
        !(key==="provenance"&&child==="TELEGRAM_PUBLIC_EXPORT")) continue;
    output[key] = sanitize(child, [...path, key], options);
  }
  return output;
}

/**
 * Strip internal evidence/source identity from a user or machine response.
 * This is a final defensive boundary; product builders must still avoid adding
 * source-specific fields in the first place.
 */
export function sanitizePublicPaidOutput<T>(
  payload: T, options: PaidOutputSanitizeOptions = {},
): T {
  return sanitize(payload, [], options) as T;
}

/**
 * Legacy delivery-ledger payloads may predate the source-free boundary. Sanitize
 * them before replay and re-hash the structured intelligence core so the public
 * product hash still describes the bytes/fields the customer actually receives.
 */
export function sanitizeAndRehashPaidPreparedResponse(
  prepared: Record<string, unknown>,
  options: PaidOutputSanitizeOptions = {},
): Record<string, unknown> {
  const sanitized = sanitizePublicPaidOutput(prepared, options) as Record<string, unknown>;
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
      if (typeof value === "string" && EMBEDDED_SOURCE_LOCATOR.test(value)) {
        throw new Error(`PAID_OUTPUT_EMBEDDED_SOURCE_URL:${path.join(".")}`);
      }
      if (typeof value === "string" && CURRENT_PROVIDER_IDENTITY.test(value)) {
        throw new Error(`PAID_OUTPUT_PROVIDER_IDENTITY_LEAK:${path.join(".")}`);
      }
      return;
    }
    assertOwnerTelegramExportCustomerMetadata(value);
    for (const [key, child] of Object.entries(value)) {
      if (SAFE_FALSE_FLAGS.has(key.toLowerCase()) && child === false) continue;
      if (path.length === 0 && key === "data_attribution") {
        if (!isApprovedWdiAttribution(child) &&
            !isApprovedFedBoardMinutesAttribution(child))
          throw Error("PAID_OUTPUT_UNQUALIFIED_DATA_ATTRIBUTION");
        continue;
      }
      if(forbiddenRawField(key,child)) {
        throw new Error(`PAID_OUTPUT_RAW_MATERIAL_FIELD:${[...path,key].join(".")}`);
      }
      if (INTERNAL_KEY.test(key) && !allowedProviderKey(path, key) &&
          !(key==="provenance"&&child==="TELEGRAM_PUBLIC_EXPORT")) {
        throw new Error(`PAID_OUTPUT_INTERNAL_SOURCE_FIELD:${[...path, key].join(".")}`);
      }
      walk(child, [...path, key]);
    }
  };

  walk(payload);
}
