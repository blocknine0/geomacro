import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildPrivateSupabaseFreeGriProof,
  GRI_PRIVATE_OFFLINE_ADMISSION_SCHEMA,
  griPrivateSha256,
} from "../../scripts/lib/gri-v12-private-offline-admission.mjs";
import { canonicalJson } from "../../scripts/lib/gri-engine-v12.js";
import {
  archivePrivatePortableGriProof,
  validatePrivatePortableProofForArchive,
  verifyPrivateGriD1Checkpoint,
  GRI_PRIVATE_B2_PREFIX,
  GRI_PRIVATE_D1_PIPELINE,
} from "../../scripts/lib/private-gri-v12-b2-d1-archive.mjs";

const NOW=new Date("2026-10-09T17:00:00.000Z");
const timeAgo=n=>new Date(NOW.getTime()-n*60_000).toISOString();
function source(category) {
  const domain={
    geopolitics:"publisher-geopolitics.example",
    macro:"publisher-macro.example",
    rare_earth:"publisher-minerals.example",
  }[category];
  return {
    id:"official-"+category,
    category, severity:67, confidence:87,
    created_at:timeAgo(15),published_at:timeAgo(20),
    source_name:"Original official publisher",
    source_domain:domain,
    source_url:"https://"+domain+"/news/unique-"+category,
    source_title:"Material original-source verified world development",
    summary:"Derived private event summary with explicit canonical lineage.",
    classification_provider:"groq", classification_model:"model-canonical",
    classification_version:"event-severity-v1.0.5",
    classification_prompt_version:"risk-desk-filter-v1.0.5",
    classification_scored_at:timeAgo(13),
    classification_input_hash:"a".repeat(64),
    story_cluster_id:"cluster-"+category,
    story_canonical_label:"Canonical story in domain "+category,
    story_assignment_decision:"anchor",
    story_match_confidence:100,
    story_decision_rationale:"New independent canonical correlation anchor",
    story_clustering_provider:"canonical-matcher",
    story_clustering_model:"story-v1",
    story_clustering_version:"story-correlation-v1.0.0",
    story_clustering_prompt_version:"story-match-title-v1.0.0",
    story_clustering_scored_at:timeAgo(12),
    story_clustering_input_hash:"b".repeat(64),
  };
}
function sample() {
  const admission={
    schema:GRI_PRIVATE_OFFLINE_ADMISSION_SCHEMA,
    as_of:NOW.toISOString(),
    private_only:true,
    public_published:false,
    commercial_eligible:false,
    rights_verification_pending:true,
    independent_corroboration_pending:true,
    events:["geopolitics","macro","rare_earth"].map(source),
  };
  const hash=griPrivateSha256(canonicalJson(admission));
  return {
    hash,
    stage:buildPrivateSupabaseFreeGriProof({
      admission, expectedInputSha256:hash,now:NOW,
    }),
  };
}
function adapters({missingQuota=false,corruptReadback=false,badCheckpoint=false,
                   previousSourceAsOf=null}={}) {
  const order=[];
  let row=previousSourceAsOf
    ? {payload:{cursor:{source_as_of:previousSourceAsOf, portable_bundle_hash:"f".repeat(64)}}}
    : null;
  let writes=0;
  let key="";
  const b2={
    usage:()=>({
      global_account_quota_guard_enabled:!missingQuota,
      request_budget:6,
      requests_started:2,
    }),
    async putWithMetadataVerification(nextKey,bytes,{verifyRestored}) {
      key=nextKey;
      order.push("b2-put");
      await verifyRestored(corruptReadback?Buffer.from("bad gzip"):Buffer.from(bytes));
      order.push("b2-full-readback");
      return {
        full_body_readback_verified:true,
        sha256:griPrivateSha256(bytes),
      };
    },
  };
  const control={
    async loadRows() {
      order.push("d1-get");
      return new Map(row?[["portable_proof",row]]:[]);
    },
    async persist(scope,state,update) {
      expect(scope).toBe("portable_proof");
      expect(order).toContain("b2-full-readback");
      order.push("d1-persist");
      writes+=1;
      row={
        source_id: "orchestrator:portable_proof",
        payload:{
          source:"geomacro_intelligence_orchestrator",
          task:scope,
          cursor:{
            ...state.cursor,
            sha256:badCheckpoint ? "0".repeat(64) : state.cursor.sha256,
          },
        },
        last_success_at:update.last_success_at,
      };
    },
  };
  return {b2,control,order,key,getWrites:()=>writes,getCheckpoint:()=>row};
}

describe("#1827 B2+Cloudflare D1 private GRI portable proof continuity",()=>{
  it("accepts full B2 PUT -> one hash/gzip restored GET -> compact D1 write/readback",async()=>{
    const {hash,stage}=sample();
    const env=adapters();
    const result=await archivePrivatePortableGriProof({
      value:stage,expectedInputHash:hash,now:NOW,
      b2:env.b2,control:env.control,
    });
    expect(result).toMatchObject({
      ok:true,private_only:true,public_published:false,
      commercial_eligible:false,source_as_of:NOW.toISOString(),
      b2_full_readback_verified:true,b2_exact_gzip_restore_verified:true,
      d1_checkpoint_readback_verified:true,supabase_writes:0,usdc_spent:0,
      source_authenticity_independently_verified:false,
      source_rights_verified:false,
      independent_corroboration_verified:false,
    });
    expect(env.getWrites()).toBe(1);
    expect(env.order).toEqual([
      "d1-get","b2-put","b2-full-readback","d1-persist","d1-get",
    ]);
    expect(env.key).toBe(GRI_PRIVATE_B2_PREFIX+result.compressed_sha256+".json.gz");
    expect(verifyPrivateGriD1Checkpoint(env.getCheckpoint(),{
      key:env.key,digest:result.compressed_sha256,inputHash:hash,
      proofHash:stage.portable_proof_hash,bundleHash:stage.portable_bundle_hash,
      eventCount:3,sourceAsOf:NOW.toISOString(),
      lastSuccessAt:env.getCheckpoint().last_success_at,
    })).toBe(true);
    const d1Json=JSON.stringify(env.getCheckpoint());
    expect(d1Json).not.toContain("publisher-geopolitics.example");
    expect(d1Json).not.toContain("Material original-source");
    expect(d1Json).not.toContain("private event summary");
    expect(result).not.toHaveProperty("portable_proof");
  });

  it("does not upload when global shared D1 budget guard is absent",async()=>{
    const {hash,stage}=sample(),env=adapters({missingQuota:true});
    await expect(archivePrivatePortableGriProof({
      value:stage,expectedInputHash:hash,now:NOW,
      b2:env.b2,control:env.control,
    })).rejects.toThrow("GRI_PRIVATE_SHARED_B2_ACCOUNT_QUOTA_REQUIRED");
    expect(env.order).toEqual([]);
    expect(env.getWrites()).toBe(0);
  });

  it("does not advance D1 if B2 verification GET or gzip restore fails",async()=>{
    const {hash,stage}=sample(),env=adapters({corruptReadback:true});
    await expect(archivePrivatePortableGriProof({
      value:stage,expectedInputHash:hash,now:NOW,
      b2:env.b2,control:env.control,
    })).rejects.toThrow("GRI_PRIVATE_B2_GZIP_RESTORE_INVALID");
    expect(env.getWrites()).toBe(0);
    expect(env.order).not.toContain("d1-persist");
  });

  it("rejects D1 readback mismatch despite successful B2 restore",async()=>{
    const {hash,stage}=sample(),env=adapters({badCheckpoint:true});
    await expect(archivePrivatePortableGriProof({
      value:stage,expectedInputHash:hash,now:NOW,
      b2:env.b2,control:env.control,
    })).rejects.toThrow("GRI_PRIVATE_D1_CHECKPOINT_READBACK_INVALID");
    expect(env.getWrites()).toBe(1);
  });

  it("never rolls back private source timestamp or mints new public freshness",async()=>{
    const {hash,stage}=sample();
    const env=adapters({previousSourceAsOf:new Date(NOW.getTime()+60_000).toISOString()});
    await expect(archivePrivatePortableGriProof({
      value:stage,expectedInputHash:hash,now:NOW,
      b2:env.b2,control:env.control,
    })).rejects.toThrow("GRI_PRIVATE_ARCHIVE_MONOTONIC_SOURCE_AS_OF_REQUIRED");
    expect(env.order).toEqual(["d1-get"]);
    expect(env.getWrites()).toBe(0);
  });

  it("rejects misbound input hash, tampered proof, stale source or rights promotion before B2 I/O",()=>{
    const {hash,stage}=sample();
    expect(()=>validatePrivatePortableProofForArchive(stage,{
      expectedInputHash:"f".repeat(64),now:NOW,
    })).toThrow("GRI_PRIVATE_ARCHIVE_PROOF_CONTRACT_INVALID");
    expect(()=>validatePrivatePortableProofForArchive({
      ...stage,public_published:true,
    },{expectedInputHash:hash,now:NOW}))
      .toThrow("GRI_PRIVATE_ARCHIVE_PROOF_CONTRACT_INVALID");
    expect(()=>validatePrivatePortableProofForArchive({
      ...stage,portable_proof_hash:"a".repeat(64),
    },{expectedInputHash:hash,now:NOW}))
      .toThrow("GRI_PRIVATE_ARCHIVE_PORTABLE_LINEAGE_INVALID");
    expect(()=>validatePrivatePortableProofForArchive(stage,{
      expectedInputHash:hash,now:new Date(NOW.getTime()+95*60_000),
    })).toThrow("GRI_PRIVATE_ARCHIVE_ORIGINAL_AS_OF_STALE");
  });

  it("production archive CLI requires opt-in D1 global quota, no Supabase, no public route",()=>{
    const cli=readFileSync("scripts/ops/archive-supabase-free-private-gri-v12.mjs","utf8");
    expect(cli).toContain('process.argv[2] !== "--private-archive-only"');
    expect(cli).toContain('process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1"');
    expect(cli).toContain('process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID !== "gri_private_v12"');
    expect(cli).toContain("validatePrivatePortableProofForArchive(proof");
    expect(cli).toContain("createD1ControlPlaneStateClient");
    expect(cli).toContain("archivePrivatePortableGriProof");
    expect(cli).not.toContain("publishVerifiedCurrentGlobalRiskHotSnapshot");
    expect(cli).not.toContain("x402");
    expect(GRI_PRIVATE_D1_PIPELINE).toBe("gri_private_v12");
  });
});
