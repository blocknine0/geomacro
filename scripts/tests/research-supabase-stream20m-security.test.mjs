import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const ingest=read("supabase/functions/gm-research-stream20m/index.ts");
const gate=read("supabase/functions/gm-research-risk-gate/index.ts");
const migration=read("supabase/migrations/20261104121000_research_stream20m_supabase_native_cron.sql");
const inventory=JSON.parse(read("config/official-ogl-atom-sources.json"));
test("isolated official sources and 195 canonical countries from the exact repo registry",()=>{
 const src=JSON.parse(ingest.match(/const SOURCES=(\[.*?\]);\nconst COUNTRIES=/u)?.[1]??"null");
 const countries=JSON.parse(ingest.match(/const COUNTRIES=(\[.*?\]);\nconst PROJECT=/u)?.[1]??"null");
 const canonical=read("scripts/lib/phase2h-country-originals-195.mjs")
  .split("const ROWS=\`")[1].split("\`;")[0].trim().split("\n")
  .map(x=>x.split("|")[0]);
 assert.equal(src.length,8);
 assert.equal(countries.length,195);
 assert.deepEqual(countries.map(x=>x.iso3),canonical);
 for(const s of src){
  const pin=inventory.sources.find(x=>x.source_id===s.id);
  assert.ok(pin);
  assert.equal(s.url,pin.feed_url);
  assert.equal(pin.private_research_only,true);
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
