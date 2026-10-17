import {afterEach,describe,expect,it,vi} from "vitest";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import {sameEventClaimHash} from "../../scripts/lib/independent-same-event-qualification.mjs";
import {
  qualifySingleOriginalPrivateAuthority,
  SINGLE_ORIGINAL_AUTHORITY_PROOF_SCHEMA,
  SINGLE_ORIGINAL_AUTHORITY_PROFILE,
  type SingleOriginalAuthorityProof,
} from "./single-original-private-authority.server";
import type {MachineOriginalWithRegistry} from "./geomacro-machine-source-rights.server";
import {preparePrivateSingleOriginalFactualHandoff} from "./single-original-private-derived-handoff.server";
import type {B2CommercialSourceRight} from "./b2-live.server";

const at=new Date("2026-10-10T10:30:00.000Z");
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519"),
  gro=generateKeyPairSync("ed25519");
const html='<!DOCTYPE html><html><head><meta property="article:published_time" content="2026-10-10T10:05:00Z"></head><body>FAKE private synthetic publisher sample — NOT a real approved source grant.</body></html>';
const identity={
  country_iso3:"USA",event_type:"central_bank_policy",
  actor_id:"government_agency",target_id:"policy_effect",
  location_id:"washington_dc",occurred_at:"2026-10-10T10:00:00Z",
};
const claim=sameEventClaimHash("macro",identity);
const candidate:MachineOriginalWithRegistry={
  category:"macro",event:identity,same_event_claim_sha256:claim,
  original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm",
  publisher_host:"www.federalreserve.gov",
  originating_reporting_organization_id:"federal_reserve",
  publisher_organization_id:"federal_reserve",
  source_registry_id:"fed_monetary_original_press_rss_review",
  original_article_sha256:hash(html),
  original_published_at:"2026-10-10T10:05:00Z",
  private_only:true,native_published_at_verified:true,
  original_article_content_verified:true,original_publisher_url_verified:true,
  independently_authored_reporting_verified:true,syndicated_from:null,
  commercial_eligible:false,reporting_position:"confirms",
};
function env(){
  const result:Record<string,string|undefined>={};
  for(const [prefix,key] of [
    ["GEOMACRO_MACHINE_FACTS",facts],["GEOMACRO_MACHINE_RIGHTS",rights],
  ] as const){
    result[prefix+"_PUBLIC_KEY_PEM"]=key.publicKey.export({format:"pem",type:"spki"}).toString();
    result[prefix+"_PUBLIC_KEY_SHA256"]=createHash("sha256")
      .update(key.publicKey.export({format:"der",type:"spki"})).digest("hex");
  }
  result.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64=
    gro.publicKey.export({format:"der",type:"spki"}).toString("base64");
  return result;
}
function proof():SingleOriginalAuthorityProof{
  return {
    schema:SINGLE_ORIGINAL_AUTHORITY_PROOF_SCHEMA,
    profile:SINGLE_ORIGINAL_AUTHORITY_PROFILE,
    category:"macro",country_iso3:"USA",
    source_registry_id:String(candidate.source_registry_id),
    originating_reporting_organization_id:String(candidate.originating_reporting_organization_id),
    exact_event_sha256:hash(canonicalRiskObjectJson(identity)),
    same_event_claim_sha256:claim,
    original_article_sha256:hash(html),
    original_published_at:"2026-10-10T10:05:00Z",
    original_count:1,independent_corroboration_verified:false,
    factual_claim_checked:true,counterevidence_checked:true,
    unresolved_contradictions:0,retractions_detected:0,
    permission:{
      article_sha256:hash(html),
      licence_document_sha256:hash("SYNTHETIC LICENCE FIXTURE - NEVER REAL RIGHTS"),
      permission_record_sha256:hash("SYNTHETIC AUTHORIZATION FIXTURE - NEVER REAL RIGHTS"),
      derived_commercial_use_authorized:true,
      raw_redistribution_allowed:false,attribution_required:false,
      permission_checked_at:"2026-10-10T10:10:00Z",
      permission_expires_at:"2026-10-11T10:10:00Z",
    },
    attested_at:"2026-10-10T10:12:00Z",
    expires_at:"2026-10-10T10:59:00Z",
  };
}
function envelope(p:SingleOriginalAuthorityProof=proof()){
  const bytes=Buffer.from(canonicalRiskObjectJson(p));
  return {proof:p,facts_signature_b64:sign(null,bytes,facts.privateKey).toString("base64"),
    rights_signature_b64:sign(null,bytes,rights.privateKey).toString("base64")};
}
const approvedB2=[{
  source_id:candidate.source_registry_id,category:"macro",certification_state:"CERTIFIED",
  commercial_usage_status:"DERIVED_ONLY",enabled_for_ingestion:true,
  enabled_for_commercial_signals:true,raw_redistribution_allowed:false,
  attribution_required:false,licence_name:"SYNTHETIC TEST ONLY — no real licence",
}] as B2CommercialSourceRight[];
function deps(overrides:Record<string,unknown>={}){
  const fetchImpl=vi.fn(async()=>new Response(html,{
    status:200,headers:{"content-type":"text/html"},
  }));
  const readRights=vi.fn(async()=>approvedB2);
  return {candidate,envelope:envelope(),now:at,
    authorityEnvironment:env(),fetchImpl:fetchImpl as unknown as typeof fetch,
    readRights,...overrides};
}
afterEach(()=>vi.restoreAllMocks());
describe("founder one-source distinct private machine authority",()=>{
  it("accepts authentic HTML plus dual independent synthetic facts/right signatures in PRIVATE only",async()=>{
    const d=deps();
    const result=await qualifySingleOriginalPrivateAuthority(d);
    expect(result.status).toBe("SINGLE_ORIGINAL_DUAL_ATTESTED_PRIVATE_ONLY");
    expect(result.original_reread_verified).toBe(true);
    expect(result.registry_compatible).toBe(true);
    expect(result.article_permission_dual_attested).toBe(true);
    expect(result.qualified_private_only).toBe(true);
    expect(result.independent_corroboration_verified).toBe(false);
    expect(result.source_original_count).toBe(1);
    expect(result.signed_commercial_gro).toBe(false);
    expect(result.gri_current_certified).toBe(false);
    expect(result.public_hot_published).toBe(false);
    expect(result.payment_authorized).toBe(false);
    expect(result.b2_writes+result.d1_writes+result.payment_attempts).toBe(0);
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
    expect(d.readRights).toHaveBeenCalledTimes(1);
  });
  it("rejects tampered rights proof BEFORE original HTTP and B2 reads",async()=>{
    const p=proof();
    const d=deps({envelope:{...envelope(p),
      proof:{...p,permission:{...p.permission,attribution_required:true}}}});
    const result=await qualifySingleOriginalPrivateAuthority(d);
    expect(result.status).toBe("FACTS_RIGHTS_AUTHORITY_OR_PROOF_INVALID");
    expect(d.fetchImpl).not.toHaveBeenCalled();
    expect(d.readRights).not.toHaveBeenCalled();
  });
  it("rejects identical facts and rights authorities before any IO",async()=>{
    const d=deps();
    const e=env();
    e.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM=e.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM;
    e.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256=e.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256;
    const result=await qualifySingleOriginalPrivateAuthority({...d,authorityEnvironment:e});
    expect(result.qualified_private_only).toBe(false);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects wrong article hash, expired grant and foreign country without source probes",async()=>{
    for(const p of [
      {...proof(),original_article_sha256:hash("other")},
      {...proof(),permission:{...proof().permission,
        permission_expires_at:"2026-10-10T09:00:00Z"}},
      {...proof(),country_iso3:"GBR"},
    ]){
      const d=deps({envelope:envelope(p as SingleOriginalAuthorityProof)});
      const result=await qualifySingleOriginalPrivateAuthority(d);
      expect(result.qualified_private_only).toBe(false);
      expect(d.fetchImpl).not.toHaveBeenCalled();
      expect(d.readRights).not.toHaveBeenCalled();
    }
  });
  it("rejects changed actual issuer HTML after passing signature check",async()=>{
    const d=deps({fetchImpl:vi.fn(async()=>new Response(html.replace("FAKE","ALTERED"),{
      status:200,headers:{"content-type":"text/html"},
    })) as unknown as typeof fetch});
    const result=await qualifySingleOriginalPrivateAuthority(d);
    expect(result.status).toBe("FIRST_PARTY_SOURCE_BYTES_OR_CLOCK_UNVERIFIED");
    expect(d.readRights).not.toHaveBeenCalled();
  });
  it("never treats B2 source registry as article rights by itself",async()=>{
    const d=deps({readRights:vi.fn(async()=>null)});
    const result=await qualifySingleOriginalPrivateAuthority(d);
    expect(result.status).toBe("SOURCE_REGISTRY_OR_RIGHTS_SCOPE_UNAVAILABLE");
    expect(result.qualified_private_only).toBe(false);
  });
});

describe("one-original source-free factual handoff",()=>{
  it("rechecks dual-signed original, returns factual-only metadata without scores or publisher identities",async()=>{
    const d=deps();
    const result=await preparePrivateSingleOriginalFactualHandoff(d);
    expect(result.accepted).toBe(true);
    if(!result.accepted||!result.derived_input)throw Error("HANDOFF_EXPECTED");
    const fact=result.derived_input;
    expect(fact.schema).toBe("geomacro.private-single-original-factual-handoff.v1");
    expect(fact.category).toBe("macro");
    expect(fact.country_iso3).toBe("USA");
    expect(fact.event_type).toBe("central_bank_policy");
    expect(fact.original_source_count).toBe(1);
    expect(fact.independent_corroboration_verified).toBe(false);
    expect(fact.score).toBeNull();
    expect(fact.severity).toBeNull();
    expect(fact.commercial_gro_signed).toBe(false);
    expect(fact.public_published).toBe(false);
    expect(fact.gri_country_category_certified).toBe(false);
    expect(fact.payment_authorized).toBe(false);
    expect(result.derived_input_sha256).toMatch(/^[0-9a-f]{64}$/u);
    const serialized=JSON.stringify(fact);
    expect(serialized).not.toContain("federalreserve.gov");
    expect(serialized).not.toContain("SYNTHETIC LICENCE");
    expect(serialized).not.toContain("source_registry_id");
    expect(serialized).not.toContain("headline");
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
    expect(d.readRights).toHaveBeenCalledTimes(1);
  });
  it("never prepares factual input from forged signed rights or changed original bytes",async()=>{
    const p=proof();
    const bad=deps({envelope:{...envelope(p),proof:{...p,category:"rare_earth"}}});
    const x=await preparePrivateSingleOriginalFactualHandoff(bad);
    expect(x.accepted).toBe(false);
    expect(x.derived_input).toBeNull();
    expect(bad.fetchImpl).not.toHaveBeenCalled();
    const changed=deps({fetchImpl:vi.fn(async()=>new Response(html.replace("FAKE","ALTERED"),{
      status:200,headers:{"content-type":"text/html"},
    })) as unknown as typeof fetch});
    const y=await preparePrivateSingleOriginalFactualHandoff(changed);
    expect(y.accepted).toBe(false);
    expect(y.derived_input_sha256).toBeNull();
  });
});
