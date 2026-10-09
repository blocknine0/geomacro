#!/usr/bin/env node
// Source monitoring is deliberately not scored/paid/live intelligence.
// Only aggregated counts are logged or retained. No Supabase, D1 or B2.
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { probeOpenDiscoveryMesh } from "../lib/market-signal-discovery.mjs";

export const MARKET_SIGNAL_ARTIFACT = "artifacts/open-discovery-mesh/three-domain-signal-receipt.json";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const receipt = await probeOpenDiscoveryMesh();
  mkdirSync("artifacts/open-discovery-mesh", { recursive: true, mode: 0o700 });
  writeFileSync(MARKET_SIGNAL_ARTIFACT, JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 });
  console.log(JSON.stringify(receipt));
  if (receipt.source_reachability !== "ALL_POLL_OK") {
    console.warn("SOURCE_MONITOR_DEGRADED: upstream discovery temporarily unavailable; no scored/current claims made");
  }
  // Upstream transient loss is *not* a test failure, but the receipt must
  // preserve DEGRADED status so nobody labels it healthy production coverage.
}
