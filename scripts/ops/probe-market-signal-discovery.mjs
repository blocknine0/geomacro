#!/usr/bin/env node
// Source monitoring is deliberately not scored/paid/live intelligence.
// Only aggregated counts are logged or retained. No Supabase, D1 or B2.
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { probeQuotaSafeDiscovery } from "../lib/quota-safe-original-discovery-fallback.mjs";

export const MARKET_SIGNAL_ARTIFACT = "artifacts/open-discovery-mesh/three-domain-signal-receipt.json";

// A successful process must prove that all three discovery polls reached the
// provider. Actual event verification, commercial rights and freshness remain
// independent, fail-closed gates elsewhere. No secrets or source URLs exposed.
export function discoveryMonitorExitCode(receipt) {
  // Source-only green: genuine current GKG ZIP with all three bounded
  // thematic baskets inspected. DOC remains explicitly NOT POLLED; neither
  // a theme match nor a fresh batch establishes independent paid intelligence.
  const gkg=receipt?.gdelt_static_bulk_discovery;
  if(receipt?.source_reachability==="GKG_BULK_ACTIVE_DOC_NOT_POLLED" &&
     gkg?.state==="CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY" &&
     gkg.archive_integrity_verified===true &&
     Array.isArray(gkg.domains)&&gkg.domains.length===3 &&
     gkg.domains.every(x=>x.article_origin_publication_verified===false &&
       x.current_scored_event_verified===false &&
       x.commercial_rights_verified===false && x.chargeable===false) &&
     receipt.three_category_current_scored_ready===false &&
     receipt.chargeable===false && receipt.payments_performed===0 &&
     Array.isArray(receipt.categories) && receipt.categories.length===3 &&
     receipt.categories.every(x=>x.state==="DOC_NOT_POLLED_GKG_PRIMARY" &&
       x.source_transport_ok===false && x.chargeable===false))
     return 0;
  return receipt?.source_reachability === "ALL_POLL_OK" &&
    Array.isArray(receipt?.categories) && receipt.categories.length === 3 &&
    ["geopolitics", "macro", "rare_earth"].every((category) =>
      receipt.categories.some((item) => item.category === category &&
        item.source_transport_ok === true && !item.source_failure_reason)
    ) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const receipt = await probeQuotaSafeDiscovery();
  mkdirSync("artifacts/open-discovery-mesh", { recursive: true, mode: 0o700 });
  writeFileSync(MARKET_SIGNAL_ARTIFACT, JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 });
  console.log(JSON.stringify(receipt));
  if(receipt?.source_reachability==="GKG_BULK_ACTIVE_DOC_NOT_POLLED")
    console.log("GKG_BULK_DISCOVERY_SOURCE_OK: current verified GKG archive scanned for three categories; DOC NOT POLLED, original articles and paid delivery UNVERIFIED");
  if (discoveryMonitorExitCode(receipt) !== 0) {
    console.error("SOURCE_MONITOR_DEGRADED: open-signal upstream unhealthy; counts-only receipt preserved, commercial/current claims remain false");
    process.exitCode = 1;
  }
  // Operational cron/watch must be RED when the upstream returns 429 or is
  // unavailable. The always() artifact step still preserves the actual
  // counts-only receipt. A green command is never evidence of paid readiness.
}
