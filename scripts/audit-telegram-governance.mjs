#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createGriDbClient } from "./lib/gri-db-client.mjs";

const OUT = process.env.TELEGRAM_GOVERNANCE_ARTIFACT || "artifacts/telegram-governance.json";

function asCount(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(`INVALID_COUNT:${value}`);
  return n;
}

async function main() {
  const db = createGriDbClient();
  const { data, error } = await db
    .from("live_telegram_governance_status")
    .select(
      "channel_registry_rows,enabled_channels,unsafe_enabled_channels,legacy_mtproto_enabled,telegram_commercial_sources,candidate_rows,active_candidates",
    )
    .single();

  if (error) throw new Error(`TELEGRAM_GOVERNANCE_READ_FAILED:${error.message}`);

  const proof = {
    channel_registry_rows: asCount(data?.channel_registry_rows),
    enabled_channels: asCount(data?.enabled_channels),
    unsafe_enabled_channels: asCount(data?.unsafe_enabled_channels),
    legacy_mtproto_enabled: asCount(data?.legacy_mtproto_enabled),
    telegram_commercial_sources: asCount(data?.telegram_commercial_sources),
    candidate_rows: asCount(data?.candidate_rows),
    active_candidates: asCount(data?.active_candidates),
  };

  const failures = [];
  if (proof.unsafe_enabled_channels !== 0) failures.push("UNSAFE_TELEGRAM_CHANNEL_ENABLED");
  if (proof.legacy_mtproto_enabled !== 0) failures.push("LEGACY_PUBLIC_MTPROTO_ENABLED");
  if (proof.telegram_commercial_sources !== 0) failures.push("TELEGRAM_DIRECT_COMMERCIAL_SOURCE_ENABLED");
  if (proof.active_candidates > proof.enabled_channels) failures.push("ACTIVE_CANDIDATE_WITHOUT_CHANNEL_BOUNDARY");

  const artifact = {
    schema: "geomacro.telegram-governance-proof.v1",
    checked_at: new Date().toISOString(),
    source: "public.live_telegram_governance_status",
    pass: failures.length === 0,
    failures,
    ...proof,
  };

  mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(artifact)}\n`);

  if (!artifact.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
