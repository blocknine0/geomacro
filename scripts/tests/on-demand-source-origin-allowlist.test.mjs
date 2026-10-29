import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  ON_DEMAND_OFFICIAL_HOSTS,
  approvedOnDemandSourceHostname,
} from "../lib/on-demand-source-origin-allowlist.mjs";
import {GLOBAL_OFFICIAL_RELEASE_FEEDS}
  from "../lib/global-official-release-feeds.mjs";

const discovery=readFileSync("src/lib/on-demand-global-discovery.server.ts","utf8");
const live=readFileSync("scripts/ops/verify-live-on-demand-real-apis.ts","utf8");
const representative=readFileSync("scripts/ops/verify-live-on-demand-representative-cases.ts","utf8");

test("all pinned global first-party release feeds share the bounded origin policy",()=>{
  const registered=[...new Set(GLOBAL_OFFICIAL_RELEASE_FEEDS.map(s=>s.host))];
  for(const host of registered) {
    assert.ok(approvedOnDemandSourceHostname(host), "missing registered source origin: "+host);
    assert.ok(live.includes('"'+host+'":'),"live receipt has no status family for "+host);
  }
  assert.equal(new Set(ON_DEMAND_OFFICIAL_HOSTS).size,ON_DEMAND_OFFICIAL_HOSTS.length);
  assert.ok(ON_DEMAND_OFFICIAL_HOSTS.length<=24);
});

test("arbitrary, obfuscated and external hosts are never implicitly permitted",()=>{
  for(const host of [
    "localhost","127.0.0.1","169.254.169.254","metadata.google.internal",
    "api.worldbank.org.attacker.example","www.energy.gov.evil.test",
    "WWW.GOV.UK","https://www.gov.uk","",
  ]) assert.equal(approvedOnDemandSourceHostname(host),false,host);
});

test("first-party source and both no-funds probes use the identical policy",()=>{
  assert.equal(discovery.match(/approvedOnDemandSourceHostname\(/gu)?.length,2);
  assert.equal(live.match(/approvedOnDemandSourceHostname\(/gu)?.length,1);
  assert.equal(representative.match(/approvedOnDemandSourceHostname\(/gu)?.length,1);
  assert.ok(discovery.includes('redirect: "error"'));
  assert.ok(live.includes('UNRECOGNIZED_PROBE_ORIGIN'));
  assert.ok(representative.includes('REPRESENTATIVE_PROBE_UNRECOGNIZED_ORIGIN'));
  assert.ok(discovery.includes('if(networkAttempts>=12)'));
  assert.ok(representative.includes('totalHttp>16'));
  assert.ok(live.includes('proof.total_bounded_network_attempts>17'));
  assert.ok(live.includes('proof.x402_commercial_release_authorized!==false'));
  assert.ok(representative.includes('qualified.commercial_delivery_eligible!==false'));
});
