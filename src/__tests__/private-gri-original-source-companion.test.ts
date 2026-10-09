import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  capturePrivateGriSourceCompanion,
  makePrivateGriCompanionBundle,
  validatePrivateGriCompanionBundle,
  PRIVATE_GRI_COMPANION_SCHEMA,
} from "../../scripts/lib/private-gri-original-publisher-companion.mjs";
import { makePrivateStageRecord, makePrivateStageBundle } from "../../scripts/lib/restricted-private-scored-stage.mjs";
import { verifyPrivateScoringD1Checkpoint } from "../../scripts/lib/private-scoring-d1-checkpoint-proof.mjs";

const now=new Date("2026-10-09T11:15:00.000Z");
const article={
  url:"https://publisher.example.org/release/original-123",
  sourceDomain:"publisher.example.org",
  title:"Verified publisher announces new material cross-border trade policy",
  publishedAt:"2026-10-09T10:58:00.000Z",
  discoveryProvider:"official_native_rss",
  nativePublishedAtVerified:true,
};
const assessment={
  relevant:true,category:"geopolitics",ungrounded:false,
  severity:74,confidence:86,
  narrative:"Derived policy change affects cross-border trade disruption risk.",
  summary:"Official decision raises estimated geopolitical corridor exposure.",
  classificationProvider:"groq", classificationModel:"canonical-model",
  classificationVersion:"event-severity-v1.0.5",
  classificationPromptVersion:"risk-desk-filter-v1.0.5",
  classificationInputHash:"a".repeat(64),
};
function fixture() {
  const staged=makePrivateStageRecord({article,assessment,category:"geopolitics",now});
  const source=capturePrivateGriSourceCompanion({article,staged,capturedAt:now});
  const stage=makePrivateStageBundle([staged],{now});
  return {staged,source,stage};
}

describe("#1827 private original-publisher title lineage to canonical GRI",()=>{
  it("preserves exact PRIVATE headline and true post-classifier observation time, not a hash reversal",()=>{
    const {staged,source,stage}=fixture();
    expect(JSON.stringify(stage)).not.toContain(article.title);
    expect(source.private_source_title).toBe(article.title);
    expect(source.event_id).toBe(staged.id);
    expect(source.private_source_title_sha256).toBe(staged.private_source.source_title_sha256);
    expect(source.original_published_at).toBe(article.publishedAt);
    expect(source.first_observed_at).toBe(now.toISOString());
    expect(source.classification_scored_at).toBe(now.toISOString());
    expect(source.original_publisher_native_timestamp_hint).toBe(true);
    expect(source.source_authenticity_independently_verified).toBe(false);
    expect(source.rights_verified).toBe(false);
    expect(source.independently_corroborated).toBe(false);
    expect(source.public_eligible).toBe(false);
    const companion=makePrivateGriCompanionBundle(stage,[source],{now});
    expect(companion.schema).toBe(PRIVATE_GRI_COMPANION_SCHEMA);
    expect(companion.private_only).toBe(true);
    expect(companion.public_published).toBe(false);
    expect(companion.commercial_eligible).toBe(false);
    expect(validatePrivateGriCompanionBundle(companion,stage,{now})).toEqual(companion);
    expect(companion.stage_bundle_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never upgrades discovery hints into independent source verification or rights",()=>{
    const {staged,stage}=fixture();
    const unverified=capturePrivateGriSourceCompanion({
      article:{...article,discoveryProvider:"gdelt",nativePublishedAtVerified:false},
      staged,capturedAt:now,
    });
    expect(unverified.original_publisher_native_timestamp_hint).toBe(false);
    const bundle=makePrivateGriCompanionBundle(stage,[unverified],{now});
    expect(bundle.commercial_eligible).toBe(false);
    expect(bundle.rights_verification_pending).toBe(true);
    expect(bundle.independent_corroboration_pending).toBe(true);
    expect(validatePrivateGriCompanionBundle(bundle,stage,{now})).toEqual(bundle);
  });

  it("fails on altered title, mismatched publisher, changed original date, bad event ID",()=>{
    const {staged,source,stage}=fixture();
    expect(()=>capturePrivateGriSourceCompanion({
      article:{...article,title:"Completely different official news about another policy"},
      staged,capturedAt:now,
    })).toThrow("PRIVATE_GRI_COMPANION_STAGE_BINDING_INVALID");
    expect(()=>capturePrivateGriSourceCompanion({
      article:{...article,sourceDomain:"fake.publisher.example"},
      staged,capturedAt:now,
    })).toThrow("PRIVATE_GRI_COMPANION_STAGE_BINDING_INVALID");
    expect(()=>capturePrivateGriSourceCompanion({
      article:{...article,publishedAt:"2026-10-08T03:00:00Z"},
      staged,capturedAt:now,
    })).toThrow("PRIVATE_GRI_COMPANION_TIME_INVALID");
    expect(()=>capturePrivateGriSourceCompanion({
      article,staged:{...staged,id:"f".repeat(64)},capturedAt:now,
    })).toThrow("PRIVATE_GRI_COMPANION_STAGE_BINDING_INVALID");
    const bad={...source,private_source_title:"Different report entirely"};
    expect(()=>makePrivateGriCompanionBundle(stage,[bad],{now}))
      .toThrow("PRIVATE_GRI_COMPANION_BINDING_INVALID");
  });

  it("rejects replay, duplicates, extra fields, tampering, public flag promotion",()=>{
    const {source,stage}=fixture();
    expect(()=>makePrivateGriCompanionBundle(stage,[],{now}))
      .toThrow("PRIVATE_GRI_COMPANION_STAGE_COUNT_MISMATCH");
    expect(()=>makePrivateGriCompanionBundle(stage,[source,source],{now}))
      .toThrow("PRIVATE_GRI_COMPANION_STAGE_COUNT_MISMATCH");
    expect(()=>makePrivateGriCompanionBundle(stage,[{...source,raw_html:"secret"}],{now}))
      .toThrow("PRIVATE_GRI_COMPANION_FIELD_SET_INVALID");
    const valid=makePrivateGriCompanionBundle(stage,[source],{now});
    for(const mutation of [
      {...valid,commercial_eligible:true},
      {...valid,rights_verification_pending:false},
      {...valid,public_published:true},
      {...valid,stage_bundle_sha256:"0".repeat(64)},
      {...valid,rows:[{...source,rights_verified:true}]},
      {...valid,rows:[{...source,original_published_at:"2026-10-08T10:00:00.000Z"}]},
    ]) expect(()=>validatePrivateGriCompanionBundle(mutation,stage,{now})).toThrow();
  });

  it("D1 compact checkpoint readback binds both B2 package hashes without source text",()=>{
    const sha="a".repeat(64),sourceSha="b".repeat(64),stageSha="c".repeat(64);
    const key=`geomacro-evidence/v1/private/restricted-current-scoring/${sha}.json.gz`;
    const companionKey=`geomacro-evidence/v1/private/gri-original-source-companions/${sourceSha}.json.gz`;
    const counts={geopolitics:1,macro:0,rare_earth:0};
    const stamp="2026-10-09T11:15:00.000Z";
    const cursor={
      status:"verified_private_staging",
      b2_key:key,sha256:sha,
      classifier_version:"event-severity-v1.0.5",counts,
      publication_authorized:false,
      source_companion_key:companionKey,
      source_companion_sha256:sourceSha,
      source_companion_stage_sha256:stageSha,
      source_companion_full_readback_verified:true,
      source_companion_exact_gzip_restore_verified:true,
    };
    const checkpoint={
      source_id:"orchestrator:private_stage",
      payload:{
        source:"geomacro_intelligence_orchestrator",
        task:"private_stage",cursor,
      },last_success_at:stamp,
    };
    const opts={
      b2Key:key,compressedSha256:sha,counts,lastSuccessAt:stamp,
      sourceCompanion:{key:companionKey,compressedSha256:sourceSha,stageSha256:stageSha},
    };
    expect(verifyPrivateScoringD1Checkpoint(checkpoint,opts)).toBe(true);
    expect(JSON.stringify(checkpoint)).not.toContain(article.title);
    expect(()=>verifyPrivateScoringD1Checkpoint({
      ...checkpoint,payload:{
        ...checkpoint.payload,
        cursor:{...cursor,source_companion_sha256:"d".repeat(64)},
      },
    },opts)).toThrow("PRIVATE_GRI_COMPANION_D1_READBACK_INVALID");
    expect(()=>verifyPrivateScoringD1Checkpoint({
      ...checkpoint,payload:{
        ...checkpoint.payload,
        cursor:{...cursor,source_companion_full_readback_verified:false},
      },
    },opts)).toThrow("PRIVATE_GRI_COMPANION_D1_READBACK_INVALID");
  });

  it("production writer requires 2 independent B2 restores BEFORE source-free D1 cursor",()=>{
    const ingest=readFileSync("scripts/ingest-news.js","utf8");
    const archive=readFileSync("scripts/ops/archive-restricted-private-scored-stage.mjs","utf8");
    const workflow=readFileSync(".github/workflows/restricted-private-current-scoring.yml","utf8");
    expect(ingest).toContain("capturePrivateGriSourceCompanion");
    expect(ingest).toContain("privateGriSourceRows.push(source)");
    expect(ingest).toContain("${domain}-source.json");
    expect(archive).toContain("validatePrivateGriCompanionBundle(restoredSource, stage)");
    expect(archive).toContain("PRIVATE_GRI_COMPANION_B2_READBACK_PROOF_INVALID");
    expect(archive.indexOf("sourceCompanionReceipt=await b2.putWithMetadataVerification"))
      .toBeLessThan(archive.indexOf("await control.persist"));
    expect(archive).toContain("source_companion_full_readback_verified: true");
    expect(archive).toContain("sourceCompanion: {");
    expect(archive).toContain('B2_ACCOUNT_QUOTA_REQUIRED !== "1"');
    expect(workflow).toContain('B2_REQUEST_BUDGET: "6"');
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain("archive-proof.json");
    expect(workflow).not.toContain("-source.json");
    expect(workflow).not.toContain("artifacts/restricted-current-scoring/*.json");
  });
});
