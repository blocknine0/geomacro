#!/usr/bin/env node

import { createGriDbClient } from "./lib/gri-db-client.mjs";

const db = createGriDbClient();

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...details }));
  process.exit(1);
}

async function oneSource(sourceId) {
  const result = await db
    .from("live_external_sources")
    .select("source_id,enabled_for_ingestion,enabled_for_commercial_signals,commercial_usage_status,raw_redistribution_allowed")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (result.error) fail("TELEGRAM_SOURCE_LOOKUP_FAILED", { source_id: sourceId });
  return result.data ?? null;
}

const publicMtproto = await oneSource("telegram_mtproto_flash");
const authorizedFeed = await oneSource("telegram_authorized_publisher_feed");

if (!publicMtproto) fail("TELEGRAM_PUBLIC_SOURCE_MISSING");
if (publicMtproto.enabled_for_ingestion !== false) fail("TELEGRAM_PUBLIC_MTPROTO_INGESTION_ENABLED");
if (publicMtproto.enabled_for_commercial_signals !== false) fail("TELEGRAM_PUBLIC_MTPROTO_COMMERCIAL_ENABLED");
if (publicMtproto.raw_redistribution_allowed !== false) fail("TELEGRAM_PUBLIC_MTPROTO_RAW_REDISTRIBUTION_ENABLED");

if (!authorizedFeed) fail("TELEGRAM_AUTHORIZED_FEED_SOURCE_MISSING");
if (authorizedFeed.enabled_for_commercial_signals !== false) fail("TELEGRAM_AUTHORIZED_FEED_DIRECT_COMMERCIAL_ENABLED");
if (authorizedFeed.raw_redistribution_allowed !== false) fail("TELEGRAM_AUTHORIZED_FEED_RAW_REDISTRIBUTION_ENABLED");

const channelsResult = await db
  .from("live_telegram_channel_registry")
  .select("channel_key,enabled,manual_review_status,rights_status,publisher_authorized,authorization_scope,authorization_reference,authorization_granted_at,authorization_expires_at");
if (channelsResult.error) fail("TELEGRAM_CHANNEL_REGISTRY_LOOKUP_FAILED");

const nowMs = Date.now();
const rows = Array.isArray(channelsResult.data) ? channelsResult.data : [];
const violations = [];
let authorizedCount = 0;
let enabledCount = 0;
let enabledAuthorizedCount = 0;

for (const row of rows) {
  const scope = String(row.authorization_scope ?? "").trim();
  const reference = String(row.authorization_reference ?? "").trim();
  const grantedAtMs = Date.parse(String(row.authorization_granted_at ?? ""));
  const expiresAtRaw = row.authorization_expires_at;
  const expiresAtMs = expiresAtRaw ? Date.parse(String(expiresAtRaw)) : null;
  const validAuthorization =
    row.publisher_authorized === true &&
    scope.length > 0 &&
    reference.length > 0 &&
    Number.isFinite(grantedAtMs) &&
    (expiresAtMs === null || (Number.isFinite(expiresAtMs) && expiresAtMs > nowMs && expiresAtMs > grantedAtMs));

  if (validAuthorization) authorizedCount += 1;
  if (row.enabled === true) enabledCount += 1;
  if (row.enabled === true && row.manual_review_status === "APPROVED" && validAuthorization) enabledAuthorizedCount += 1;

  if (row.publisher_authorized === true && !validAuthorization) {
    violations.push({ channel_key: row.channel_key, reason: "invalid_authorization_evidence" });
  }
  if (row.enabled === true && row.manual_review_status !== "APPROVED") {
    violations.push({ channel_key: row.channel_key, reason: "enabled_without_manual_approval" });
  }
  if (row.enabled === true && !validAuthorization) {
    violations.push({ channel_key: row.channel_key, reason: "enabled_without_publisher_authorization" });
  }
  if (row.rights_status === "COMMERCIAL_OK" && !validAuthorization) {
    violations.push({ channel_key: row.channel_key, reason: "commercial_rights_without_authorization_evidence" });
  }
}

if (authorizedFeed.enabled_for_ingestion === true && enabledAuthorizedCount === 0) {
  violations.push({ reason: "authorized_feed_enabled_without_active_authorized_channel" });
}

if (violations.length) fail("TELEGRAM_GOVERNANCE_VIOLATION", { violations });

console.log(JSON.stringify({
  ok: true,
  public_mtproto_ingestion_enabled: publicMtproto.enabled_for_ingestion,
  public_mtproto_commercial_enabled: publicMtproto.enabled_for_commercial_signals,
  authorized_feed_ingestion_enabled: authorizedFeed.enabled_for_ingestion,
  authorized_feed_commercial_enabled: authorizedFeed.enabled_for_commercial_signals,
  channel_count: rows.length,
  enabled_channel_count: enabledCount,
  valid_publisher_authorization_count: authorizedCount,
  enabled_authorized_channel_count: enabledAuthorizedCount,
  invariant: "public Telegram disabled; enabled Telegram requires manual approval + explicit publisher authorization; Telegram never directly commercial",
}, null, 2));
