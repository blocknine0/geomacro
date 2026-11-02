import test from "node:test";
import assert from "node:assert/strict";
import {
 parseGoogleRiskRss,deriveDailyRiskTiers,DAILY_RG_CORRIDORS,
 generateOneDailyRiskGate,readDailyRiskObservation,getDailyRiskGate,
 cleanupDailyRiskSupabase
} from "../../workers/control-plane/src/daily-risk-gate-generator.mjs";

const now=Date.parse("2026-11-02T06:00:00.000Z"),clock=new Date(now).toISOString();
const rss='<rss><channel><item><title>Red Sea shipping disrupted - Example News</title>'+
 '<link>https://news.google.com/rss/articles/abc</link>'+
 '<pubDate>Mon, 02 Nov 2026 05:00:00 GMT</pubDate>'+
 '<source url="https://www.example.net">Example News</source></item></channel></rss>';

test("bounded Google News RSS produces metadata, not event verification",async()=>{
 const items=await parseGoogleRiskRss(rss,now);
 assert.equal(items.length,1);
 assert.equal(items[0].publisher_host,"example.net");
 assert.equal(items[0].source_id,"google_news_rss_aggregated");
 assert.equal(items[0].original_article_verified,false);
 assert.equal((await parseGoogleRiskRss(rss,now+2*86400000)).length,0);
});
test("daily three-tier projection stays one-core advisory without current signed GRO",()=>{
 const obs={sources_observed:3,domains_observed:3};
 const t=deriveDailyRiskTiers({corridor_id:"bab-el-mandeb",observation:obs});
 assert.equal(t.core.gate_decision,"GATE_INSUFFICIENT_EVIDENCE");
 assert.equal(t.signal.gate_decision,"GATE_ADVISORY");
 assert.equal(t.signal.confidence_score,0.55);
 assert.equal(t.policy.strict_mode.gate_decision,t.core.gate_decision);
 assert.equal(t.policy.lenient_mode.gate_decision,"GATE_ADVISORY");
 assert.equal(t.policy.execution_authorized,false);
 assert.ok(DAILY_RG_CORRIDORS.find(x=>x.id==="bab-el-mandeb"));
});
function mockD1(){
 const rows=new Map();let fetches=0;
 const db={prepare(sql){return {bind(...p){return {
  async first(){
   if(sql.startsWith("SELECT corridor_id,day_utc,core_tier_json"))return rows.get(p[0]+"|"+p[1])??null;
   if(sql.startsWith("SELECT COUNT(*)"))return {n:0};
   if(sql.startsWith("SELECT * FROM corridor_gro_verified_hot"))return null;
   return null;
  },
  async all(){
   if(sql.includes("FROM corridor_native_news_candidates"))return {results:[{
    candidate_id:"a".repeat(64),source_id:"ukmto_incidents",native_published_at:clock,
    article_url:"https://www.ukmto.org/incident/001",source_title_sha256:"b".repeat(64),
    candidate_corridor_ids_json:'["bab_el_mandeb"]'
   }]};
   return {results:[]};
  },
  async run(){
   if(sql.startsWith("INSERT OR IGNORE INTO daily_tiered_risk_gates")){
    const [corridor_id,day_utc,core_tier_json,signal_tier_json,policy_tier_json,
     observation_json,hmac_proof_json,content_sha256,generated_at]=p;
    rows.set(corridor_id+"|"+day_utc,{corridor_id,day_utc,core_tier_json,signal_tier_json,
     policy_tier_json,observation_json,hmac_proof_json,content_sha256,generated_at,supabase_synced_at:null});
   }
   return {success:true};
  }
 }}}}};
 return {db,rows,get fetches(){return fetches}};
}
test("D1-first Bab-el-Mandeb snapshot makes three durable tiers and HMAC verified read",async()=>{
 const mock=mockD1();
 const env={DB:mock.db,RISK_GATE_OBSERVATION_HMAC_KEY:"an-unpredictable-32-byte-private-test-key-abcdefghi",
  RISK_GATE_TIERED_TOKEN:"c".repeat(64)};
 const c=DAILY_RG_CORRIDORS.find(x=>x.id==="bab-el-mandeb");
 const fetcher=async()=>{throw Error("D1_FIRST_MUST_NOT_FETCH_GOOGLE")};
 const output=await generateOneDailyRiskGate(env,c,{now,fetcher});
 assert.equal(output.ok,true);
 assert.equal(output.source_lane,"D1_EXISTING");
 assert.equal(output.d1_readback_verified,true);
 const stored=await readDailyRiskObservation(env,c.id,now);
 assert.ok(stored);
 assert.equal(stored.core_tier.gate_decision,"GATE_INSUFFICIENT_EVIDENCE");
 assert.equal(stored.signal_tier.gate_decision,"GATE_ADVISORY");
 assert.equal(stored.policy_tier.strict_mode.gate_decision,stored.core_tier.gate_decision);
 const response=await getDailyRiskGate(env,new URL("https://worker.test/v1/risk-gate/tiered/daily?corridor_id=bab-el-mandeb"),
  new Request("https://worker.test",{headers:{Authorization:"Bearer "+"c".repeat(64)}}),now);
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.audit_proof.signature_scope,"OBSERVATION_INTEGRITY_NOT_EVENT_TRUTH");
 assert.equal(payload.chargeable,false);
 const tampered=mock.rows.get(c.id+"|"+clock.slice(0,10));
 tampered.core_tier_json='{"tier":"CORE","gate_decision":"GATE_PASS"}';
 assert.equal(await readDailyRiskObservation(env,c.id,now),null);
});
test("10-day cleanup initializes once, preserves last three days, and only deletes when due",async()=>{
 let when=null,deleted=0,cutoff=null;
 const env={
  RISK_GATE_SUPABASE_ACCEPTANCE:"ACCEPTED_PRIVATE_RISK_GATE_DAILY",
  RISK_GATE_SUPABASE_URL:"https://rgexample.supabase.co",
  RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:"protected-test-service-role-key-not-production",
  DB:{prepare(sql){return {
   async first(){return when?{next_cleanup_at:when}:null},
   bind(...p){return {
    async run(){
     if(sql.startsWith("INSERT OR IGNORE"))when=p[0];
     if(sql.startsWith("UPDATE risk_gate_daily_housekeeping"))when=p[0];
     return {success:true};
    }
   }}
  }}}
 };
 const fetcher=async(url,options)=>{
  if(options.method==="DELETE"){deleted++;cutoff=url;return new Response("",{status:204})}
  return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
 };
 const first=await cleanupDailyRiskSupabase(env,{now,fetcher});
 assert.equal(first.initialized,true);
 assert.equal(deleted,0);
 const second=await cleanupDailyRiskSupabase(env,{now:now+9*86400000,fetcher});
 assert.equal(second.not_due,true);
 assert.equal(deleted,0);
 const tenth=await cleanupDailyRiskSupabase(env,{now:now+10*86400000,fetcher});
 assert.equal(tenth.ok,true);
 assert.equal(deleted,1);
 assert.match(cutoff,/generated_at=lt\./);
 assert.ok(cutoff.includes(encodeURIComponent(new Date(now+7*86400000).toISOString())));
});
