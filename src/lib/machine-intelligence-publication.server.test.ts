import {afterEach,describe,it,expect,vi} from "vitest";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {prepareMachinePublication} from "../../scripts/ops/prepare-machine-intelligence-publication";
import {gunzipSync} from "node:zlib";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import {machineIntelligenceDerivedRow,qualifyMachineIntelligenceBatch} from "./machine-intelligence-publication.server";
import {MACHINE_COMMERCIAL_PROFILE} from "./geomacro-machine-commercial-qualification.server";
import {publishMachineIntelligence} from "../../scripts/lib/machine-intelligence-publisher";
import {validateHotSnapshot} from "../../workers/control-plane/src/index.mjs";
import {sameEventClaimHash} from "../../scripts/lib/independent-same-event-qualification.mjs";
import {MACHINE_INTELLIGENCE_PROOF_SCHEMA} from "../../lib/intelligence-publication-authority.mjs";
import * as b2 from "./b2-live.server";

// Synthetic authority/HTML/licence fixtures ONLY. No production keys or facts.
const now=new Date("2026-10-17T11:00:00.000Z");
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const canonicalHash=(v:unknown)=>sha(canonicalRiskObjectJson(v));
const keys=[generateKeyPairSync("ed25519"),generateKeyPairSync("ed25519"),generateKeyPairSync("ed25519")];
function fixture() {
  for(const [i,prefix] of ["GEOMACRO_MACHINE_FACTS","GEOMACRO_MACHINE_RIGHTS"].entries()) {
    vi.stubEnv(prefix+"_PUBLIC_KEY_PEM",keys[i].publicKey.export({type:"spki",format:"pem"}).toString());
    vi.stubEnv(prefix+"_PUBLIC_KEY_SHA256",createHash("sha256").update(keys[i].publicKey.export({type:"spki",format:"der"})).digest("hex"));
  }
  vi.stubEnv("RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",keys[2].publicKey.export({type:"spki",format:"der"}).toString("base64"));
  const eventPackages:any[]=[],rights:any[]=[],pages=new Map<string,string>();
  const specs=[
    ["geopolitics","sanctions_policy",[
      ["un_news","un_news","https://news.un.org/en/story/2026/10/123456"],
      ["uk_fcdo","uk_fcdo","https://www.gov.uk/government/news/synthetic-policy-fixture"]]],
    ["macro","central_bank_policy",[
      ["federal_reserve","fed_monetary_original_press_rss_review","https://www.federalreserve.gov/newsevents/pressreleases/monetary20261017a.htm"],
      ["ecb","ecb","https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261017.en.html"]]],
    ["rare_earth","critical_mineral_supply",[
      ["usgs","usgs","https://www.usgs.gov/news/national-news-release/synthetic-mineral-fixture"],
      ["natural_resources_canada","natural_resources_canada","https://www.canada.ca/en/natural-resources-canada/news/2026/10/synthetic-mineral-fixture.html"]]],
  ] as const;
  for(const [category,event_type,sources] of specs) {
    const identity={country_iso3:"USA",event_type,actor_id:"government_agency",
      target_id:"policy_effect",location_id:"fixture_location",occurred_at:"2026-10-17T09:55:00Z"};
    const claim=sameEventClaimHash(category,identity);
    const candidates=sources.map(([org,id,url],i)=>{
      const at=`2026-10-17T10:${i?"10":"05"}:00Z`;
      const html=`<!DOCTYPE html><html><head><meta property="article:published_time" content="${at}"></head><body>Synthetic ${category} ${org} original test bytes, never real evidence.</body></html>`;
      pages.set(url,html);
      rights.push({source_id:id,category,certification_state:"CERTIFIED",commercial_usage_status:"DERIVED_ONLY",
        enabled_for_ingestion:true,enabled_for_commercial_signals:true,raw_redistribution_allowed:false,
        attribution_required:false,licence_name:"SYNTHETIC TEST permission only"});
      return {category,event:identity,same_event_claim_sha256:claim,original_article_url:url,
        publisher_host:new URL(url).hostname,publisher_organization_id:org,
        originating_reporting_organization_id:org,source_registry_id:id,private_only:true,
        native_published_at_verified:true,original_article_content_verified:true,
        original_publisher_url_verified:true,independently_authored_reporting_verified:true,
        syndicated_from:null,commercial_eligible:false,reporting_position:"confirms",
        original_article_sha256:sha(html),original_published_at:at};
    });
    const event={id:`fixture-${category}`,domain:category,event_type,
      title:`Geomacro finds synthetic ${category} policy test conditions`,primary_country:"USA",countries:["USA"],
      severity:61,confidence:82,direction:"escalating",relevance_weight:0.9,
      first_seen_at:identity.occurred_at,last_seen_at:"2026-10-17T10:10:00Z",material_evidence_at:identity.occurred_at,
      evidence_count:2,independent_source_count:2,corroboration_status:"CONFIRMED",
      source_ids:candidates.map(c=>c.source_registry_id),source_families:candidates.map(c=>c.originating_reporting_organization_id),
      content_hashes:candidates.map(c=>c.original_article_sha256),source_record_ids:candidates.map(c=>c.original_article_sha256),
      evidence_refs:[],structure_version:"synthetic-machine-event-v1",
      structured_payload:{public_summary:"Synthetic derived summary is bound by both authority signatures."}};
    const proof={schema:"geomacro.automated-commercial-proof.v1",profile:MACHINE_COMMERCIAL_PROFILE,
      country_iso3:"USA",category,event_id:event.id,exact_evidence_sha256:canonicalHash([event]),same_event_claim_sha256:claim,
      exact_original_evidence_set_sha256:sha(JSON.stringify(candidates.map(c=>({article_bytes_sha256:c.original_article_sha256,
        original_published_at:c.original_published_at,same_event_claim_sha256:claim})).sort((a,b)=>a.article_bytes_sha256.localeCompare(b.article_bytes_sha256)))),
      attested_at:"2026-10-17T10:35:00Z",expires_at:"2026-10-17T11:15:00Z",
      semantic_same_event_verified:true,independent_original_issuers_verified:true,counterevidence_checked:true,
      unresolved_material_contradictions:0,retractions_detected:0,
      source_permissions:candidates.map(c=>({source_registry_id:c.source_registry_id,
        originating_reporting_organization_id:c.originating_reporting_organization_id,
        original_article_sha256:c.original_article_sha256,licensed_article_scope_sha256:sha("synthetic scope"),
        permission_record_sha256:sha("synthetic permission"),licensed_derived_use:true,raw_redistribution_allowed:false,
        attribution_required:false,permission_verified_at:"2026-10-17T10:20:00Z",permission_expires_at:"2026-10-18T10:20:00Z"}))};
    const bytes=Buffer.from(canonicalRiskObjectJson(proof));
    eventPackages.push({schema:"geomacro.private-machine-intelligence-event.v1",category,country_iso3:"USA",event,candidates,
      envelope:{proof,facts_signature_b64:sign(null,bytes,keys[0].privateKey).toString("base64"),
        rights_signature_b64:sign(null,bytes,keys[1].privateKey).toString("base64")}});
  }
  const rows=eventPackages.map(pkg=>machineIntelligenceDerivedRow(pkg,now));
  const fetchImpl=vi.fn(async(url:string)=>new Response(pages.get(String(url))??"missing",{headers:{"content-type":"text/html"}}));
  const readRights=vi.fn(async()=>rights);
  return {rows,eventPackages,fetchImpl,readRights,pages,rights};
}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals()});
describe("machine Intelligence canonical publication bridge",()=>{
  it("assembles existing independently signed requests only into a private 0600 pinned file",async()=>{
    const t=fixture(),directory=mkdtempSync(join(tmpdir(),"geomacro-machine-batch-"));
    vi.stubGlobal("fetch",t.fetchImpl);vi.spyOn(b2,"readB2CommercialSourceRights").mockImplementation(t.readRights);
    vi.stubEnv("GEOMACRO_PRIVATE_REVIEW_DIR",directory);vi.useFakeTimers();vi.setSystemTime(now);
    const input=join(directory,"requests.json"),out=join(directory,"bundle.json");
    writeFileSync(input,JSON.stringify({schema:"geomacro.private-machine-intelligence-batch-request.v1",
      events:t.eventPackages.map(p=>({...p,schema:"geomacro.private-machine-commercial-request.v1"}))}),{mode:0o600});
    try {
      const receipt=await prepareMachinePublication(input,out);
      const raw=readFileSync(out),bundle=JSON.parse(raw.toString());
      expect(statSync(out).mode&0o777).toBe(0o600);
      expect(receipt.sha256).toBe(createHash("sha256").update(raw).digest("hex"));
      expect(receipt.public_published).toBe(false);
      expect(Object.keys(bundle).sort()).toEqual(["eventPackages","rows"]);
      expect(bundle.rows).toEqual(t.rows);
      await expect(prepareMachinePublication(input,out)).rejects.toThrow();
    } finally {rmSync(directory,{recursive:true,force:true})}
  });

  it("verifies both pinned signatures and exact source bytes in all domains",async()=>{
    const t=fixture();
    const q=await qualifyMachineIntelligenceBatch({...t,now},{fetchImpl:t.fetchImpl as typeof fetch,readRights:t.readRights});
    expect(q.receipt.qualified_event_count).toBe(3);
    expect(q.receipt.external_reviewer_attested).toBe(false);
    expect(q.qualified_until).toBe("2026-10-17T11:15:00.000Z");
    expect(t.fetchImpl).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(q.receipt)).not.toMatch(/https:|federalreserve|permission_record/);
  });
  it.each(["row","signed-summary","signature","rights","missing-domain","duplicate","expired","bytes"])("rejects %s before any B2 publication",async(mode)=>{
    const t=fixture(),calls:string[]=[];
    if(mode==="row")t.rows[0].severity=90;
    if(mode==="signed-summary")t.eventPackages[0].event.structured_payload.public_summary="Changed unsigned summary";
    if(mode==="signature")t.eventPackages[0].envelope.facts_signature_b64=t.eventPackages[0].envelope.rights_signature_b64;
    if(mode==="rights")t.eventPackages[0].envelope.proof.source_permissions[0].attribution_required=true;
    if(mode==="missing-domain"){t.rows.pop();t.eventPackages.pop()}
    if(mode==="duplicate"){t.rows[1]=t.rows[0];t.eventPackages[1]=t.eventPackages[0]}
    if(mode==="bytes")t.pages.set(t.eventPackages[0].candidates[0].original_article_url,"tampered HTML");
    vi.stubGlobal("fetch",t.fetchImpl);vi.spyOn(b2,"readB2CommercialSourceRights").mockImplementation(t.readRights);
    await expect(publishMachineIntelligence({...t,sourceRunId:"1234",
      clock:()=>mode==="expired"?new Date("2026-10-17T11:16:00Z"):now,
      createArchiveClient:()=>{calls.push("B2");throw Error("unexpected")},promoteHotSnapshot:()=>{calls.push("D1")}})).rejects.toThrow();
    expect(calls).toEqual([]);
  });
  it("uses the existing exact gzip readback transport and preserves a distinct proof/expiry at D1",async()=>{
    const t=fixture(),stored=new Map<string,Buffer>(),calls:string[]=[];let promotion:any;
    vi.stubGlobal("fetch",t.fetchImpl);vi.spyOn(b2,"readB2CommercialSourceRights").mockImplementation(t.readRights);
    const receipt=await publishMachineIntelligence({...t,sourceRunId:"1234",clock:()=>now,
      createArchiveClient:()=>({put:async(k:string,b:Buffer)=>{calls.push("put");stored.set(k,Buffer.from(b))},
        get:async(k:string)=>{calls.push("get");return stored.get(k)}}),
      promoteHotSnapshot:async(body:any)=>{
        promotion=body;calls.push("promote");
        const admitted=validateHotSnapshot({...body,source_run_id:"1234",payload_sha256:sha(JSON.stringify(body.value))},"intelligence",now.getTime());
        expect(admitted.proofSchema).toBe(MACHINE_INTELLIGENCE_PROOF_SCHEMA);
        expect(admitted.expiresAt).toBe("2026-10-17T11:15:00.000Z");
        expect(()=>validateHotSnapshot({...body,source_run_id:"1234",payload_sha256:sha(JSON.stringify(body.value))},"intelligence",Date.parse("2026-10-17T11:16:00Z"))).toThrow();
      }});
    expect(receipt.d1_hot_snapshot_published).toBe(true);expect(calls.at(-1)).toBe("promote");
    expect(calls.filter(c=>c==="get")).toHaveLength(3);
    expect(promotion.proof.external_reviewer_attested).toBe(false);
    const raw=gunzipSync(stored.get("geomacro-evidence/v1/live/public-intelligence/latest.json.gz")!).toString();
    expect(sha(raw)).toBe(receipt.payload_sha256);
    expect(raw).not.toMatch(/https:|"(?:facts_signature_b64|rights_signature_b64|source_permissions|candidates|envelope)"\s*:/);
    const spoof={...promotion,proof:{...promotion.proof,schema:"geomacro.public-intelligence-live-proof.v1"},source_run_id:"1234",payload_sha256:sha(raw)};
    expect(()=>validateHotSnapshot(spoof,"intelligence",now.getTime())).toThrow();
  });
});
