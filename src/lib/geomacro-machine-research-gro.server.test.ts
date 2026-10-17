import {createHash,generateKeyPairSync} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import {sameEventClaimHash} from "../../scripts/lib/independent-same-event-qualification.mjs";
import {signGeomacroMachinePrivateResearchGRO} from "./geomacro-machine-research-gro.server";
import {verifyRiskObjectSignature,canonicalRiskObjectJson}
  from "./risk-object-signing.server";
import {assertCommercialRiskObjectDeliverable}
  from "./commercial-risk-object-policy";
import type {MachineOriginalWithRegistry}
  from "./geomacro-machine-source-rights.server";
import type {B2CommercialSourceRight} from "./b2-live.server";
import type {CountryRiskEventInput} from "./country-risk-engine";

const now=new Date("2026-10-10T11:00:00.000Z");
const sha=(text:string)=>createHash("sha256").update(text).digest("hex");
const pages=(a:string,b:string)=>[
  `<!DOCTYPE html><html><head><meta property="article:published_time"
  content="2026-10-10T10:05:00Z"></head><body>${a} private synthetic source</body></html>`,
  `<!DOCTYPE html><html><head><meta property="article:published_time"
  content="2026-10-10T10:10:00Z"></head><body>${b} private synthetic source</body></html>`,
];
const cases=[
  {category:"macro",event_type:"central_bank_policy",
    first:["federal_reserve","fed_monetary_original_press_rss_review",
      "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm"],
    second:["ecb","ecb",
      "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261010.en.html"],
  },
  {category:"geopolitics",event_type:"sanctions_policy",
    first:["un_news","un_news",
      "https://news.un.org/en/story/2026/10/1234567"],
    second:["uk_fcdo","uk_fcdo",
      "https://www.gov.uk/government/news/example-sanctions-announcement"],
  },
  {category:"rare_earth",event_type:"critical_mineral_supply",
    first:["usgs","usgs_minerals_original_news_rss_review",
      "https://www.usgs.gov/news/national-news-release/example-mineral-report"],
    second:["natural_resources_canada","nrcan_government_news_original_atom_review",
      "https://www.canada.ca/en/natural-resources-canada/news/2026/10/example-mineral-report.html"],
  },
] as const;
const pair=generateKeyPairSync("ed25519");
const keyId="geomacro-research-signature-local-fixture";
const signingMaterial={
  key_id:keyId,private_key_pkcs8_b64:pair.privateKey
    .export({type:"pkcs8",format:"der"}).toString("base64"),
  public_key_spki_b64:pair.publicKey.export({type:"spki",format:"der"})
    .toString("base64"),
};
const verificationKeys={[keyId]:signingMaterial.public_key_spki_b64};
function fixture(testCase:typeof cases[number]){
  const [a,b]=pages(testCase.category+" first",testCase.category+" second");
  const eventIdentity={
    country_iso3:"USA",event_type:testCase.event_type,
    actor_id:"government_agency",target_id:"policy_effect",
    location_id:"washington_dc",occurred_at:"2026-10-10T09:55:00Z",
  };
  const claim=sameEventClaimHash(testCase.category,eventIdentity);
  const owners=[testCase.first,testCase.second];
  const originals=owners.map(([org,id,url],i):MachineOriginalWithRegistry=>({
    category:testCase.category,event:eventIdentity,same_event_claim_sha256:claim,
    original_article_url:url,publisher_host:new URL(url).hostname,
    publisher_organization_id:org,originating_reporting_organization_id:org,
    source_registry_id:id,
    private_only:true,native_published_at_verified:true,
    original_article_content_verified:true,original_publisher_url_verified:true,
    independently_authored_reporting_verified:true,syndicated_from:null,
    commercial_eligible:false,reporting_position:"confirms",
    original_article_sha256:sha(i===0?a:b),
    original_published_at:i===0?"2026-10-10T10:05:00Z":"2026-10-10T10:10:00Z",
  }));
  const event:CountryRiskEventInput={
    id:"machine-event-"+testCase.category,domain:testCase.category,
    event_type:testCase.event_type,
    title:"Geomacro research only — synthetic original-page fixtures",
    primary_country:"USA",countries:["USA"],
    severity:61,confidence:82,direction:"escalating",
    first_seen_at:eventIdentity.occurred_at,
    last_seen_at:"2026-10-10T10:10:00Z",
    material_evidence_at:eventIdentity.occurred_at,
    evidence_count:2,independent_source_count:2,
    corroboration_status:"CORROBORATING",
    source_ids:owners.map(x=>x[1]),
    source_families:owners.map(x=>x[0]),
    content_hashes:[sha(a),sha(b)],
    source_record_ids:[sha(a),sha(b)],
    relevance_weight:0.9,evidence_refs:[],
    structure_version:"geomacro-internal-research-fixture-v1",
    structured_payload:{scoring_version:"research-only"},
  };
  const rights=B2Right(testCase);
  const readRights=vi.fn(async()=>rights);
  const fetchImpl=vi.fn(async(url:string)=>
    new Response(url===testCase.first[2]?a:b,{
      status:200,headers:{"content-type":"text/html"}}));
  const input={
    category:testCase.category,country_iso3:"USA",country_name:"United States",
    event,candidates:originals,now,
  };
  const deps={signingMaterial,verificationKeys,readRights,
    fetchImpl:fetchImpl as unknown as typeof fetch};
  return {input,deps,readRights,fetchImpl};
}
function B2Right(testCase:typeof cases[number]):B2CommercialSourceRight[]{
  return [testCase.first[1],testCase.second[1]].map(source_id=>({
    source_id,category:testCase.category,
    certification_state:"CERTIFIED",commercial_usage_status:"DERIVED_ONLY",
    enabled_for_ingestion:true,enabled_for_commercial_signals:true,
    raw_redistribution_allowed:false,attribution_required:false,
    licence_name:"SYNTHETIC TEST REGISTRY — NOT LEGAL PERMISSION",
  }));
}
describe("#2044 Geomacro first-party automated private canonical GRO",()=>{
  for(const testCase of cases){
    it(`${testCase.category}: signed private GRO replay works, but zero commercial claims or x402 authorization`,async()=>{
      const {input,deps,readRights,fetchImpl}=fixture(testCase);
      const result=await signGeomacroMachinePrivateResearchGRO(input,deps);
      expect(result.profile).toBe("GEOMACRO_AUTOMATED_RESEARCH_UNVERIFIED_V1");
      expect(result.original_count).toBe(2);
      expect(result.gro_signature_verified).toBe(true);
      expect(result.semantic_same_event_claim_verified).toBe(false);
      expect(result.article_commercial_rights_verified).toBe(false);
      expect(result.licensed_commercial_delivery_allowed).toBe(false);
      expect(result.x402_payment_authorized).toBe(false);
      expect(result.public_hot_published).toBe(false);
      expect(readRights).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const object=JSON.parse(result.signed_gro_canonical_json);
      expect(canonicalRiskObjectJson(object)).toBe(result.signed_gro_canonical_json);
      expect(sha(result.signed_gro_canonical_json)).toBe(result.record_sha256);
      expect(verifyRiskObjectSignature(object,verificationKeys).valid).toBe(true);
      expect(object.commercial_eligibility.status).toBe("UNVERIFIED");
      expect(object.verification.status).not.toBe("VERIFIED");
      expect(object.provenance.reproducibility.calculation_namespace)
        .toBe("geomacro_automated_research_unverified_v1");
      expect(()=>assertCommercialRiskObjectDeliverable(object,{
        now,verification_keys:verificationKeys,
      })).toThrow();
    });
  }
  it("rejects false structural event source hashes before any first-party GET or B2 rights read",async()=>{
    const {input,deps,fetchImpl,readRights}=fixture(cases[0]);
    input.event.content_hashes=["f".repeat(64),"e".repeat(64)];
    await expect(signGeomacroMachinePrivateResearchGRO(input,deps))
      .rejects.toThrow("GEOMACRO_MACHINE_RESEARCH_EVIDENCE_UNVERIFIED");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readRights).not.toHaveBeenCalled();
  });
  it("rejects a false CONFIRMED semantic status rather than signing it",async()=>{
    const {input,deps,fetchImpl,readRights}=fixture(cases[0]);
    input.event.corroboration_status="CONFIRMED";
    await expect(signGeomacroMachinePrivateResearchGRO(input,deps))
      .rejects.toThrow("GEOMACRO_MACHINE_RESEARCH_EVIDENCE_UNVERIFIED");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readRights).not.toHaveBeenCalled();
  });
  it("refuses altered first-party actual article bytes, no issuer signing",async()=>{
    const {input,deps,readRights}=fixture(cases[0]);
    const badFetch=vi.fn(async()=>
      new Response("<html><body>altered HTML</body></html>",{
        status:200,headers:{"content-type":"text/html"}}));
    await expect(signGeomacroMachinePrivateResearchGRO(input,{
      ...deps,fetchImpl:badFetch as unknown as typeof fetch,
    })).rejects.toThrow("GEOMACRO_MACHINE_RESEARCH_ORIGINAL_OR_RIGHTS_NOT_READY");
    expect(readRights).not.toHaveBeenCalled();
  });
  it("refuses absent B2 registry or source without derived permission, without signing",async()=>{
    for(const rows of [null,[],B2Right(cases[0]).map(x=>({...x,attribution_required:true}))]){
      const {input,deps}=fixture(cases[0]);
      await expect(signGeomacroMachinePrivateResearchGRO(input,{
        ...deps,readRights:async()=>rows,
      })).rejects.toThrow("GEOMACRO_MACHINE_RESEARCH_ORIGINAL_OR_RIGHTS_NOT_READY");
    }
  });
});
