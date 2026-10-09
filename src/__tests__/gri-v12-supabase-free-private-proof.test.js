import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildPrivateSupabaseFreeGriProof,
  GRI_PRIVATE_OFFLINE_ADMISSION_SCHEMA,
  GRI_PRIVATE_OFFLINE_PROOF_SCHEMA,
  griPrivateSha256,
} from "../../scripts/lib/gri-v12-private-offline-admission.mjs";
import { canonicalJson } from "../../scripts/lib/gri-engine-v12.js";
import { verifyPortableGriProofBundle } from "../../scripts/lib/gri-portable-proof-v12.js";

const NOW = new Date("2026-10-09T16:00:00.000Z");
const minutesAgo = (minute, now=NOW) =>
  new Date(now.getTime() - minute * 60_000).toISOString();

function event(category, seq=1, now=NOW) {
  const sourceDomain={
    geopolitics:"official-geo.example",
    macro:"official-macro.example",
    rare_earth:"official-minerals.example",
  }[category];
  return {
    id: category+"-"+seq,
    category, severity:category==="geopolitics" ? 74 : 52,
    confidence: 89,
    created_at:minutesAgo(12,now),
    published_at:minutesAgo(18,now),
    source_name:"Official publisher original",
    source_domain:sourceDomain,
    source_url:"https://"+sourceDomain+"/story/"+category+"-"+seq,
    source_title:"Original publisher reporting a verified material development",
    summary:"Private derived assessment; no public eligibility is asserted.",
    classification_provider:"groq",
    classification_model:"canonical-model",
    classification_version:"event-severity-v1.0.5",
    classification_prompt_version:"risk-desk-filter-v1.0.5",
    classification_scored_at:minutesAgo(10,now),
    classification_input_hash:"a".repeat(64),
    story_cluster_id:"independent-story-"+category+"-"+seq,
    story_canonical_label:"Verified publisher story correlation fixture",
    story_assignment_decision:"anchor",
    story_match_confidence:99,
    story_decision_rationale:"Canonical original-publisher story matching test proof",
    story_clustering_provider:"test-correlation-provider",
    story_clustering_model:"test-correlation-model",
    story_clustering_version:"story-correlation-v1.0.0",
    story_clustering_prompt_version:"story-match-title-v1.0.0",
    story_clustering_scored_at:minutesAgo(8,now),
    story_clustering_input_hash:"b".repeat(64),
  };
}
function admission(now=NOW) {
  return {
    schema:GRI_PRIVATE_OFFLINE_ADMISSION_SCHEMA,
    as_of:now.toISOString(),
    private_only:true,
    public_published:false,
    commercial_eligible:false,
    rights_verification_pending:true,
    independent_corroboration_pending:true,
    events:["geopolitics","macro","rare_earth"].map(c=>event(c,1,now)),
  };
}
function compute(a,now=NOW) {
  return buildPrivateSupabaseFreeGriProof({
    admission:a,
    expectedInputSha256:griPrivateSha256(canonicalJson(a)),
    now,
  });
}

describe("#1827 no-Supabase private deterministic GRI v1.2 intake",()=>{
  it("recomputes all 3 domains and independently verifies canonical portable proof without DB",()=>{
    const a=admission();
    const result=compute(a);
    expect(result.schema).toBe(GRI_PRIVATE_OFFLINE_PROOF_SCHEMA);
    expect(result.verified_methodology).toBe("gri-v1.2.0");
    expect(result.current_coverage).toBe(1);
    expect(result.current_categories).toEqual(["geopolitics","macro","rare_earth"]);
    expect(result.event_count).toBe(3);
    expect(result.portable_proof.current.reproduction.contributions).toHaveLength(3);
    const report=verifyPortableGriProofBundle(result.portable_proof,{
      expectedProofHash:result.portable_proof_hash,
    });
    expect(report.valid).toBe(true);
    expect(report.internallyReproducible).toBe(true);
    expect(report.authenticAgainstExpectedHash).toBe(true);
    expect(result.private_only).toBe(true);
    expect(result.public_published).toBe(false);
    expect(result.commercial_eligible).toBe(false);
    expect(result.input_authenticity_independently_verified).toBe(false);
    expect(result.rights_verification_pending).toBe(true);
    expect(result.independent_corroboration_pending).toBe(true);
    expect(result.portable_proof.previous).toBe(null);
    expect(result.portable_proof.attribution).toBe(null);
  });

  it("returns same deterministic GRI score/proof after source input row reorder",()=>{
    const a=admission(),b=admission();
    b.events.reverse();
    const first=compute(a),second=compute(b);
    expect(first.original_input_sha256).not.toBe(second.original_input_sha256);
    expect(first.portable_proof_hash).toBe(second.portable_proof_hash);
    expect(first.portable_bundle_hash).toBe(second.portable_bundle_hash);
  });

  it("rejects forged source hash, public flags and self-asserted source rights",()=>{
    const a=admission();
    expect(()=>buildPrivateSupabaseFreeGriProof({
      admission:a,now:NOW,expectedInputSha256:"0".repeat(64),
    })).toThrow("GRI_PRIVATE_INPUT_HASH_MISMATCH");
    for(const mutation of [
      {commercial_eligible:true},{public_published:true},
      {rights_verification_pending:false},
      {independent_corroboration_pending:false},
      {private_only:false},
    ]) expect(()=>compute({...admission(),...mutation}))
      .toThrow("GRI_PRIVATE_NONCOMMERCIAL_BOUNDARY_INVALID");
  });

  it("rejects partial domain coverage, stale/future source timestamps and forged story/classifier provenance",()=>{
    const a=admission();
    expect(()=>compute({...a,events:a.events.slice(0,2)}))
      .toThrow("GRI_PRIVATE_EVENT_COUNT_INVALID");
    const stale=admission();
    stale.events[2].created_at=minutesAgo(120);
    stale.events[2].published_at=minutesAgo(125);
    expect(()=>compute(stale)).toThrow("GRI_PRIVATE_DOMAIN_NOT_CURRENT:rare_earth");
    const future=admission();
    future.events[0].published_at=minutesAgo(-5);
    expect(()=>compute(future)).toThrow("GRI_PRIVATE_TIME_ORDER_OR_LOOKBACK_INVALID");
    const story=admission();
    story.events[0].story_clustering_version="made-up-correlation";
    expect(()=>compute(story)).toThrow("GRI_PRIVATE_CANONICAL_STORY_PROVENANCE_INVALID");
    const model=admission();
    model.events[0].classification_version="test-classifier";
    expect(()=>compute(model)).toThrow("GRI_PRIVATE_CANONICAL_CLASSIFIER_PROVENANCE_INVALID");
  });

  it("rejects raw payload injection, duplicate event and source publisher mismatch",()=>{
    const injected=admission();
    injected.events[0].raw_html="<script>raw story</script>";
    expect(()=>compute(injected)).toThrow("GRI_PRIVATE_UNEXPECTED_EVENT_FIELD");
    const dup=admission();
    dup.events[1].id=dup.events[0].id;
    expect(()=>compute(dup)).toThrow("GRI_PRIVATE_EVENT_DUPLICATE");
    const wrongPublisher=admission();
    wrongPublisher.events[0].source_domain="independent.fake";
    expect(()=>compute(wrongPublisher))
      .toThrow("GRI_PRIVATE_ORIGINAL_PUBLISHER_IDENTITY_INVALID");
    const invalidTimestamp=admission();
    invalidTimestamp.events[0].published_at="2026-10-09";
    expect(()=>compute(invalidTimestamp))
      .toThrow("GRI_PRIVATE_SOURCE_PUBLISHED_AT_INVALID");
  });

  it("CLI writes only immutable private local file, logs scrubbed metadata, no credentials",()=>{
    const cwd=mkdtempSync(join(tmpdir(),"geomacro-gri-private-proof-"));
    try {
      const current=new Date(Date.now()-15*60_000);
      const a=admission(current);
      const pin=griPrivateSha256(canonicalJson(a));
      const input=join(cwd,"input-private.json");
      writeFileSync(input,JSON.stringify(a));
      const script=resolve("scripts/ops/compute-supabase-free-private-gri-v12.mjs");
      const env={
        PATH:process.env.PATH,
        GRI_PRIVATE_ADMISSION_INPUT:input,
        GRI_PRIVATE_ADMISSION_SHA256:pin,
      };
      const out=spawnSync(process.execPath,[script,"--private-stage-only"],{
        cwd,env,encoding:"utf8",timeout:15000,
      });
      expect(out.status).toBe(0);
      expect(out.stderr).toBe("");
      const receipt=JSON.parse(out.stdout.trim());
      expect(receipt.ok).toBe(true);
      expect(receipt.b2_requests).toBe(0);
      expect(receipt.d1_writes).toBe(0);
      expect(receipt.usdc_spent).toBe(0);
      expect(receipt.public_published).toBe(false);
      expect(receipt.commercial_eligible).toBe(false);
      expect(out.stdout).not.toContain("official-geo.example");
      expect(out.stdout).not.toContain("Original publisher reporting");
      const files=readdirSync(join(cwd,"artifacts/private-gri-v12"));
      expect(files).toEqual([receipt.portable_bundle_hash+".json"]);
      const stored=JSON.parse(readFileSync(
        join(cwd,"artifacts/private-gri-v12",files[0]),"utf8"));
      expect(stored.portable_bundle_hash).toBe(receipt.portable_bundle_hash);
      expect(stored.portable_proof.proof.proofHash).toBe(receipt.portable_proof_hash);
      expect(statSync(join(cwd,"artifacts/private-gri-v12",files[0])).mode & 0o077).toBe(0);
      const replay=spawnSync(process.execPath,[script,"--private-stage-only"],{
        cwd,env,encoding:"utf8",timeout:15000,
      });
      expect(replay.status).not.toBe(0);
      expect(replay.stderr).not.toContain("official-geo.example");
      const invalid=spawnSync(process.execPath,[script,"--public"],{
        cwd,env,encoding:"utf8",timeout:15000,
      });
      expect(invalid.status).not.toBe(0);
      expect(invalid.stderr).toContain("GRI_PRIVATE_EXPLICIT_MODE_REQUIRED");
    } finally {
      rmSync(cwd,{recursive:true,force:true});
    }
  });
});
