#!/usr/bin/env node

import { readFileSync } from "node:fs";

const CATEGORIES = new Set(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]);
const USERNAME = /^[a-z0-9_]{5,32}$/;
const SHA256 = /^[a-f0-9]{64}$/;
export const TELEGRAM_ENVELOPE_SCHEMA = "geomacro.telegram-lead-envelope.v2";
export const TELEGRAM_PROTOCOL_CONTRACT_SHA256 = "6da33ed2a966d58122039ba38d83e801476a6318bc89634d0b3d951e8ad017c9";

export function verifyTelegramLeadEnvelope(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("TELEGRAM_ENVELOPE_OBJECT_REQUIRED");
  }
  if (input.schema !== TELEGRAM_ENVELOPE_SCHEMA) {
    throw new Error("TELEGRAM_ENVELOPE_SCHEMA_MISMATCH");
  }
  if (input.protocol_contract_sha256 !== TELEGRAM_PROTOCOL_CONTRACT_SHA256) {
    throw new Error("TELEGRAM_PROTOCOL_CONTRACT_HASH_MISMATCH");
  }
  if (input.source_id !== "telegram_authorized_publisher_feed") {
    throw new Error("TELEGRAM_SOURCE_ID_NOT_AUTHORIZED_FEED");
  }
  if (!USERNAME.test(String(input.source_channel_key ?? ""))) {
    throw new Error("TELEGRAM_CHANNEL_KEY_INVALID");
  }
  if (!String(input.source_record_id ?? "").trim()) {
    throw new Error("TELEGRAM_SOURCE_RECORD_ID_REQUIRED");
  }
  if (!CATEGORIES.has(input.category)) {
    throw new Error("TELEGRAM_CATEGORY_INVALID");
  }
  if (input.verification_status !== "UNVERIFIED") {
    throw new Error("TELEGRAM_MUST_ENTER_UNVERIFIED");
  }
  if (input.scoring_eligible !== false || input.commercial_eligible !== false) {
    throw new Error("TELEGRAM_PREPROMOTION_FORBIDDEN");
  }
  if (!SHA256.test(String(input.content_hash ?? ""))) {
    throw new Error("TELEGRAM_CONTENT_HASH_INVALID");
  }
  if (!SHA256.test(String(input.event_family_key ?? ""))) {
    throw new Error("TELEGRAM_EVENT_FAMILY_KEY_INVALID");
  }
  const headline = String(input.headline ?? "").trim();
  if (!headline || headline.length > 512) {
    throw new Error("TELEGRAM_HEADLINE_INVALID");
  }
  if (input.country_iso3 != null && !/^[A-Z]{3}$/.test(String(input.country_iso3))) {
    throw new Error("TELEGRAM_COUNTRY_INVALID");
  }
  if (input.source_url != null) {
    const expected = `https://t.me/${input.source_channel_key}/`;
    if (!String(input.source_url).toLowerCase().startsWith(expected.toLowerCase())) {
      throw new Error("TELEGRAM_SOURCE_URL_CHANNEL_MISMATCH");
    }
  }
  return {
    source_id: "telegram_authorized_publisher_feed",
    source_record_id: input.source_record_id,
    published_at: input.published_at,
    headline,
    signal_category: input.category,
    source_channel: input.source_channel_key,
    source_channel_key: input.source_channel_key,
    source_url: input.source_url ?? null,
    verification_status: "UNVERIFIED",
    country_iso3: input.country_iso3 ?? null,
    raw_payload: null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  const text = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
  const payload = JSON.parse(text);
  process.stdout.write(`${JSON.stringify(verifyTelegramLeadEnvelope(payload))}\n`);
}
