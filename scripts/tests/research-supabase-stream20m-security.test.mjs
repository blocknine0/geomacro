import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const ingest=read("supabase/functions/gm-research-stream20m/index.ts");
const gate=read("supabase/functions/gm-research-risk-gate/index.ts");
const migration=read("supabase/migrations/20261104121000_research_stream20m_supabase_native_cron.sql");
const inventory=JSON.parse(read("config/official-ogl-atom-sources.json"));
const overlay=JSON.parse(read("config/research-risk-gate-official-atom-alternates.v1.json"));
const registered=[...inventory.sources,...overlay.sources];
test("isolated official sources and 195 canonical countries from the exact repo registry",()=>{
 const src=JSON.parse(ingest.match(/const SOURCES=(\[.*?\]);\nconst COUNTRIES=/u)?.[1]??"null");
 const countries=JSON.parse(ingest.match(/const COUNTRIES=(\[.*?\]);\nconst PROJECT=/u)?.[1]??"null");
 const canonical=read("scripts/lib/phase2h-country-originals-195.mjs")
  .split("const ROWS=\`")[1].split("\`;")[0].trim().split("\n")
  .map(x=>x.split("|")[0]);
 assert.equal(src.length,12);
 assert.equal(new Set(src.map(x=>x.url)).size,12);
 assert.equal(new Set(src.map(x=>x.id)).size,12);
 assert.equal(inventory.sources.length,8);
 assert.equal(overlay.sources.length,4);
 assert.equal(overlay.schema,"geomacro.research-risk-gate-official-atom-alternates.v1");
 assert.equal(overlay.scope,"ISOLATED_SUPABASE_NONCOMMERCIAL_RESEARCH_ONLY");
 assert.equal(overlay.commercial_eligible,false);
 assert.equal(overlay.execution_authorized,false);
 assert.equal(countries.length,195);
 assert.deepEqual(countries.map(x=>x.iso3),canonical);
 for(const s of src){
  const pin=registered.find(x=>x.source_id===s.id);
  assert.ok(pin);
  assert.equal(s.url,pin.feed_url);
  assert.equal(pin.private_research_only,true);
  assert.equal(pin.commercial_promotion_requires_separate_main_gates,true);
  assert.equal(pin.telegram_content_license,false);
  assert.equal(pin.uses_publisher_native_clock_only,true);
  assert.equal(new URL(s.url).hostname,"www.gov.uk");
 }
 assert.deepEqual([...new Set(src.map(x=>x.category))].sort(),
  ["CRITICAL_MINERALS","GEOPOLITICS","MACRO"]);
});
test("cron uses independent protected vault tokens and is recoverable",()=>{
 assert.match(migration,/create extension if not exists pg_net/u);
 assert.match(migration,/11,31,51 \* \* \* \*/u);
 assert.match(migration,/19,39,59 \* \* \* \*/u);
 assert.match(migration,/gm_research_stream20m_cron_token_v1/u);
 assert.match(migration,/gm_research_stream20m_read_token_v1/u);
 assert.match(migration,/not exists\(/u);
 assert.match(migration,/vault\.create_secret/u);
 assert.doesNotMatch(migration,/insert into vault\.secrets/iu);
 assert.match(migration,/revoke all on function public\.gm_research_stream20m_auth/u);
 assert.match(migration,/revoke all on function public\.gm_research_stream20m_read_auth/u);
 assert.match(migration,/enable row level security/u);
});
test("ingest and private gate do not use commercial output or hardcoded secrets",()=>{
 assert.match(ingest,/gm_research_stream20m_auth/u);
 assert.match(ingest,/gm_research_stream20m_provision_signer/u);
 assert.match(ingest,/attach_country_research_signature/u);
 assert.match(ingest,/gm_research_stream20m_runs/u);
 assert.match(ingest,/SOURCE_UNAVAILABLE/u);
 assert.match(ingest,/RESEARCH_DURABLE_SIGNED_READBACK_FAILED/u);
 assert.match(ingest,/first_published_at/u);
 assert.match(ingest,/max\s?=\s?MAX_AGE|MAX_AGE=6/u);
 assert.match(gate,/gm_research_stream20m_read_auth/u);
 assert.match(gate,/gm_research_stream20m_verifier/u);
 assert.match(gate,/crypto\.subtle\.verify/u);
 assert.match(gate,/VERIFIED_SIGNED_RESEARCH_STATE_UNAVAILABLE/u);
 for(const source of [ingest,gate,migration]){
  assert.doesNotMatch(source,/gm_live_sec_|sk_live_[a-z0-9]/iu);
  assert.doesNotMatch(source,/rabbitmqctl\s+purge|drop table public\.country_risk_state/iu);
 }
});

test("new source-specific alternatives remain private, unverified candidates",()=>{
 const expected={
  uk_ofsi_ogl_sanctions_atom:"GEOPOLITICS",
  uk_otsi_ogl_sanctions_atom:"GEOPOLITICS",
  uk_ukef_ogl_macro_atom:"MACRO",
  uk_ukri_ogl_minerals_atom:"CRITICAL_MINERALS",
 };
 const src=JSON.parse(ingest.match(/const SOURCES=(\[.*?\]);\nconst COUNTRIES=/u)?.[1]??"null");
 for(const [id,cat] of Object.entries(expected)){
  const registered=overlay.sources.find(s=>s.source_id===id);
  assert.equal(registered?.category,cat);
  assert.equal(registered?.transport_verified_at_registration,false);
  assert.equal(registered?.original_article_verified_at_registration,false);
  assert.equal(src.filter(s=>s.id===id&&s.category===cat&&s.url===registered.feed_url).length,1);
 }
 assert.ok(ingest.includes('const url=originalUrl(deent(href||""));'));
 assert.ok(ingest.includes("const at=await firstPublished(e,Date.now());"));
 assert.match(ingest,/source_http_healthy:healthy/u);
 assert.match(ingest,/commercial_eligible:false/u);
});
