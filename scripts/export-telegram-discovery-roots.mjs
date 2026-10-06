#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createGriDbClient } from "./lib/gri-db-client.mjs";

const OUT = process.env.TELEGRAM_DISCOVERY_ROOTS_OUT || "artifacts/telegram-discovery-roots.json";
const DOMAINS = new Set(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]);
const OFFICIAL_IDENTITY_RE =
  /(government|official state|central bank|national bank|ministry|department|geological|geoscience|statistics|statistical|customs|treasury|parliament|presiden|energy|mineral|finance|economy|trade)/i;

function isHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isOfficialIdentityRoot(source) {
  return String(source.source_id ?? "").toLowerCase().startsWith("gov_portal_") ||
    OFFICIAL_IDENTITY_RE.test(String(source.provider_name ?? ""));
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
    if (!cert.rights_status || cert.rights_status === "UNREVIEWED") continue;

    const rootUrl = cert.canonical_url || cert.endpoint_final_url || source.base_url;
    if (!isHttpUrl(rootUrl)) continue;

    const runtimeVerified =
      cert.endpoint_status === "PASS" &&
      cert.endpoint_disposition === "WORKING";
    const identityOnly = isOfficialIdentityRoot(source);
    if (!runtimeVerified && !identityOnly) continue;

    roots.push({
      source_id: source.source_id,
      provider_name: source.provider_name,
      category: source.category,
      country_scope: source.country_scope,
      root_url: rootUrl,
      discovery_tier: runtimeVerified ? "RUNTIME_VERIFIED" : "IDENTITY_ONLY",
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

  const identityCountryScopes = new Set(
    roots
      .filter((row) => row.discovery_tier === "IDENTITY_ONLY" && /^[A-Z]{3}$/.test(String(row.country_scope ?? "")))
      .map((row) => row.country_scope),
  );
  if (identityCountryScopes.size < 150) {
    throw new Error(`TELEGRAM_IDENTITY_DISCOVERY_COUNTRY_BREADTH_TOO_LOW:${identityCountryScopes.size}`);
  }

  const rootsSha256 = createHash("sha256").update(JSON.stringify(roots)).digest("hex");
  const artifact = {
    schema: "geomacro.telegram-governed-discovery-roots.v1",
    policy: {
      discovery_only: true,
      auto_authorization: false,
      auto_activation: false,
      runtime_verified_requires_endpoint_pass: true,
      identity_only_is_public_identity_discovery_only: true,
      identity_only_may_have_nonworking_runtime_endpoint: true,
      rights_status_forbidden: "UNREVIEWED",
      telegram_sources_excluded: true,
    },
    root_count: roots.length,
    identity_country_scope_count: identityCountryScopes.size,
    roots_sha256: rootsSha256,
    roots,
  };

  mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    root_count: roots.length,
    identity_country_scope_count: identityCountryScopes.size,
    roots_sha256: rootsSha256,
  })}\n`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
