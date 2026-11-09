import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 STEP3_SHADOW_NONFACT_FIXTURES,assertShadowNonfactPlan,fixtureSql,
 fixtureReadbackSql,fixtureReadbackMatches,fixtureReadbackMatchesPartial,
 seedShadowNonfactIndexes
} from "../ops/seed-step3-shadow-nonfact-index-fixture.mjs";
const source=readFileSync(
 "scripts/ops/seed-step3-shadow-nonfact-index-fixture.mjs","utf8");
test("exact reviewed 3x3 nonfact Shadow fixtures obey real baseline schema constraints",()=>{
 assert.equal(assertShadowNonfactPlan(),true);
 assert.equal(STEP3_SHADOW_NONFACT_FIXTURES.length,3);
 for(const f of STEP3_SHADOW_NONFACT_FIXTURES){
  assert.equal(f.rows.length,3);
  assert.ok(f.rows.every(r=>r.category==="geopolitics"||
   r.category==="macro"||r.category==="rare_earth"));
  const s=fixtureSql(f),read=fixtureReadbackSql(f);
  assert.match(s,/^INSERT OR IGNORE INTO (?:private_osint_news_25h|private_osint_source_checks_24h|website_derived_intelligence)/u);
  assert.match(read,/^SELECT [a-z0-9_,]+ FROM /u);
  assert.match(read,/LIMIT 4$/u);
  assert.doesNotMatch(s,/DROP TABLE|DELETE FROM|UPDATE |REPLACE INTO/iu);
  assert.ok(fixtureReadbackMatches(f,[...f.rows].sort((a,b)=>
   String(a[f.key]).localeCompare(String(b[f.key])))));
  assert.ok(!fixtureReadbackMatches(f,[]));
 }
});
test("safe retry accepts only exact previously committed subset",()=>{
 const f=STEP3_SHADOW_NONFACT_FIXTURES[0];
 assert.equal(fixtureReadbackMatchesPartial(f,[]),true);
 assert.equal(fixtureReadbackMatchesPartial(f,f.rows.slice(0,2)),true);
 assert.equal(fixtureReadbackMatchesPartial(f,[{...f.rows[0],category:"macro"}]),false);
 assert.equal(fixtureReadbackMatchesPartial(f,[f.rows[0],f.rows[0]]),false);
 assert.equal(fixtureReadbackMatchesPartial(f,[{...f.rows[0],item_id:"0".repeat(64)}]),false);
});
test("fake originals or commercial eligibility are never introduced",()=>{
 for(const f of STEP3_SHADOW_NONFACT_FIXTURES){
  for(const x of f.rows){
   const payload=x.projection_json??x.story_json;
   if(payload){
    const parsed=JSON.parse(payload);
    assert.equal(parsed.synthetic_test_data,true);
    if(x.projection_json){
     assert.equal(parsed.risk_gate_eligible,false);
     assert.equal(parsed.commercial_eligible,false);
    }else{
     assert.equal(parsed.not_an_original_news_story,true);
     assert.equal(parsed.rights_approved,false);
     assert.equal(parsed.qualified,false);
    }
   }
   assert.ok(!String(x.first_seen_at??"").startsWith("2026-"));
  }
 }
});
test("reject any non-main or unauthorized operation BEFORE Cloudflare provider network",async()=>{
 let calls=0;
 const out=await seedShadowNonfactIndexes({env:{GITHUB_ACTIONS:"true",
  GITHUB_REPOSITORY:"untrusted/repo",GITHUB_REF:"refs/heads/main",
  GITHUB_SHA:"a".repeat(40)},run:()=>({toString:()=>{}}),
  headroom:async()=>{calls++;throw Error("should not reach provider");},
  checkpoint:async()=>{calls++;throw Error("should not reach provider");}});
 assert.equal(out.fixture_status,"HOLD");
 assert.equal(out.stage1_physical_pass,false);
 assert.equal(out.production_d1_writes,0);
 assert.equal(out.real_news_originals_created,0);
 assert.equal(calls,0);
});
test("immutable guard requires exact protected main, real encrypted R2 checkpoint and no release",()=>{
 for(const text of [
  'GEOMACRO_STEP3_EXACT_SHA!==env.GITHUB_SHA',
  'GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED',
  'GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED',
  'captureDurableD1Checkpoint',
  'c.private_r2_encrypted_readback_verified!==true',
  'c.signed_manifest_readback_verified!==true',
  'fixtures'
 ])assert.ok(source.includes(text),text);
 assert.match(source,/status:"NOT_YET_VERIFIED"/u);
 assert.match(source,/signStep3StatusReceipt/u);
 assert.match(source,/out\.stage1_physical_pass=false/u);
 assert.match(source,/out\.production_d1_writes=0/u);
 assert.match(source,/config\/d1-hotspot-v2-canary\.hold/u);
 assert.doesNotMatch(source,/wrangler.*migrations.*apply|--apply.*D1_DATABASE_ID/u);
});
