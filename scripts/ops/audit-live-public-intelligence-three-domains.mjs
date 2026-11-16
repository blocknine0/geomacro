#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { summarizePublicIntelligenceFreshness } from "../lib/public-intelligence-freshness-audit.mjs";

const endpoints = Object.freeze({
  edge: "https://geomacro-intelligence.daspallab202391.workers.dev/intelligence",
  site: "https://geomacro.live/api/public/intelligence",
  overlay: "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/intelligence-overlay",
});
const OUTPUT = "artifacts/public-intelligence-freshness/three-domains.json";

async function probe(url) {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    let payload = null;
    try {
      const raw = await res.text();
      if (raw.length <= 256 * 1024) payload = JSON.parse(raw);
    } catch { /* Fail closed as missing proof. Never log raw body. */ }
    return {
      status: res.status,
      authority: res.headers.get("x-geomacro-authority"),
      current_overlay: res.headers.get("x-geomacro-current-overlay"),
      b2_sha256: res.headers.get("x-geomacro-b2-sha256"),
      payload,
      verified_b2_sha256: payload?.verified_b2_sha256,
      current_source_batch_at: payload?.current_source_batch_at,
    };
  } catch {
    return { status: 0, payload: null };
  }
}

const [edge, site, overlay] = await Promise.all([
  probe(endpoints.edge),
  probe(endpoints.site),
  probe(endpoints.overlay),
]);
const proof = summarizePublicIntelligenceFreshness({ edge, site, overlay });
const derived=Array.isArray(site.payload?.derived_signals)?site.payload.derived_signals:[];
const derivedCounts={geopolitics:0,macro:0,rare_earth:0};
const derivedLatest={geopolitics:null,macro:null,rare_earth:null};
for(const row of derived){
  if(!Object.hasOwn(derivedCounts,row?.category)||row?.severity!==null||
     row?.same_event_corrob_verified!==false||typeof row?.title!=="string"||
     !row.title.startsWith("Geomacro finds ")||/(?:https?:\/\/|www\.)/iu.test(JSON.stringify(row)))continue;
  derivedCounts[row.category]++;
  const published=Date.parse(String(row?.published_at??""));
  if(Number.isFinite(published))derivedLatest[row.category]=Math.max(derivedLatest[row.category]??-Infinity,published);
}
const derivedNewest=Math.max(-Infinity,...Object.values(derivedLatest).filter(value=>value!==null));
proof.derived_feed={
  read_status:site.payload?.derived_read_status??"missing",
  rows:derived.length,
  category_counts:derivedCounts,
  latest_by_category:Object.fromEntries(Object.entries(derivedLatest).map(([category,value])=>[
    category,value===null?null:new Date(value).toISOString(),
  ])),
  categories_covered:Object.entries(derivedCounts).filter(([,count])=>count>0).map(([category])=>category),
  newest_at:Number.isFinite(derivedNewest)?new Date(derivedNewest).toISOString():null,
  current_within_24h:Object.values(derivedLatest).every(value=>value!==null&&value<=Date.now()&&Date.now()-value<=24*60*60_000),
  scored:false,paid_eligible:false,
};
mkdirSync("artifacts/public-intelligence-freshness", {recursive: true});
writeFileSync(OUTPUT, JSON.stringify(proof,null,2)+"\n", {mode:0o600});
console.log(JSON.stringify(proof));
if (!proof.three_domain_current_scored_ready ||
    proof.current_overlay_state !== "D1_CURRENT_OVERLAY_BOUND_TO_B2_VISIBLE" ||
    proof.site_overlay_converged !== true) {
  process.exitCode = 3; // No fake green when only dated verified context exists.
}
