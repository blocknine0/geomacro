import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  statSync, readdirSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  makePrivateStageRecord,
  makePrivateStageBundle,
} from "../../scripts/lib/restricted-private-scored-stage.mjs";
import {
  capturePrivateGriSourceCompanion,
  makePrivateGriCompanionBundle,
} from "../../scripts/lib/private-gri-original-publisher-companion.mjs";
import {
  buildPrivateGriSingletonSourceBridge,
} from "../../scripts/lib/private-gri-singleton-source-bridge.mjs";
import {
  compileVerifiedPrivateSingletonProof,
} from "../../scripts/ops/prepare-private-griv12-singleton-proof.mjs";
import {
  verifyPortableGriProofBundle,
} from "../../scripts/lib/gri-portable-proof-v12.js";
import { canonicalJson } from "../../scripts/lib/gri-engine-v12.js";
import { sha256 } from "../../scripts/lib/restricted-private-scored-stage.mjs";

const NOW=new Date("2026-10-09T17:30:00.000Z");
const mins=n=>new Date(NOW.getTime()-n*60_000).toISOString();
const CATEGORIES=["geopolitics","macro","rare_earth"];
function article(category,now=NOW) {
  const hostname="official-"+category.replace("_","-")+".example.org";
  return {
    url:"https://"+hostname+"/material-update",
    sourceDomain:hostname,
    title:"Original verified publisher reports a distinct material "+category+" development",
    publishedAt:new Date(now.getTime()-22*60_000).toISOString(),
    discoveryProvider:"official_native_rss",
    nativePublishedAtVerified:true,
  };
}
function assessment(category) {
  return {
    relevant:true,category,ungrounded:false,
    severity:category==="geopolitics"?76:58, confidence:91,
    narrative:"Derived assessment identifies a notable emerging policy and resource risk.",
    summary:"Material verified source raises estimated risk level in this domain.",
    classificationProvider:"groq", classificationModel:"canonical-model",
    classificationVersion:"event-severity-v1.0.5",
    classificationPromptVersion:"risk-desk-filter-v1.0.5",
    classificationInputHash:"a".repeat(64),
  };
}
function makeEvidence(now=NOW) {
  const staged=[],sources=[];
  for(const category of CATEGORIES) {
    const a=article(category,now),out=assessment(category);
    const row=makePrivateStageRecord({article:a,assessment:out,category,now});
    const source=capturePrivateGriSourceCompanion({
      article:a,staged:row,capturedAt:now,
    });
    staged.push(row);sources.push(source);
  }
  const stage=makePrivateStageBundle(staged,{now});
  const sourceCompanion=makePrivateGriCompanionBundle(stage,sources,{now});
  const stageBytes=Buffer.from(JSON.stringify(stage));
  const companionBytes=Buffer.from(JSON.stringify(sourceCompanion));
  const stageDigest=sha256(gzipSync(stageBytes,{level:9}));
  const compDigest=sha256(gzipSync(companionBytes,{level:9}));
  const receipt={
    ok:true,role:"private_stage_only",
    b2_full_readback_sha256_verified:true,
    b2_exact_gzip_restore_verified:true,
    d1_checkpoint_readback_verified:true,
    d1_compact_checkpoint_persisted:true,
    private_original_source_companion_restored:true,
    private_original_source_companion_d1_bound:true,
    original_headlines_public_published:false,
    source_authenticity_independently_verified:false,
    public_published:false,commercial_eligible:false,
    content_addressed_b2_key:
      "geomacro-evidence/v1/private/restricted-current-scoring/"+stageDigest+".json.gz",
    compressed_sha256:stageDigest,
    private_original_source_companion_b2_key:
      "geomacro-evidence/v1/private/gri-original-source-companions/"+compDigest+".json.gz",
    private_original_source_companion_sha256:compDigest,
  };
  return {stage,sourceCompanion,stageBytes,companionBytes,receipt};
}
const bridge=(v=makeEvidence(),now=NOW)=>
  buildPrivateGriSingletonSourceBridge({
    stage:v.stage,sourceCompanion:v.sourceCompanion,now,
  });
const verified=(v=makeEvidence(),now=NOW)=>
  compileVerifiedPrivateSingletonProof({...v,now});

describe("#1827 zero-Supabase strict private original-source -> GRI v1.2 bridge",()=>{
  it("accepts 1 first-party original event per domain with exact canonical singleton story hash",()=>{
    const e=makeEvidence(),r=bridge(e);
    expect(r.private_proof.current_coverage).toBe(1);
    expect(r.private_proof.event_count).toBe(3);
    expect(r.private_proof.public_published).toBe(false);
    expect(r.private_proof.commercial_eligible).toBe(false);
    expect(r.admission.events.map(x=>x.category)).toEqual(CATEGORIES);
    for(const row of r.admission.events) {
      expect(row.created_at).toBe(NOW.toISOString());
      expect(row.published_at).toBe(mins(22));
      expect(row.story_assignment_decision).toBe("anchor");
      expect(row.story_clustering_provider).toBe("deterministic");
      expect(row.story_clustering_model).toBe("singleton-bootstrap-v1");
      expect(row.story_cluster_id).toMatch(/^private-singleton:[a-f0-9]{64}$/);
      const witness=canonicalJson({
        category:row.category,eventId:row.id,
        sourceTitle:row.source_title,publishedAt:row.published_at,
        sourceDomain:row.source_domain,decision:"bootstrap-new-story",
      });
      expect(row.story_clustering_input_hash).toBe(sha256(witness));
      expect(row.story_decision_rationale).toContain("NOT verified");
    }
    expect(verifyPortableGriProofBundle(r.private_proof.portable_proof,{
      expectedProofHash:r.private_proof.portable_proof_hash,
    }).valid).toBe(true);
    expect(verified(e).prior_archive_readback_receipt_consistent).toBe(true);
    expect(verified(e).archive_readback_independently_rechecked).toBe(false);
    expect(verified(e).independent_history_story_continuity_verified).toBe(false);
  });

  it("is independently deterministic at the same original as-of, regardless of input ordering",()=>{
    const e=makeEvidence(),first=bridge(e);
    const reversed={
      ...e,
      stage:{...e.stage,rows:[...e.stage.rows].reverse()},
      sourceCompanion:{...e.sourceCompanion,rows:[...e.sourceCompanion.rows].reverse()},
    };
    // Existing bundle validator MUST reject doctored ordering rather than
    // silently recomputing history or mutating source labels.
    expect(()=>bridge(reversed)).toThrow();
    const second=bridge(e);
    expect(second.expected_input_sha256).toBe(first.expected_input_sha256);
    expect(second.private_proof.portable_bundle_hash)
      .toBe(first.private_proof.portable_bundle_hash);
  });

  it("requires one per domain, native-original timestamp hint, recent nonfuture publisher dates",()=>{
    const e=makeEvidence();
    const extra={...e.stage.rows[0],id:"f".repeat(64)};
    const doubled={
      ...e,stage:{...e.stage,rows:[...e.stage.rows,extra],
        counts:{...e.stage.counts,geopolitics:2}},
    };
    expect(()=>bridge(doubled)).toThrow();
    const noNative={
      ...e,sourceCompanion:{...e.sourceCompanion,
        rows:e.sourceCompanion.rows.map((r,i)=>i===0?
          {...r,original_publisher_native_timestamp_hint:false}:r)},
    };
    expect(()=>bridge(noNative)).toThrow(
      "GRI_PRIVATE_BRIDGE_ORIGINAL_PUBLISHER_NOT_ADMITTED:geopolitics");
    expect(()=>bridge(e,new Date(NOW.getTime()+93*60_000))).toThrow();
    const future=makeEvidence();
    future.sourceCompanion.rows[0].first_observed_at=
      new Date(NOW.getTime()+8*60_000).toISOString();
    expect(()=>bridge(future)).toThrow();
  });

  it("rejects fake/altered archive receipt, source hashes and dishonest public flags",()=>{
    const e=makeEvidence();
    expect(()=>verified({...e,receipt:{...e.receipt,
      compressed_sha256:"0".repeat(64)}})).toThrow(
      "GRI_PRIVATE_BRIDGE_VERIFIED_ARCHIVE_LINEAGE_INVALID");
    expect(()=>verified({...e,receipt:{...e.receipt,
      d1_checkpoint_readback_verified:false}})).toThrow();
    expect(()=>verified({...e,receipt:{...e.receipt,
      commercial_eligible:true}})).toThrow();
    expect(()=>verified({...e,companionBytes:Buffer.from("{}")}))
      .toThrow("GRI_PRIVATE_BRIDGE_LOCAL_BYTES_MUTATED");
    const x=makeEvidence();
    x.sourceCompanion.rows[0].private_source_title="Fake story with different SHA";
    expect(()=>bridge(x)).toThrow();
  });

  it("CLI consumes only exact local verified B2 stage and companion, saves private proof 0600",()=>{
    const e=makeEvidence(new Date(Date.now()-15*60_000));
    const cwd=mkdtempSync(join(tmpdir(),"geomacro-private-gri-bridge-"));
    try {
      const privateRoot=join(cwd,"artifacts/restricted-current-scoring");
      mkdirSync(privateRoot,{recursive:true});
      writeFileSync(join(privateRoot,"verified-stage.json"),e.stageBytes);
      writeFileSync(join(privateRoot,"verified-source-companion.json"),e.companionBytes);
      writeFileSync(join(privateRoot,"archive-proof.json"),JSON.stringify(e.receipt));
      // Date-relative real-time fixture remains valid across future CI runs.
      const script=resolve("scripts/ops/prepare-private-griv12-singleton-proof.mjs");
      const child=spawnSync(process.execPath,[script,"--private-singleton-only"],{
        cwd,env:{PATH:process.env.PATH},encoding:"utf8",timeout:15000,
      });
      expect(child.status).toBe(0);
        const result=JSON.parse(child.stdout.trim());
        expect(result.ok).toBe(true);
        expect(result.public_published).toBe(false);
        expect(result.commercial_eligible).toBe(false);
        expect(result.b2_requests).toBe(0);
        expect(result.d1_writes).toBe(0);
        expect(child.stdout).not.toContain("Original verified publisher");
        const files=readdirSync(join(cwd,"artifacts/private-gri-v12"));
        expect(files).toHaveLength(2);
        for(const file of files) {
          expect(statSync(join(cwd,"artifacts/private-gri-v12",file)).mode & 0o077).toBe(0);
        }
        const raw=readFileSync(join(cwd,"artifacts/private-gri-v12",
          result.portable_bundle_hash+".json"),"utf8");
        expect(JSON.parse(raw).commercial_eligible).toBe(false);
      const denied=spawnSync(process.execPath,[script,"--public"],{
        cwd,env:{PATH:process.env.PATH},encoding:"utf8",timeout:15000,
      });
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toContain("GRI_PRIVATE_BRIDGE_EXPLICIT_MODE_REQUIRED");
    } finally {
      rmSync(cwd,{recursive:true,force:true});
    }
  });

  it("keeps private title files outside GitHub Actions artifact upload and never enables payment",()=>{
    const source=readFileSync("scripts/ops/prepare-private-griv12-singleton-proof.mjs","utf8");
    const archiver=readFileSync("scripts/ops/archive-restricted-private-scored-stage.mjs","utf8");
    const workflow=readFileSync(".github/workflows/restricted-private-current-scoring.yml","utf8");
    expect(archiver).toContain("verified-source-companion.json");
    expect(archiver).toContain("verified-stage.json");
    expect(archiver.indexOf("d1_checkpoint_readback_verified: true"))
      .toBeLessThan(archiver.indexOf("writeFileSync(`${ARTIFACT_DIR}/verified-stage.json`"));
    expect(workflow).not.toContain("verified-source-companion.json");
    expect(workflow).not.toContain("verified-stage.json");
    expect(workflow).toContain("archive-proof.json");
    expect(source).toContain("GRI_PRIVATE_BRIDGE_NETWORK_CREDENTIALS_FORBIDDEN");
    expect(source).not.toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN: ${{ secrets");
  });
});
