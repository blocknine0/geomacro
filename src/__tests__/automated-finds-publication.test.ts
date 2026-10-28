import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {generateKeyPairSync,createHash} from "node:crypto";
import {signAutomatedFindsBatch,type RiskObjectSigningMaterial} from "../lib/risk-object-signing.server";
import {FINDS_CATEGORIES,verifyAutomatedFindsSnapshot,verifyAutomatedFindsEnvelope,FINDS_MAX_AGE_MS,type AutomatedFindsPayload} from "../lib/automated-finds-contract";
import {publishAutomatedFinds} from "../lib/automated-finds-publisher.server";
import {putAutomatedFinds,getAutomatedFinds} from "../../workers/control-plane/src/automated-finds";
import worker from "../../workers/control-plane/src/index.mjs";
import {automatedFindsResponse} from "../lib/automated-finds-reader.server";
import {auditSupabaseFreeCountryRuntime} from "../../scripts/audit-supabase-free-country-runtime";

const NOW=Date.parse("2026-10-16T12:30:00.000Z");
const pair=generateKeyPairSync("ed25519");
const pub=pair.publicKey.export({format:"der",type:"spki"}).toString("base64");
const material:RiskObjectSigningMaterial={key_id:"issuer-test",private_key_pkcs8_b64:pair.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),public_key_spki_b64:pub};
const keys={[material.key_id]:{public_key_spki_b64:pub,status:"active"}};
const story=(category:typeof FINDS_CATEGORIES[number])=>({
  id:category+"-1234abcd",category,title:"Geomacro finds official policy developments affecting trade conditions",
  why_it_matters:"Official policy developments can affect trade conditions; implementation needs separate verification.",
  what_changed:"An official publisher issued an original-dated policy release concerning trade conditions.",
  topic:"trade and economic relations",geography:null,development_type:"policy release",
  published_at:new Date(NOW-3600_000).toISOString(),date_precision:"exact" as const,
  observed_release_count:1 as const,sources_credited:[],status:"official_release_observed_unscored" as const,
  same_event_corrob_verified:false as const,severity:null,
});
const payload=(category=FINDS_CATEGORIES[0]):AutomatedFindsPayload=>({schema:"geomacro.automated-finds.v1",category,
  generated_at:new Date(NOW).toISOString(),source_run_id:"123456",source_sha:"a".repeat(40),
  source_verification:"publisher_native_release",independent_reviewed:false,scored:false,chargeable:false,
  delivery_scope:"free_website_only",original_release_delay_minutes:0,retention_days:30,
  healthy_feed_count:1,feed_count:2,signals:[story(category)],
});
const sign=(p:AutomatedFindsPayload)=>signAutomatedFindsBatch(p,material);
const reports=()=>FINDS_CATEGORIES.map(category=>({schema:"geomacro.website-stateless-intelligence.v1",category,
  checked_at:new Date(Date.now()-60_000).toISOString(),healthy_feed_count:1,feed_count:2,signals:[story(category)]})) as any;
function db(){
  let value:string|null=null,updated="";
  const env={AUTOMATED_FINDS_VERIFY_KEYS_JSON:JSON.stringify(keys),DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({
    first:async()=>value?{value_json:value}:null,
    run:async()=>{const changes=!value||args[2]>updated||(args[2]===updated&&args[1]===value)?1:0;
      if(changes){value=args[1];updated=args[2];}return {meta:{changes}};},
  })})}};
  return {env,tamper:(s:string)=>{value=s;}};
}
async function published(){
  const store=db();let body:any;
  const archive={putWithMetadataVerification:vi.fn(async(_key:string,bytes:Buffer,opt:any)=>{
    await opt.verifyRestored(Buffer.from(bytes));
    return {sha256:createHash("sha256").update(bytes).digest("hex"),full_body_readback_verified:true};
  })};
  const receipt=await publishAutomatedFinds({reports:reports(),archive,sign,now:new Date(NOW),runId:"123456",sourceSha:"a".repeat(40),
    promote:async b=>{body=b;expect((await putAutomatedFinds(store.env,b as any,NOW)).status).toBe(200);}});
  return {...store,body,receipt,archive};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(NOW);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Supabase-free automated issuer-signed Finds",()=>{
  it("audits 195 country routes without promoting global signed Finds to 585 country proofs",async()=>{
    const batches=await Promise.all(FINDS_CATEGORIES.map(category=>sign(payload(category))));
    vi.stubEnv("RISK_OBJECT_SIGNING_KEY_ID",material.key_id);
    vi.stubEnv("RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",pub);
    vi.stubEnv("RISK_OBJECT_VERIFY_KEYS_JSON",JSON.stringify(keys));
    const fake=vi.fn(async(input:any)=>Response.json(String(input).endsWith("source-runtime")?{
      ok:true,schema:"geomacro.supabase-free-source-runtime-public.v1",status:"ALL_CATEGORY_LANES_READABLE",
      supabase_requests:0,chargeable:false,contexts:FINDS_CATEGORIES.map(category=>({category})),
    }:{ok:true,schema:"geomacro.automated-finds-feed.v1",batches}));
    vi.stubGlobal("fetch",fake);
    const report=await auditSupabaseFreeCountryRuntime();
    expect(report.routing_cell_count).toBe(585);expect(fake).toHaveBeenCalledTimes(2);
    expect(report.paid_country_readiness_assessed).toBe(false);
    expect(report.country_category_matrix.cells.every(c=>c.CURRENT_EVIDENCE_AVAILABLE===null&&c.SIGNED_DELIVERY_VERIFIED===null)).toBe(true);
    expect(report.current_signed_country_delivery_verified_count).toBe(0);
  });
  it("signs, exactly restores archive, promotes and separately serves all three categories",async()=>{
    const {env,body,receipt,archive}=await published();
    expect(archive.putWithMetadataVerification).toHaveBeenCalledOnce();
    await verifyAutomatedFindsSnapshot(body.snapshot,keys,NOW);
    expect(receipt.independent_reviewed).toBe(false);expect(receipt.chargeable).toBe(false);
    const all=await (await getAutomatedFinds(env,null,NOW)).json();
    expect(all.batches).toHaveLength(3);expect(all.categories.every(c=>c.current_24h_count===1)).toBe(true);
    for(const category of FINDS_CATEGORIES){const one=await (await getAutomatedFinds(env,category,NOW)).json();
      expect(one.batches).toHaveLength(1);expect(one.batches[0]).toEqual(body.snapshot.batches.find(e=>e.payload.category===category));}
    expect(JSON.stringify(all)).not.toContain("source_url");
  });
  it("preserves original clocks and reports no current news for old or empty categories",async()=>{
    const p=payload();p.signals[0].published_at="2026-10-10T10:00:00.000Z";
    const e=await sign(p);expect(e.payload.signals[0].published_at).toBe("2026-10-10T10:00:00.000Z");
    const empty=await sign({...payload(),signals:[]});await verifyAutomatedFindsEnvelope(empty,keys,NOW);
    const {env,body}=await published();
    body.snapshot.batches[0]=e;body.proof.payload_sha256=createHash("sha256").update((await import("../lib/canonical-json")).canonicalJson(body.snapshot)).digest("hex");
    // Equal timestamp with changed bytes is rejected atomically.
    expect((await putAutomatedFinds(env,body,NOW)).status).toBe(409);
    const fresh=db();expect((await putAutomatedFinds(fresh.env,body,NOW)).status).toBe(200);
    expect((await (await getAutomatedFinds(fresh.env,null,NOW)).json()).categories[0].current_24h_count).toBe(0);
  });
  it("rejects changed content, unknown/revoked keys and expired key windows",async()=>{
    const e=await sign(payload());const bad=structuredClone(e);bad.payload.signals[0].what_changed+=" altered";
    await expect(verifyAutomatedFindsEnvelope(bad,keys,NOW)).rejects.toThrow();
    await expect(verifyAutomatedFindsEnvelope(e,{},NOW)).rejects.toThrow();
    await expect(verifyAutomatedFindsEnvelope(e,{[material.key_id]:{public_key_spki_b64:pub,status:"revoked"}},NOW)).rejects.toThrow();
    await expect(signAutomatedFindsBatch(payload(),{...material,not_after:"2026-10-15T00:00:00Z"})).rejects.toThrow();
    await expect(signAutomatedFindsBatch(payload(),{...material,public_key_spki_b64:generateKeyPairSync("ed25519").publicKey.export({format:"der",type:"spki"}).toString("base64")})).rejects.toThrow();
  });
  it("honours the production key registry revocation instead of replacing it with active",async()=>{
    vi.stubEnv("RISK_OBJECT_SIGNING_KEY_ID",material.key_id);
    vi.stubEnv("RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",material.private_key_pkcs8_b64);
    vi.stubEnv("RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",pub);
    vi.stubEnv("RISK_OBJECT_VERIFY_KEYS_JSON",JSON.stringify({[material.key_id]:{public_key_spki_b64:pub,status:"revoked"}}));
    await expect(signAutomatedFindsBatch(payload())).rejects.toThrow();
  });
  it("rejects future, raw, scored, independently-reviewed and cross-category claims",async()=>{
    for(const change of [{published_at:new Date(NOW+1000).toISOString()},
      {severity:50},{source_url:"https://private.invalid"},{category:"macro"}]){
      const p=payload();Object.assign(p.signals[0],change);await expect(sign(p)).rejects.toThrow();}
    await expect(sign({...payload(),independent_reviewed:true} as any)).rejects.toThrow();
    const p=payload();p.signals[0].date_precision="day";p.signals[0].published_at="2026-10-16";
    await expect(sign(p)).rejects.toThrow();
  });
  it("rejects stale signed batches, tampered D1 and missing category collection",async()=>{
    const {env,body,tamper}=await published();
    expect((await getAutomatedFinds(env,null,NOW+FINDS_MAX_AGE_MS+1)).status).toBe(503);
    body.snapshot.batches[0].payload.signals[0].title+=" changed";tamper(JSON.stringify(body));
    expect((await getAutomatedFinds(env,null,NOW)).status).toBe(503);
    await expect(publishAutomatedFinds({reports:reports().slice(1),archive:{} as any,promote:vi.fn(),sign})).rejects.toThrow();
  });
  it("keeps current signed D1 available but never claims B2 recovery if restore/readback fails",async()=>{
    for(const mode of ["corrupt","claimed","denied"]){
      const promote=vi.fn();const archive={putWithMetadataVerification:async(_k:any,b:any,opt:any)=>{
        if(mode==="denied")throw Error("HTTP403");
        if(mode==="corrupt")await opt.verifyRestored(Buffer.from("corrupted"));
        return {sha256:createHash("sha256").update(b).digest("hex"),full_body_readback_verified:true};}};
      const receipt=await publishAutomatedFinds({reports:reports(),archive,promote,sign,now:new Date(NOW),runId:"1",sourceSha:"a".repeat(40)});
      expect(receipt.full_b2_readback_verified).toBe(false);
      expect(receipt.archive_status).toBe("BACKUP_FAILED_CURRENT_D1_ONLY");
      expect(promote).toHaveBeenCalledOnce();
      const body=promote.mock.calls[0][0];expect(body.proof).toBeNull();expect(body.archive_attempted).toBe(true);
      await verifyAutomatedFindsSnapshot(body.snapshot,keys,NOW);
    }
  });
  it("preserves the prior verified archive while current signed D1 updates cost zero B2 calls",async()=>{
    const {env}=await published();
    vi.setSystemTime(NOW+30*60_000);
    const archive={putWithMetadataVerification:vi.fn()};let body:any;
    const receipt=await publishAutomatedFinds({reports:reports(),archive,sign,now:new Date(NOW+30*60_000),
      runId:"123457",sourceSha:"a".repeat(40),lastArchiveAt:new Date(NOW).toISOString(),lastArchiveVerified:true,
      promote:async b=>{body=b;expect((await putAutomatedFinds(env,b as any,NOW+30*60_000)).status).toBe(200);}});
    expect(archive.putWithMetadataVerification).not.toHaveBeenCalled();
    expect(receipt.full_b2_readback_verified).toBe(false);expect(receipt.archive_status).toBe("CADENCE_HELD");
    const doc=await (await getAutomatedFinds(env,null,NOW+30*60_000)).json();
    expect(doc.archive_checkpoint.generated_at).toBe(new Date(NOW).toISOString());
    expect(doc.archive_last_attempt_at).toBe(new Date(NOW).toISOString());
    expect(doc.batches[0].payload.generated_at).toBe(new Date(NOW+30*60_000).toISOString());
    expect(doc.full_b2_readback_verified).toBe(false);expect(body.archive_attempted).toBe(false);
  });
  it("backs off a failed archive attempt without suppressing current D1 publication",async()=>{
    const archive={putWithMetadataVerification:vi.fn()};const promote=vi.fn();
    const receipt=await publishAutomatedFinds({reports:reports(),archive,sign,promote,now:new Date(NOW),runId:"123457",sourceSha:"a".repeat(40),
      lastArchiveAt:new Date(NOW-30*60_000).toISOString(),lastArchiveVerified:false});
    expect(archive.putWithMetadataVerification).not.toHaveBeenCalled();
    expect(receipt.archive_status).toBe("BACKUP_BACKOFF_HELD");expect(promote).toHaveBeenCalledOnce();
  });
  it("requires authentication for writes, strict category queries and refuses stale proxy responses",async()=>{
    const {env}=await published();
    const denied=await worker.fetch(new Request("https://worker.invalid/v1/automated-finds",{method:"PUT",body:"{}"}),{...env,CONTROL_PLANE_TOKEN:"x".repeat(64)});
    expect(denied.status).toBe(401);
    expect((await getAutomatedFinds(env,"unknown",NOW)).status).toBe(400);
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("{}",{status:503})));
    expect((await automatedFindsResponse(new Request("https://geomacro.live/api/v1/intelligence/query?view=finds"))).status).toBe(503);
    expect((await automatedFindsResponse(new Request("https://geomacro.live/api/v1/intelligence/query?view=finds&country=USA"))).status).toBe(400);
  });
});


it("missed-tick recovery signs the same free Finds under shared writer serialization and quota",async()=>{
  const {readFileSync}=await import("node:fs");
  const source=readFileSync(".github/workflows/website-derived-news-cadence-backstop.yml","utf8");
  expect(source).toContain('ref: ${{ github.sha }}');
  expect(readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8")).toContain('ref: ${{ github.sha }}');
  expect(source).toContain('GEOMACRO_AUTOMATED_FINDS_PUBLICATION: "1"');
  expect(source).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
  expect(source).toContain('B2_REQUEST_BUDGET: "12"');
  expect(source).toContain('group: geomacro-website-derived-news-continuity');
  expect(source).toContain('workflows: ["Geomacro Intelligence Orchestrator", "Three-Domain 30-Minute Original Publisher Pulse", "Deploy D1 Control Plane", "Global OSINT to Website Intelligence (15-Minute Discovery)"]');
  expect(source).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
  expect(source).toContain(`contains(fromJSON('["success","failure","timed_out"]'), github.event.workflow_run.conclusion)`);
  expect(source.indexOf("Resolve existing D1 shared B2 quota ledger")).toBeLessThan(source.indexOf("bun scripts/ops/publish-website-derived-news.ts"));
  expect(source).toContain('await verifyAutomatedFindsEnvelope(envelope,keys)');
  expect(source).toContain('envelope.payload.source_sha!==process.env.GITHUB_SHA');
  expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  expect(source).not.toContain('GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM');
});
