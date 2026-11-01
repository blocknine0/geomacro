import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign as signBytes,verify as verifyBytes} from "node:crypto";
import {
 buildUnsignedPilotCheck,canonicalJson,toBytes,signablePilotCheck,sha256,
 validatePilotEnvelopeShape,verifySignedPilotCheck,requireActivePilotTrust,MAX_WIRE_BYTES
} from "../../workers/control-plane/src/predge-pilot-news-context-v2.mjs";
import {predgePilotCheckV2,publishPredgePilotCheckV2}
 from "../../workers/control-plane/src/predge-pilot-check-v2.mjs";
const NOW=Date.parse("2026-11-01T10:00:00.000Z");
const TOKEN="a".repeat(64),ADMIN="c".repeat(64);
const cats=["geopolitics","macro","rare_earth"];
function item(i,category=cats[i%3]){
 return {schema:"geomacro.derived-news-structural.v1",
   id:"news-"+String(i).padStart(4,"0"),category,
   original_published_at:new Date(NOW-60*60*1000-i*1000).toISOString(),
   headline:"Genuine official research reference "+i,
   confidence_state:"OFFICIAL_RELEASE_OBSERVED_UNSCORED",
   further_validation_required:true,event_detail_verified:false,
   country_subject_verified:false,independent_same_event_verified:false,
   numeric_impact_established:false,
   sources_credited:[],attribution_notices:[],
   chargeable:false,payable:false,signed_product_verified:false,
   raw_upstream_delivered:false,commercial_derived_rights_verified:false};
}
function feed(rows){
 return {ok:true,schema:"geomacro.derived-news-structural-feed.v1",
  projection:"attributed_research",retention_hours:72,
  generated_at:new Date(NOW-1000).toISOString(),
  raw_upstream_delivered:false,chargeable:false,signed:false,
  commercial_rights_verified:false,
  partner_resale_or_commercial_redistribution_authorized:false,
  counts:Object.fromEntries(cats.map(c=>[c,rows.filter(x=>x.category===c).length])),
  items:rows};
}
function fakeSigned(){
 const env=buildUnsignedPilotCheck(feed([item(1)]),NOW);
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const bytes=toBytes(signablePilotCheck(env));
 env.integrity.payload_hash=createHash("sha256").update(bytes).digest("hex");
 env.integrity.signature=signBytes(null,Buffer.from(bytes),privateKey).toString("base64");
 assert.equal(verifyBytes(null,Buffer.from(bytes),publicKey,
  Buffer.from(env.integrity.signature,"base64")),true);
 return env;
}
test("selects only 50 per category and reports exactly all omitted counts",()=>{
 const rows=Array.from({length:177},(_,i)=>item(i));
 const envelope=buildUnsignedPilotCheck(feed(rows),NOW);
 assert.equal(envelope.risk_gate.decision,"PAUSE");
 assert.equal(envelope.execution_authorized,false);
 assert.deepEqual(envelope.risk_gate.news_context.available_counts,
  {geopolitics:59,macro:59,rare_earth:59});
 assert.deepEqual(envelope.risk_gate.news_context.delivered_counts,
  {geopolitics:50,macro:50,rare_earth:50});
 assert.deepEqual(envelope.risk_gate.news_context.truncated_counts,
  {geopolitics:9,macro:9,rare_earth:9});
 assert.equal(validatePilotEnvelopeShape(envelope,NOW,false),true);
 assert.ok(JSON.stringify(envelope).length<MAX_WIRE_BYTES);
});
test("deterministic selection preserves mandatory research attribution",()=>{
 const credited={...item(5),attribution_required:true,sources_credited:["Official Statistics"],
   attribution_notices:["Adapted from official release; attribution required"]};
 const f=feed([credited,item(6)]);
 const out=buildUnsignedPilotCheck(f,NOW);
 const row=out.risk_gate.news_context.items_by_category.rare_earth[0];
 assert.deepEqual(row.sources_credited,credited.sources_credited);
 assert.deepEqual(row.attribution_notices,credited.attribution_notices);
 assert.equal(out.risk_gate.news_context.signed_product_verified,false);
 assert.equal(out.risk_gate.news_context.market_relevance_verified,false);
});
test("live bridge omits credit fields when no source credit is due",()=>{
 const row=item(9);delete row.sources_credited;delete row.attribution_notices;
 const out=buildUnsignedPilotCheck(feed([row]),NOW);
 const carried=out.risk_gate.news_context.items_by_category.geopolitics[0];
 assert.equal(Object.hasOwn(carried,"sources_credited"),false);
 assert.equal(Object.hasOwn(carried,"attribution_notices"),false);
});
test("rejects forged authority, duplicate news, mismatched credits, stale and future rows",()=>{
 const original=item(0);
 for(const rows of [[original,original],
   [{...original,chargeable:true}],
   [{...original,original_published_at:new Date(NOW-73*3600_000).toISOString()}],
   [{...original,original_published_at:new Date(NOW+3600_000).toISOString()}],
   [{...original,sources_credited:["Publisher"]}],
   [{...original,execution_authorized:true}],
   [{...original,confidence_state:"FAKE_VERIFIED"}]])
  assert.throws(()=>buildUnsignedPilotCheck(feed(rows),NOW),/PREDGE_PILOT_/);
});
test("caps wire bytes without misreporting delivered or truncated counts",()=>{
 const rows=Array.from({length:180},(_,i)=>({...item(i),headline:"Z".repeat(17000)}));
 const out=buildUnsignedPilotCheck(feed(rows),NOW);
 assert.ok(Buffer.byteLength(JSON.stringify(out))<MAX_WIRE_BYTES);
 const c=out.risk_gate.news_context;
 for(const category of cats){
  assert.equal(c.available_counts[category],
   c.delivered_counts[category]+c.truncated_counts[category]);
  assert.ok(c.delivered_counts[category]<=50);
 }
});
test("signed format and canonical-byte consistency reject an unpinned signer",async()=>{
 const forged=fakeSigned();
 assert.equal(validatePilotEnvelopeShape(forged,NOW,true),true);
 assert.equal(await sha256(toBytes(signablePilotCheck(forged))),
  forged.integrity.payload_hash);
 await assert.rejects(verifySignedPilotCheck(forged,{now:NOW}),/PREDGE_PILOT_INVALID_SIGNATURE/);
 const changed=structuredClone(forged);
 changed.risk_gate.news_context.items_by_category.macro[0].headline="TAMPERED";
 await assert.rejects(verifySignedPilotCheck(changed,{now:NOW}),/PREDGE_PILOT_HASH_MISMATCH/);
 await assert.rejects(verifySignedPilotCheck(forged,{now:NOW,
  registry:{"geomacro-risk-2026-03":{status:"retired",public_key_spki_b64:"malicious"}}}),
  /PREDGE_PILOT_TRUST_REGISTRY/);
});
test("expired and fake CONTINUE envelopes always reject",()=>{
 const body=buildUnsignedPilotCheck(feed([item(0)]),NOW);
 assert.throws(()=>validatePilotEnvelopeShape(body,NOW+3600_001,false),/PREDGE_PILOT_ENVELOPE_EXPIRED/);
 body.risk_gate.decision="CONTINUE";
 assert.throws(()=>validatePilotEnvelopeShape(body,NOW,false),/PREDGE_PILOT_RISK_GATE_BOUNDARY/);
});
test("missing/wrong partner authorization never reads D1 or consumes quota",async()=>{
 let writes=0,reads=0;
 const env={PREDGE_RESEARCH_NEWS_TOKEN:TOKEN,CONTROL_PLANE_TOKEN:ADMIN,
  DB:{batch:async()=>{writes++;return[];},prepare:()=>{reads++;throw Error("unexpected");}}};
 const url="https://control.example/v1/pilot/check";
 for(const request of [
  new Request(url),new Request(url,{headers:{authorization:"Bearer "+"f".repeat(64)}})]){
  const r=await predgePilotCheckV2(request,env,NOW);
  assert.equal(r.status,401);
 }
 assert.equal(writes,0);assert.equal(reads,0);
 const owner=new Request("https://control.example/v1/internal/predge-pilot-news-context-publish",{
  method:"PUT",headers:{authorization:"Bearer "+"f".repeat(64),"content-type":"application/json"},body:"{}"});
 assert.equal((await publishPredgePilotCheckV2(owner,env,NOW)).status,401);
 assert.equal(reads,0);
});
test("owner refuses forged signed envelope before any DB write",async()=>{
 let writes=0;
 const env={CONTROL_PLANE_TOKEN:ADMIN,
  RISK_GATE_VERIFY_KEYS_JSON:JSON.stringify({"geomacro-risk-2026-03":{
   status:"active",public_key_spki_b64:"MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k="}}),
  DB:{prepare(){writes++;throw Error("never should write");}}};
 const put=new Request("https://control.example/v1/internal/predge-pilot-news-context-publish",{
  method:"PUT",headers:{authorization:"Bearer "+ADMIN,"content-type":"application/json"},
  body:JSON.stringify(fakeSigned())});
 const r=await publishPredgePilotCheckV2(put,env,NOW);
 assert.equal(r.status,422);
 assert.equal(writes,0);
});
test("production GET and owner PUT reject missing/retired registry before any D1 read/write",async()=>{
 let reads=0;
 const storage={prepare(){reads++;throw Error("D1 must not be touched");}};
 const get=new Request("https://control.example/v1/pilot/check",{
   headers:{authorization:"Bearer "+TOKEN}});
 const put=()=>new Request("https://control.example/v1/internal/predge-pilot-news-context-publish",{
   method:"PUT",headers:{"content-type":"application/json",authorization:"Bearer "+ADMIN},
   body:JSON.stringify(fakeSigned())});
 const base={DB:storage,PREDGE_RESEARCH_NEWS_TOKEN:TOKEN,CONTROL_PLANE_TOKEN:ADMIN};
 for(const registry of [undefined,"{}",JSON.stringify({
  "geomacro-risk-2026-03":{status:"retired",public_key_spki_b64:
  "MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k="}})]){
   const env={...base,RISK_GATE_VERIFY_KEYS_JSON:registry};
   const getResponse=await predgePilotCheckV2(get,env,NOW);
   assert.equal(getResponse.status,503);
   assert.equal((await getResponse.json()).error,"PILOT_CHECK_ACTIVE_KEY_REGISTRY_UNAVAILABLE");
   const putResponse=await publishPredgePilotCheckV2(put(),env,NOW);
   assert.equal(putResponse.status,503);
   assert.equal((await putResponse.json()).error,"PILOT_CHECK_ACTIVE_KEY_REGISTRY_UNAVAILABLE");
 }
 assert.equal(reads,0);
});
test("pinned key is denied when key lifecycle ends before current verification clock",()=>{
 const spki="MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k=";
 const entry={status:"active",public_key_spki_b64:spki};
 assert.equal(requireActivePilotTrust({"geomacro-risk-2026-03":entry},NOW).status,"active");
 assert.throws(()=>requireActivePilotTrust({"geomacro-risk-2026-03":{
  ...entry,not_after:new Date(NOW-1).toISOString()}},NOW),/PREDGE_PILOT_KEY_RETIRED/);
 assert.throws(()=>requireActivePilotTrust({"geomacro-risk-2026-03":{
  ...entry,not_before:new Date(NOW+1).toISOString()}},NOW),/PREDGE_PILOT_KEY_NOT_YET_ACTIVE/);
 assert.throws(()=>requireActivePilotTrust({"geomacro-risk-2026-03":{
  ...entry,not_after:"corrupt"}},NOW),/PREDGE_PILOT_KEY_RETIRED/);
});
test("protected preview gate reads opt-in only after production environment is attached",async()=>{
 const fs=await import("node:fs");
 const workflow=fs.readFileSync(".github/workflows/predge-pilot-signed-news-v2-refresh.yml","utf8");
 // A production-environment Actions variable is not visible to a job-level
 // if expression; this caused manually dispatched runs to be silently skipped.
 assert.match(workflow,/^    if: >-$/m);
 assert.match(workflow,/github\.repository == 'blocknine0\/geomacro'/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/workflow_run\.head_repository\.full_name == github\.repository/);
 assert.match(workflow,/workflow_run\.conclusion == 'success'/);
 assert.match(workflow,/Three-Domain 30-Minute Original Publisher Pulse/);
 assert.match(workflow,/Verify prior signed-readback freshness and remaining daily quota/);
 assert.match(workflow,/steps\.cadence\.outputs\.should_run == 'true'/);
 assert.doesNotMatch(workflow,/^    if:.*vars\.GEOMACRO_PREDGE_SIGNED_PREVIEW_ENABLED/m);
 assert.match(workflow,/    environment: production/);
 assert.match(workflow,/      - name: Confirm production preview opt-in before accessing secrets/);
 assert.match(workflow,/          PREVIEW_ENABLED: \$\{\{ vars\.GEOMACRO_PREDGE_SIGNED_PREVIEW_ENABLED \}\}/);
 assert.ok(workflow.includes("GEOMACRO_PREDGE_RECURRING_REFRESH_APPROVAL"));
 assert.ok(workflow.includes("PREDGE_V2_RECURRING_NO_FUNDS_APPROVED"));
 assert.match(workflow,/PREDGE_MANUAL_SIGNING_APPROVAL_REQUIRED/);
 assert.match(workflow,/PREDGE_ONE_TIME_OWNER_SIGNING_APPROVED/);
 assert.match(workflow,/PREDGE_SCHEDULED_PREVIEW_OPT_IN_CONFIRMED/);
 assert.match(workflow,/PREDGE_PREVIEW_DISABLED_NO_SIGNING_OR_PUBLICATION/);
 assert.match(workflow,/MANUAL_CONFIRMATION: \$\{\{ inputs\.confirmation \}\}/);
 assert.match(workflow,/required: true/);
 const guarded=workflow.match(/if: steps\.opt_in\.outputs\.enabled == 'true'/g)??[];
 assert.equal(guarded.length,4); // checkout, node setup, token derive, signing/publish
 assert.ok(workflow.indexOf("id: opt_in")<workflow.indexOf("uses: actions/checkout@"));
 assert.ok(workflow.includes('schedule:\n    - cron: "11,41 * * * *"'));
});
test("protected signer manual approval and scheduled opt-in are independently fail-closed",async()=>{
 const fs=await import("node:fs");
 const os=await import("node:os");
 const path=await import("node:path");
 const {spawnSync}=await import("node:child_process");
 const yaml=fs.readFileSync(".github/workflows/predge-pilot-signed-news-v2-refresh.yml","utf8");
 const section=yaml.match(/      - name: Confirm production preview opt-in before accessing secrets[\s\S]*?        run: \|\n([\s\S]*?)(?=\n      - uses: actions\/checkout@)/);
 assert.ok(section,"opt-in runner gate must exist");
 const shell=section[1].split("\n").map(l=>l.replace(/^          /,"")).join("\n");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"predge-gate-"));
 try{
   const execute=(event,preview,confirm,recurring="")=>{
     const output=path.join(dir,"gate-output.txt");
     fs.writeFileSync(output,"");
     const result=spawnSync("bash",["-c",shell],{
       encoding:"utf8",
       env:{...process.env,GITHUB_OUTPUT:output,GITHUB_EVENT_NAME:event,
         PREVIEW_ENABLED:preview,MANUAL_CONFIRMATION:confirm,
         RECURRING_APPROVAL:recurring}
     });
     return {status:result.status,output:fs.readFileSync(output,"utf8"),
       stdout:result.stdout,stderr:result.stderr};
   };
   const manual=execute("workflow_dispatch","","PREDGE_V2_SIGN_ONCE_NO_FUNDS");
   assert.equal(manual.status,0,manual.stderr);
   assert.match(manual.output,/enabled=true/);
   assert.match(manual.stdout,/PREDGE_ONE_TIME_OWNER_SIGNING_APPROVED/);
   const denied=execute("workflow_dispatch","YES","");
   assert.equal(denied.status,2);
   assert.match(denied.output,/enabled=false/);
   assert.match(denied.stdout,/PREDGE_MANUAL_SIGNING_APPROVAL_REQUIRED/);
   const schedule=execute("schedule","YES","");
   assert.equal(schedule.status,0,schedule.stderr);
   assert.match(schedule.output,/enabled=true/);
   const scheduledSecret=execute("schedule","","","PREDGE_V2_RECURRING_NO_FUNDS_APPROVED");
   assert.equal(scheduledSecret.status,0,scheduledSecret.stderr);
   assert.match(scheduledSecret.output,/enabled=true/);
   assert.match(scheduledSecret.stdout,/PREDGE_SCHEDULED_PREVIEW_OPT_IN_CONFIRMED/);
   const badSecret=execute("schedule","","","WRONG_OR_MISSING_APPROVAL");
   assert.equal(badSecret.status,0,badSecret.stderr);
   assert.match(badSecret.output,/enabled=false/);
   const manualDeniedWithSecret=execute("workflow_dispatch","","","PREDGE_V2_RECURRING_NO_FUNDS_APPROVED");
   assert.equal(manualDeniedWithSecret.status,2);
   assert.match(manualDeniedWithSecret.output,/enabled=false/);
   const upstream=execute("workflow_run","","","PREDGE_V2_RECURRING_NO_FUNDS_APPROVED");
   assert.equal(upstream.status,0,upstream.stderr);
   assert.match(upstream.output,/enabled=true/);
   const upstreamOff=execute("workflow_run","","");
   assert.equal(upstreamOff.status,0,upstreamOff.stderr);
   assert.match(upstreamOff.output,/enabled=false/);
   const off=execute("schedule","","");
   assert.equal(off.status,0,off.stderr);
   assert.match(off.output,/enabled=false/);
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
test("routing keeps preexisting research and Risk Gate handlers unchanged",async()=>{
 const fs=await import("node:fs");
 const source=fs.readFileSync("workers/control-plane/src/index.mjs","utf8");
 assert.ok(source.includes('if(url.pathname==="/v1/pilot/check")return predgePilotCheckV2(request,env);'));
 assert.ok(source.includes("return predgeResearchDerivedNewsFeed(request,env);"));
 assert.ok(source.includes("return predgeRiskGateD1(request,env);"));
});
