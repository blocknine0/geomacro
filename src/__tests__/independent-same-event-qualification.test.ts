import {describe,expect,it,vi} from "vitest";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {readFileSync} from "node:fs";
import {
  qualifyIndependentSameEvent,sameEventClaimHash,
  qualificationReviewSigningBytes,SAME_EVENT_QUALIFICATION_SCHEMA,
  derivedCustomerRowSha256,
} from "../../scripts/lib/independent-same-event-qualification.mjs";
import {publishB2VerifiedHotSnapshot} from "../../scripts/ops/publish-b2-verified-hot-snapshot.mjs";

const now=new Date("2026-10-10T11:00:00Z");
const keyPair=generateKeyPairSync("ed25519");
const trustedReviewerPublicKeyPem=keyPair.publicKey.export({type:"spki",format:"pem"}).toString();
const signReview=(p:any)=>({...p,review_signature_base64:sign(null,
  qualificationReviewSigningBytes(p),keyPair.privateKey).toString("base64")});
const hex=(s:string)=>createHash("sha256").update(s).digest("hex");
const identity={
  country_iso3:"USA",event_type:"central_bank_policy",
  actor_id:"federal_reserve",target_id:"us_rates",
  location_id:"washington_dc",occurred_at:"2026-10-10T09:55:00Z",
};
const claim=sameEventClaimHash("macro",identity);
const rows=[{id:"canonical-scored-001",category:"macro",
  public_status:"verified_b2",severity:73,delta:2,
  source_title:"Geomacro finds verified monetary-policy rate decision risk elevated",
  summary:"Corroborated original monetary policy announcement has elevated macro risk",
  created_at:"2026-10-10T10:44:00Z",
  published_at:"2026-10-10T10:08:00Z"}];
const proof={
  schema:SAME_EVENT_QUALIFICATION_SCHEMA,event_id:rows[0].id,
  category:"macro",event:identity,same_event_claim_sha256:claim,
  independent_same_event_review_verified:true,
  same_event_reviewer_receipt_sha256:hex("independent senior editor exact claim review"),
  reviewed_derived_row_sha256:derivedCustomerRowSha256(rows[0]),
  counterevidence_review:{
    independent_counterevidence_review_completed:true,
    review_receipt_sha256:hex("private source fact check and contradiction screening"),
    reviewed_at:"2026-10-10T10:40:00Z",sources_screened:4,
    material_conflicts_detected:0,material_conflicts_resolved:0,
    unresolved_material_conflicts:0,retractions_detected:0,
  },
  evidence:[
    {
      url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm",
      publisher_host:"www.federalreserve.gov",
      publisher_organization_id:"federal_reserve",
      originating_reporting_organization_id:"federal_reserve",
      native_published_at_verified:true,
      original_published_at:"2026-10-10T10:08:00Z",
      original_article_content_verified:true,
      original_article_sha256:hex("fed original bytes"),
      independent_review_sha256:hex("first evidence review receipt"),
      rights_receipt_sha256:hex("specific legal rights approval fed"),
      commercial_derived_use_rights_verified:true,
      independently_authored_reporting_verified:true,
      reporting_position:"confirms",
      syndicated_from:null,original_publisher_url_verified:true,
      same_event_claim_sha256:claim,
    },
    {
      url:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261010.en.html",
      publisher_host:"www.ecb.europa.eu",
      publisher_organization_id:"ecb",originating_reporting_organization_id:"ecb",
      native_published_at_verified:true,original_published_at:"2026-10-10T10:12:00Z",
      original_article_content_verified:true,
      original_article_sha256:hex("ecb independently authored original"),
      independent_review_sha256:hex("second independent review receipt"),
      rights_receipt_sha256:hex("specific ecb legal rights approval"),
      commercial_derived_use_rights_verified:true,
      independently_authored_reporting_verified:true,
      reporting_position:"confirms",
      syndicated_from:null,original_publisher_url_verified:true,
      same_event_claim_sha256:claim,
    },
  ],
};
const go=(p:any=proof)=>
  qualifyIndependentSameEvent({rows,eventPackages:[signReview(p)],now,trustedReviewerPublicKeyPem});

describe("#1827 strict multi-publisher same-event commercial gate",()=>{
  it("only admits registered original native-date same-event claim with two distinct signed-off organizations",()=>{
    const r=go();
    expect(r.receipt.qualified_event_count).toBe(1);
    expect(r.receipt.qualified[0]).toMatchObject({
      independent_reporting_organizations:2,
      event_claim_sha256:claim,source_bytes_private_only:true,
      same_event_structured_identity_verified:true,
      trusted_ed25519_review_signature_verified:true,
    });
    expect(r.receipt.no_raw_news_exposed).toBe(true);
    expect(r.receipt.no_publisher_url_exposed).toBe(true);
    expect(r.receipt.signed_gro_and_b2_verified).toBe(false);
    expect(r.receipt.qualified[0].counterevidence_review_signed).toBe(true);
    expect(r.receipt.qualified[0].unresolved_material_conflicts).toBe(0);
    expect(r.receipt.x402_mainnet_ready).toBe(false);
    const serialized=JSON.stringify(r);
    expect(serialized).not.toContain("federalreserve.gov");
    expect(serialized).not.toContain("ecb.europa.eu");
    expect(serialized).not.toContain("pressreleases");
    expect(r.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects a second fully reviewer-signed customer row ID for the SAME canonical event claim",()=>{
    const duplicateRow={...rows[0],id:"canonical-scored-second-id"};
    const duplicatePackage=signReview({
      ...proof,event_id:duplicateRow.id,
      reviewed_derived_row_sha256:derivedCustomerRowSha256(duplicateRow),
    });
    const firstPackage=signReview(proof);
    // Both complete independent signatures are valid individually.
    // Publication together must fail BEFORE any B2/D1 or settlement action.
    expect(qualifyIndependentSameEvent({
      rows:[duplicateRow],eventPackages:[duplicatePackage],
      now,trustedReviewerPublicKeyPem,
    }).receipt.qualified_event_count).toBe(1);
    expect(()=>qualifyIndependentSameEvent({
      rows:[rows[0],duplicateRow],
      eventPackages:[firstPackage,duplicatePackage],
      now,trustedReviewerPublicKeyPem,
    })).toThrow("INDEPENDENT_EVENT_DUPLICATE_CANONICAL_EVENT_CLAIM");
    expect(()=>qualifyIndependentSameEvent({
      rows:[duplicateRow,rows[0]],
      eventPackages:[duplicatePackage,firstPackage],
      now,trustedReviewerPublicKeyPem,
    })).toThrow("INDEPENDENT_EVENT_DUPLICATE_CANONICAL_EVENT_CLAIM");
  });
  it("still accepts two distinct reviewed same-category events without collapsing legitimate updates",()=>{
    const distinctEvent={...identity,target_id:"us_liquidity_reserves"};
    const distinctHash=sameEventClaimHash("macro",distinctEvent);
    const secondRow={...rows[0],id:"canonical-scored-distinct-002",
      source_title:"Geomacro finds verified liquidity conditions risk elevated",
      summary:"Independent original policy evidence indicates changed liquidity conditions",
    };
    const secondPackage=signReview({
      ...proof,event_id:secondRow.id,event:distinctEvent,
      same_event_claim_sha256:distinctHash,
      reviewed_derived_row_sha256:derivedCustomerRowSha256(secondRow),
      evidence:proof.evidence.map((e:any,i:number)=>({
        ...e,same_event_claim_sha256:distinctHash,
        original_article_sha256:hex("independent distinct event source "+i),
        independent_review_sha256:hex("distinct event reviewer receipt "+i),
      })),
    });
    const accepted=qualifyIndependentSameEvent({
      rows:[rows[0],secondRow],
      eventPackages:[signReview(proof),secondPackage],
      now,trustedReviewerPublicKeyPem,
    });
    expect(accepted.receipt.qualified_event_count).toBe(2);
    expect(new Set(accepted.receipt.qualified.map((x:any)=>x.event_claim_sha256)).size)
      .toBe(2);
    expect(accepted.receipt.no_raw_news_exposed).toBe(true);
    expect(accepted.receipt.x402_mainnet_ready).toBe(false);
  });
  it("binds exact derived customer-visible narrative, severity and timestamps into the independent reviewer signature",()=>{
    const good=go();
    expect(good.receipt.qualified[0].reviewed_derived_row_sha256)
      .toBe(derivedCustomerRowSha256(rows[0]));
    const reOrdered=Object.fromEntries(Object.entries(rows[0]).reverse());
    expect(derivedCustomerRowSha256(reOrdered))
      .toBe(derivedCustomerRowSha256(rows[0]));
    for(const mutated of [
      {...rows[0],severity:100},
      {...rows[0],source_title:"Geomacro finds unrelated risk on another corridor"},
      {...rows[0],summary:"Another geopolitical risk unrelated to reviewed monetary policy event"},
      {...rows[0],delta:40},
      {...rows[0],created_at:"2026-10-10T10:50:00Z"},
      {...rows[0],published_at:"2026-10-10T10:12:00Z"},
    ]){
      expect(()=>qualifyIndependentSameEvent({rows:[mutated],
        eventPackages:[signReview(proof)],now,trustedReviewerPublicKeyPem}))
        .toThrow("INDEPENDENT_EVENT_DERIVED_ROW_REVIEW_BINDING_INVALID");
    }
    // Even if a trusted reviewer signs a NEW modified row, its published
    // clock cannot be the ingestion or B2 restore time.
    const laundered={...rows[0],published_at:"2026-10-10T10:44:00Z"};
    expect(()=>qualifyIndependentSameEvent({rows:[laundered],
      eventPackages:[signReview({...proof,
        reviewed_derived_row_sha256:derivedCustomerRowSha256(laundered)})],
      now,trustedReviewerPublicKeyPem}))
      .toThrow("INDEPENDENT_EVENT_DERIVED_ROW_ORIGINAL_TIME_MISMATCH");
    expect(()=>go({...proof,reviewed_derived_row_sha256:"0".repeat(64)}))
      .toThrow("INDEPENDENT_EVENT_DERIVED_ROW_REVIEW_BINDING_INVALID");
    expect(()=>go({...proof,reviewed_derived_row_sha256:undefined}))
      .toThrow("INDEPENDENT_EVENT_DERIVED_ROW_REVIEW_BINDING_INVALID");
  });
  it("rejects upstream/source metadata, private URLs and malformed scored customer rows before settlement",()=>{
    const original=rows[0];
    for(const bad of [
      {...original,source_url:"https://www.federalreserve.gov/secret"},
      {...original,raw_article:"copied from upstream news"},
      {...original,summary:"Publisher report https://example.com/private"},
      {...original,source_title:"Original news headline without Geomacro derived status"},
      {...original,published_at:"2026-10-10T10:08:00+00:00"},
      {...original,created_at:"not-a-date"},
      {...original,severity:73.1},
      {...original,delta:Number.NaN},
      {...original,summary:{raw:"report"}},
    ]){
      expect(()=>derivedCustomerRowSha256(bad)).toThrow(/^INDEPENDENT_EVENT_DERIVED_ROW_/);
      expect(()=>qualifyIndependentSameEvent({rows:[bad],
        eventPackages:[signReview(proof)],now,trustedReviewerPublicKeyPem}))
        .toThrow(Number.isInteger(bad.severity)
          ? /^INDEPENDENT_EVENT_DERIVED_ROW_/
          : "INDEPENDENT_EVENT_ROW_BINDING_INVALID");
    }
  });
  it("blocks a signed scored row made before the second independent original confirmation or in the future",()=>{
    for(const time of ["2026-10-10T10:09:00Z","2026-10-10T11:10:00Z"]){
      const row={...rows[0],created_at:time};
      const signed=signReview({...proof,
        reviewed_derived_row_sha256:derivedCustomerRowSha256(row)});
      // The signer really signed the mutated customer row; only the
      // independent original-publication chronology must reject it.
      expect(()=>qualifyIndependentSameEvent({
        rows:[row],eventPackages:[signed],now,trustedReviewerPublicKeyPem,
      })).toThrow("INDEPENDENT_EVENT_DERIVED_ROW_PRECONFIRMATION_OR_FUTURE_CLOCK");
    }
    // A valid exact-row signature from a time after BOTH original
    // publishers released their independently reviewed report still passes.
    expect(go().receipt.qualified_event_count).toBe(1);
  });
  it("requires exact same structured claim; two titles containing rates are not a same-event proof",()=>{
    const different={
      ...proof,event:{...identity,location_id:"london_city"},
    };
    expect(()=>go(different)).toThrow("INDEPENDENT_EVENT_EVENT_CLAIM_HASH_MISMATCH");
    expect(()=>go({...proof,same_event_claim_sha256:hex("different event"),evidence:
      proof.evidence.map(s=>({...s,same_event_claim_sha256:hex("different event")}))}))
      .toThrow("INDEPENDENT_EVENT_EVENT_CLAIM_HASH_MISMATCH");
    expect(()=>go({...proof,event:{...identity,actor_id:"unverified"}}))
      .toThrow("INDEPENDENT_EVENT_EVENT_CLAIM_HASH_MISMATCH");
  });
  it("blocks an authenticated but wrong-category event even with two perfectly signed originals",()=>{
    const category="rare_earth";
    const foreign=sameEventClaimHash(category,identity);
    const rowsAsMinerals=[{...rows[0],category}];
    const attested=signReview({...proof,category,same_event_claim_sha256:foreign,
      evidence:proof.evidence.map(e=>({...e,same_event_claim_sha256:foreign}))});
    expect(()=>qualifyIndependentSameEvent({
      rows:rowsAsMinerals,eventPackages:[attested],now,trustedReviewerPublicKeyPem,
    })).toThrow("INDEPENDENT_EVENT_EVENT_IDENTITY_OR_REVIEW_INVALID");
    // A geopolitical ceasefire also cannot become a macroeconomic release.
    const ceasefire={...identity,event_type:"ceasefire"};
    const newsHash=sameEventClaimHash("macro",ceasefire);
    const another=signReview({...proof,event:ceasefire,
      same_event_claim_sha256:newsHash,
      evidence:proof.evidence.map(e=>({...e,same_event_claim_sha256:newsHash}))});
    expect(()=>qualifyIndependentSameEvent({rows,eventPackages:[another],
      now,trustedReviewerPublicKeyPem}))
      .toThrow("INDEPENDENT_EVENT_EVENT_IDENTITY_OR_REVIEW_INVALID");
  });
  it("rejects fabricated ISO3 identities but retains project canonical special entities",()=>{
    for(const code of ["ZZZ","XXX","AAA","QQQ"]){
      const nonexistent={...identity,country_iso3:code};
      const claimHash=sameEventClaimHash("macro",nonexistent);
      const packageSigned=signReview({...proof,event:nonexistent,
        same_event_claim_sha256:claimHash,
        evidence:proof.evidence.map(e=>({...e,same_event_claim_sha256:claimHash}))});
      expect(()=>qualifyIndependentSameEvent({rows,eventPackages:[packageSigned],
        now,trustedReviewerPublicKeyPem}))
        .toThrow("INDEPENDENT_EVENT_EVENT_IDENTITY_OR_REVIEW_INVALID");
    }
    for(const country_iso3 of ["GBR","IND","PSE","TWN"]){
      const valid={...identity,country_iso3};
      const claimHash=sameEventClaimHash("macro",valid);
      const packageSigned=signReview({...proof,event:valid,
        same_event_claim_sha256:claimHash,
        evidence:proof.evidence.map(e=>({...e,same_event_claim_sha256:claimHash}))});
      expect(qualifyIndependentSameEvent({rows,eventPackages:[packageSigned],
        now,trustedReviewerPublicKeyPem}).receipt.qualified_event_count).toBe(1);
    }
  });
  it("requires signed fresh counterevidence review and no retractions or unresolved conflicts",()=>{
    const review=proof.counterevidence_review;
    for(const changed of [
      undefined,
      {...review,independent_counterevidence_review_completed:false},
      {...review,material_conflicts_detected:1,unresolved_material_conflicts:1},
      {...review,material_conflicts_detected:1,material_conflicts_resolved:1,retractions_detected:1},
      {...review,sources_screened:1},
      {...review,review_receipt_sha256:"not-a-hash"},
      {...review,reviewed_at:"2026-10-10T10:05:00Z"},
      {...review,reviewed_at:"2026-10-09T06:40:00Z"},
    ]){
      expect(()=>go({...proof,counterevidence_review:changed}))
        .toThrow(/^INDEPENDENT_EVENT_/);
    }
    for(const position of ["disputes","retracts","unknown"]){
      expect(()=>go({...proof,evidence:[
        {...proof.evidence[0],reporting_position:position},proof.evidence[1],
      ]})).toThrow("INDEPENDENT_EVENT_SOURCE_ATTESTATION_UNVERIFIED");
    }
    const signed=signReview(proof);
    const changed={...signed,counterevidence_review:{...review,
      material_conflicts_detected:1,unresolved_material_conflicts:1}};
    expect(()=>qualifyIndependentSameEvent({
      rows,eventPackages:[changed],now,trustedReviewerPublicKeyPem,
    })).toThrow(/^INDEPENDENT_EVENT_/);
  });
  it("blocks same owner, syndicated copies, duplicated source bodies and unverified reviews",()=>{
    const a=proof.evidence[0],c=proof.evidence[1];
    for(const pair of [
      [a,{...a,url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010b.htm",
        original_article_sha256:hex("other fed item"),
        independent_review_sha256:hex("different review")}],
      [a,{...c,syndicated_from:a.url}],
      [a,{...c,original_article_sha256:a.original_article_sha256}],
      [a,{...c,independent_review_sha256:a.independent_review_sha256}],
      [a,{...c,originating_reporting_organization_id:"federal_reserve"}],
    ])expect(()=>go({...proof,evidence:pair})).toThrow(/^INDEPENDENT_EVENT_/);
  });
  it("blocks spoofed host, registration aliases, unknown source rights, direct public URLs",()=>{
    const a=proof.evidence[0],c=proof.evidence[1];
    for(const broken of [
      {...c,url:"https://www.ecb.europa.eu.evil.example/press/"},
      {...c,publisher_organization_id:"fake_central_bank",
        originating_reporting_organization_id:"fake_central_bank"},
      {...c,commercial_derived_use_rights_verified:false},
      {...c,native_published_at_verified:false},
      {...c,original_article_content_verified:false},
      {...c,independently_authored_reporting_verified:false},
      {...c,original_publisher_url_verified:false},
      {...c,rights_receipt_sha256:null},
      {...c,url:"http://www.ecb.europa.eu/press/"},
      {...c,same_event_claim_sha256:hex("different")},
    ])expect(()=>go({...proof,evidence:[a,broken]})).toThrow(/^INDEPENDENT_EVENT_/);
  });
  it("blocks stale/future original publisher dates and unrelated temporal events",()=>{
    const a=proof.evidence[0],c=proof.evidence[1];
    for(const broken of [
      {...c,original_published_at:"2026-10-09T04:00:00Z"},
      {...c,original_published_at:"2026-10-11T04:00:00Z"},
      {...c,original_published_at:"2026-10-10T08:00:00Z"},
      {...c,original_published_at:"2026-10-10T08:30:00Z"},
      {...c,original_published_at:"2026-10-10T10:12:00+00:00"},
    ])expect(()=>go({...proof,evidence:[a,broken]})).toThrow(/^INDEPENDENT_EVENT_/);
    expect(()=>go({...proof,event:{...identity,occurred_at:"2026-10-09T03:00:00Z"}}))
      .toThrow(/^INDEPENDENT_EVENT_/);
  });
  it("a forged or altered reviewer signature, or absent trusted key, never qualifies",()=>{
    const good=signReview(proof);
    const originalChar=good.review_signature_base64[12];
    const alteredChar=originalChar==="A"?"B":"A";
    const bad={...good,review_signature_base64:
      good.review_signature_base64.slice(0,12)+alteredChar+good.review_signature_base64.slice(13)};
    expect(bad.review_signature_base64).not.toBe(good.review_signature_base64);
    expect(()=>qualifyIndependentSameEvent({rows,eventPackages:[bad],now,
      trustedReviewerPublicKeyPem})).toThrow(/^INDEPENDENT_EVENT_/);
    expect(()=>qualifyIndependentSameEvent({rows,eventPackages:[good],now}))
      .toThrow("INDEPENDENT_EVENT_TRUSTED_REVIEW_KEY_REQUIRED");
    const tampered={...good,event:{...good.event,location_id:"london_city"}};
    expect(()=>qualifyIndependentSameEvent({rows,eventPackages:[tampered],now,
      trustedReviewerPublicKeyPem})).toThrow(/^INDEPENDENT_EVENT_/);
  });
  it("blocks live-observed raw/GDELT rows even with two source assertions",()=>{
    expect(()=>qualifyIndependentSameEvent({rows:[
      {...rows[0],public_status:"live_observed",severity:null}
    ],eventPackages:[proof],now})).toThrow("INDEPENDENT_EVENT_ROW_BINDING_INVALID");
    expect(()=>go({...proof,evidence:[proof.evidence[0]]}))
      .toThrow("INDEPENDENT_EVENT_EVENT_IDENTITY_OR_REVIEW_INVALID");
    expect(()=>qualifyIndependentSameEvent({rows,eventPackages:[],now}))
      .toThrow("INDEPENDENT_EVENT_INPUT_INVALID");
  });
  it("the real D1 intelligence publisher fails before authorization/fetch without private event proof",async()=>{
    const fetchSpy=vi.spyOn(globalThis,"fetch");
    const iso=new Date().toISOString();
    try{
      await expect(publishB2VerifiedHotSnapshot({
        product:"intelligence",
        value:{generated_at:iso,rows},
        proof:{schema:"geomacro.public-intelligence-live-proof.v1",
          live_key:"geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
          full_b2_readback_verified:true,exact_gzip_restore_verified:true,
          generated_at:iso,compressed_sha256:"a".repeat(64),
          current_source_id:"qualified_independent_original_publishers_v1",
          current_evidence_contract:"geomacro.qualified-original-event-claims.v1",
          commercial_multi_source_checked_at:iso,commercial_multi_source_verified:true,
          commercial_multi_source_receipt_sha256:"a".repeat(64)},
      })).rejects.toThrow(/^INDEPENDENT_EVENT_INPUT_INVALID/);
      expect(fetchSpy).not.toHaveBeenCalled();
    }finally{fetchSpy.mockRestore();}
  });
  it("refuses legacy GDELT-only and fake independent-original source IDs BEFORE any publisher authentication or network",async()=>{
    const fetchSpy=vi.spyOn(globalThis,"fetch");
    try{
      const date=new Date().toISOString();
      const base={
        schema:"geomacro.public-intelligence-live-proof.v1",
        live_key:"geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
        generated_at:date,compressed_sha256:"a".repeat(64),
        full_b2_readback_verified:true,exact_gzip_restore_verified:true,
        commercial_multi_source_checked_at:date,
      };
      for(const proof of [
        {...base,current_source_id:"gdelt_v2_events",
          current_evidence_contract:"geomacro.qualified-original-event-claims.v1"},
        {...base,current_source_id:"qualified_independent_original_publishers_v1",
          current_evidence_contract:"gdelt-only-index-events"},
        {...base,current_source_id:"publisher_claimed_but_unreviewed"},
      ]){
        await expect(publishB2VerifiedHotSnapshot({
          product:"intelligence",value:{generated_at:date,rows},
          proof,privateEventPackages:[signReview(proof)],
        })).rejects.toThrow("HOT_SNAPSHOT_ORIGINAL_PUBLISHER_CONTRACT_REQUIRED");
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    }finally{fetchSpy.mockRestore();}
  });
  it("explicitly suppresses uncorroborated free live news, preserves historical scored proof",()=>{
    const code=readFileSync("src/lib/public-intelligence-gist.ts","utf8");
    expect(code).toContain("if (observed) return null;");
    expect(code).toContain('const prefix = status === "live_observed"');
    const publisher=readFileSync("scripts/ops/publish-b2-verified-hot-snapshot.mjs","utf8");
    expect(publisher).toContain('if(product==="intelligence")');
    expect(publisher).toContain("qualifyIndependentSameEvent({");
    expect(publisher).toContain("commercial_multi_source_receipt_sha256");
  });
});