#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createGriDbClient } from "./lib/gri-db-client.mjs";

const OUT = process.env.TELEGRAM_DISCOVERY_ROOTS_OUT || "artifacts/telegram-discovery-roots.json";
const DOMAINS = new Set(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]);

function isHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function main() {
  const db = createGriDbClient();
  const [sourcesResult, certsResult] = await Promise.all([
    db
      .from("live_external_sources")
      .select("source_id,provider_name,category,country_scope,base_url")
      .order("source_id", { ascending: true }),
    db
      .from("live_source_certification_records")
      .select("source_id,certification_state,rights_status,rights_evidence_ref,endpoint_status,endpoint_disposition,canonical_url,endpoint_final_url")
      .order("source_id", { ascending: true }),
  ]);

  if (sourcesResult.error) throw new Error(`TELEGRAM_DISCOVERY_SOURCE_READ_FAILED:${sourcesResult.error.message}`);
  if (certsResult.error) throw new Error(`TELEGRAM_DISCOVERY_CERT_READ_FAILED:${certsResult.error.message}`);

  const certBySource = new Map((certsResult.data ?? []).map((row) => [row.source_id, row]));
  const roots = [];

  for (const source of sourcesResult.data ?? []) {
    const cert = certBySource.get(source.source_id);
    if (!cert) continue;
    if (!DOMAINS.has(String(source.category ?? "").toUpperCase())) continue;
    if (String(source.source_id ?? "").toLowerCase().startsWith("telegram")) continue;
    if (cert.endpoint_status !== "PASS" || cert.endpoint_disposition !== "WORKING") continue;
    if (!cert.rights_status || cert.rights_status === "UNREVIEWED") continue;

    const rootUrl = cert.canonical_url || cert.endpoint_final_url || source.base_url;
    if (!isHttpUrl(rootUrl)) continue;

    roots.push({
      source_id: source.source_id,
      provider_name: source.provider_name,
      category: source.category,
      country_scope: source.country_scope,
      root_url: rootUrl,
      certification_state: cert.certification_state,
      rights_status: cert.rights_status,
      rights_evidence_ref: cert.rights_evidence_ref ?? null,
      endpoint_status: cert.endpoint_status,
      endpoint_disposition: cert.endpoint_disposition,
    });
  }

  roots.sort((a, b) => `${a.category}:${a.source_id}`.localeCompare(`${b.category}:${b.source_id}`));
  if (roots.length === 0) throw new Error("TELEGRAM_DISCOVERY_ROOTS_EMPTY");

  const categories = new Set(roots.map((row) => row.category));
  for (const domain of DOMAINS) {
    if (!categories.has(domain)) throw new Error(`TELEGRAM_DISCOVERY_DOMAIN_MISSING:${domain}`);
  }

  const rootsSha256 = createHash("sha256").update(JSON.stringify(roots)).digest("hex");
  const artifact = {
    schema: "geomacro.telegram-governed-discovery-roots.v1",
    policy: {
      discovery_only: true,
      auto_authorization: false,
      auto_activation: false,
      endpoint_status_required: "PASS",
      endpoint_disposition_required: "WORKING",
      rights_status_forbidden: "UNREVIEWED",
      telegram_sources_excluded: true,
    },
    root_count: roots.length,
    roots_sha256: rootsSha256,
    roots,
  };

  mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, root_count: roots.length, roots_sha256: rootsSha256 })}\n`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
