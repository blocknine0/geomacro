import {afterEach,describe,it,expect,vi} from "vitest";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {canonicalRiskObjectJson,verifyRiskObjectSignature}
  from "./risk-object-signing.server";
import {
  createGeomacroMachineCommercialQualifier,
  prepareGeomacroMachineCommercialGRO,
  MACHINE_COMMERCIAL_PROOF_VERSION,MACHINE_COMMERCIAL_PROFILE,
  type MachineCommercialProof,
} from "./geomacro-machine-commercial-qualification.server";
import {sameEventClaimHash} from "../../scripts/lib/independent-same-event-qualification.mjs";
import type {CountryRiskEventInput} from "./country-risk-engine";
import type {B2CommercialSourceRight} from "./b2-live.server";
import type {MachineOriginalWithRegistry}
  from "./geomacro-machine-source-rights.server";

const at=new Date("2026-10-10T11:00:00.000Z");
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const facts=generateKeyPairSync("ed25519"),policy=generateKeyPairSync("ed25519");
const gro=generateKeyPairSync("ed25519");
const signingMaterial={
 key_id:"machine-private-commercial-test-only",
 private_key_pkcs8_b64:gro.privateKey.export({type:"pkcs8",format:"der"}).toString("base64"),
 public_key_spki_b64:gro.publicKey.export({type:"spki",format:"der"}).toString("base64"),
};
const verificationKeys={[signingMaterial.key_id]:signingMaterial.public_key_spki_b64};
const identity={
 country_iso3:"USA",event_type:"central_bank_policy",
 actor_id:"government_agency",target_id:"policy_effect",
 location_id:"washington_dc",occurred_at:"2026-10-10T09:55:00Z",
};
const claim=sameEventClaimHash("macro",identity);
const first=["federal_reserve","fed_monetary_original_press_rss_review",
 "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm"];
const second=["ecb","ecb",
 "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261010.en.html"];
const html=[
 '<!DOCTYPE html><html><head><meta property="article:published_time" content="2026-10-10T10:05:00Z"></head><body>Independent synthetic official policy source A. No real-world fact.</body></html>',
 '<!DOCTYPE html><html><head><meta property="article:published_time" content="2026-10-10T10:10:00Z"></head><body>Independent synthetic official policy source B. No real-world fact.</body></html>',
];
const publishers=[first,second];
const candidates=publishers.map(([org,id,url],i):MachineOriginalWithRegistry=>({
 category:"macro",event:identity,same_event_claim_sha256:claim,
 original_article_url:url,publisher_host:new URL(url).hostname,
 publisher_organization_id:org,originating_reporting_organization_id:org,
 source_registry_id:id,private_only:true,native_published_at_verified:true,
 original_article_content_verified:true,original_publisher_url_verified:true,
 independently_authored_reporting_verified:true,syndicated_from:null,
 commercial_eligible:false,reporting_position:"confirms",
 original_article_sha256:sha(html[i]),
 original_published_at:i===0?"2026-10-10T10:05:00Z":"2026-10-10T10:10:00Z",
}));
const event:CountryRiskEventInput={
 id:"machine-commercial-event-001",domain:"macro",event_type:"central_bank_policy",
 title:"Geomacro finds synthetic cross-issuer macro test case",
 primary_country:"USA",countries:["USA"],
 severity:61,confidence:82,direction:"escalating",relevance_weight:0.9,
 first_seen_at:identity.occurred_at,last_seen_at:"2026-10-10T10:10:00Z",
 material_evidence_at:identity.occurred_at,
 evidence_count:2,independent_source_count:2,corroboration_status:"CONFIRMED",
 source_ids:[first[1],second[1]],source_families:[first[0],second[0]],
 content_hashes:html.map(sha),source_record_ids:html.map(sha),
 evidence_refs:[],structure_version:"geomacro-machine-attested-fixture-v1",
 structured_payload:{scoring_version:"country-risk-v0.1.0-pilot"},
};
function rights():B2CommercialSourceRight[]{
 return publishers.map((p)=>({
  source_id:p[1],category:"macro",certification_state:"CERTIFIED",
  commercial_usage_status:"DERIVED_ONLY",enabled_for_ingestion:true,
  enabled_for_commercial_signals:true,raw_redistribution_allowed:false,
  attribution_required:false,
  licence_name:"FAKE SYNTHETIC test authority — not real legal rights",
 }));
}
function envKeys(){
 for(const [prefix,key] of [
  ["GEOMACRO_MACHINE_FACTS",facts],
  ["GEOMACRO_MACHINE_RIGHTS",policy],
 ] as const){
  vi.stubEnv(prefix+"_PUBLIC_KEY_PEM",
    key.publicKey.export({type:"spki",format:"pem"}).toString());
  vi.stubEnv(prefix+"_PUBLIC_KEY_SHA256",createHash("sha256")
    .update(key.publicKey.export({type:"spki",format:"der"})).digest("hex"));
 }
 vi.stubEnv("RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",
   signingMaterial.public_key_spki_b64);
}
function proof():MachineCommercialProof{
 return {
  schema:MACHINE_COMMERCIAL_PROOF_VERSION,profile:MACHINE_COMMERCIAL_PROFILE,
  country_iso3:"USA",category:"macro",event_id:event.id,
  exact_evidence_sha256:sha(canonicalRiskObjectJson([event])),
  same_event_claim_sha256:claim,
  exact_original_evidence_set_sha256:sha(JSON.stringify(candidates.map(c=>({
   article_bytes_sha256:c.original_article_sha256,
   original_published_at:c.original_published_at,
   same_event_claim_sha256:c.same_event_claim_sha256,
  })).sort((a,b)=>String(a.article_bytes_sha256)
    .localeCompare(String(b.article_bytes_sha256))))),
  attested_at:"2026-10-10T10:35:00Z",
  expires_at:"2026-10-10T11:15:00Z",
  semantic_same_event_verified:true,
  independent_original_issuers_verified:true,counterevidence_checked:true,
  unresolved_material_contradictions:0,retractions_detected:0,
  source_permissions:candidates.map(c=>({
   source_registry_id:c.source_registry_id,
   originating_reporting_organization_id:c.originating_reporting_organization_id,
   original_article_sha256:String(c.original_article_sha256),
   licensed_article_scope_sha256:sha("test scoped licence "+c.source_registry_id),
   permission_record_sha256:sha("test authority record "+c.source_registry_id),
   licensed_derived_use:true as const,raw_redistribution_allowed:false as const,
   attribution_required:false as const,
   permission_verified_at:"2026-10-10T10:20:00Z",
   permission_expires_at:"2026-10-11T10:20:00Z",
  })),
 };
}
function sealed(p:MachineCommercialProof=proof()){
 const bytes=Buffer.from(canonicalRiskObjectJson(p));
 return {proof:p,
  facts_signature_b64:sign(null,bytes,facts.privateKey).toString("base64"),
  rights_signature_b64:sign(null,bytes,policy.privateKey).toString("base64")};
}
function fixture(bundle=sealed()){
 const fetchImpl=vi.fn(async(url:string)=>{
  const index=url===first[2]?0:1;
  return new Response(html[index],{status:200,headers:{"content-type":"text/html"}});
 });
 const readRights=vi.fn(async()=>rights());
 return {bundle:{candidates,envelope:bundle},input:{
   category:"macro" as const,country_iso3:"USA",country_name:"United States",
   events:[event],now:at,
 },fetchImpl,readRights};
}
afterEach(()=>vi.unstubAllEnvs());
describe("distinct Geomacro machine commercial proof — no external reviewer spoof",()=>{
 it("accepts separately signed genuine-shape private fixture and prepares GRO with NO public publication or funds",async()=>{
  envKeys();
  const {bundle,input,fetchImpl,readRights}=fixture();
  const result=await prepareGeomacroMachineCommercialGRO(input,bundle,{
   fetchImpl:fetchImpl as unknown as typeof fetch,readRights,
   signingMaterial,verificationKeys,
  });
  const object=JSON.parse(result.signed_risk_object_json);
  expect(result.profile).toBe("CANONICAL");
  expect(result.payment_authorized).toBe(false);
  expect(result.live_review_authorized).toBe(false);
  expect(result.persistence_performed).toBe(false);
  expect(result.external_partner_approved).toBe(false);
  expect(object.verification.status).toBe("VERIFIED");
  expect(object.commercial_eligibility.status).toBe("VERIFIED");
  expect(verifyRiskObjectSignature(object,verificationKeys).valid).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(readRights).toHaveBeenCalledTimes(1);
 });
 it("requires two pinned distinct internal authorities BEFORE any source/rights network IO",async()=>{
  const t=fixture();
  await expect(prepareGeomacroMachineCommercialGRO(t.input,t.bundle,{
   fetchImpl:t.fetchImpl as unknown as typeof fetch,readRights:t.readRights,
   signingMaterial,verificationKeys,
  })).rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
  expect(t.fetchImpl).not.toHaveBeenCalled();
  expect(t.readRights).not.toHaveBeenCalled();
  envKeys();
  vi.stubEnv("GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM",
    facts.publicKey.export({type:"spki",format:"pem"}).toString());
  vi.stubEnv("GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256",
    createHash("sha256").update(facts.publicKey.export({type:"spki",format:"der"})).digest("hex"));
  const q=fixture();
  await expect(prepareGeomacroMachineCommercialGRO(q.input,q.bundle,{
   fetchImpl:q.fetchImpl as unknown as typeof fetch,readRights:q.readRights,
   signingMaterial,verificationKeys,
  })).rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
  expect(q.fetchImpl).not.toHaveBeenCalled();
 });
 it("refuses falsified semantic findings, time, grant, article hash and unsigned changes without IO",async()=>{
  envKeys();
  const variants=[
   {...proof(),counterevidence_checked:false},
   {...proof(),retractions_detected:1},
   {...proof(),semantic_same_event_verified:false},
   {...proof(),attested_at:"2026-10-09T09:00:00Z"},
   {...proof(),expires_at:"2026-10-10T10:00:00Z"},
   {...proof(),country_iso3:"CHN"},
   {...proof(),exact_evidence_sha256:"f".repeat(64)},
   {...proof(),source_permissions:[...proof().source_permissions].reverse().slice(0,1)},
   {...proof(),source_permissions:proof().source_permissions.map(p=>({...p,attribution_required:true}))},
   {...proof(),source_permissions:proof().source_permissions.map(p=>({...p,licensed_article_scope_sha256:"0".repeat(64),original_article_sha256:"b".repeat(64)}))},
  ];
  for(const changed of variants){
   const t=fixture(sealed(changed as MachineCommercialProof));
   const f=createGeomacroMachineCommercialQualifier(t.bundle,{
    fetchImpl:t.fetchImpl as unknown as typeof fetch,readRights:t.readRights,
   });
   const got=await f({category:"macro",country_iso3:"USA",
     evidence_sha256:sha(canonicalRiskObjectJson([event])),
     events:[event],now:at});
   expect(got).toBeNull();
   expect(t.fetchImpl).not.toHaveBeenCalled();
   expect(t.readRights).not.toHaveBeenCalled();
  }
  const altered=fixture({...sealed(),
   facts_signature_b64:sealed().rights_signature_b64});
  const q=createGeomacroMachineCommercialQualifier(altered.bundle,{
   fetchImpl:altered.fetchImpl as unknown as typeof fetch,
   readRights:altered.readRights,
  });
  expect(await q({category:"macro",country_iso3:"USA",events:[event],
   evidence_sha256:sha(canonicalRiskObjectJson([event])),now:at})).toBeNull();
  expect(altered.fetchImpl).not.toHaveBeenCalled();
 });
 it("rejects stale publisher bytes, missing licence metadata and Federico profile",async()=>{
  envKeys();
  const t=fixture();
  const wrong=vi.fn(async()=>new Response("<html>tampered source</html>"));
  await expect(prepareGeomacroMachineCommercialGRO(t.input,t.bundle,{
   fetchImpl:wrong as unknown as typeof fetch,readRights:t.readRights,
   signingMaterial,verificationKeys,
  })).rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
  expect(t.readRights).not.toHaveBeenCalled();
  const noRights=vi.fn(async()=>null);
  await expect(prepareGeomacroMachineCommercialGRO(t.input,t.bundle,{
   fetchImpl:t.fetchImpl as unknown as typeof fetch,readRights:noRights,
   signingMaterial,verificationKeys,
  })).rejects.toThrow("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
  await expect(prepareGeomacroMachineCommercialGRO({...t.input,profile:"FEDERICO_STRICT"},t.bundle,{
   fetchImpl:t.fetchImpl as unknown as typeof fetch,readRights:t.readRights,
   signingMaterial,verificationKeys,
  })).rejects.toThrow("GEOMACRO_MACHINE_COMMERCIAL_PROOF_NOT_VERIFIED");
 });
});
