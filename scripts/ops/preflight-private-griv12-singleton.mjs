#!/usr/bin/env node
/**
 * Pure zero-network, zero-cost admission BEFORE any B2 PUT during a
 * one-time 3-domain, one-article-per-domain PRIVATE GRI v1.2 canary.
 * The immutable original-source input is never printed or uploaded.
 */
import { readFileSync } from "node:fs";
import {
  STAGE_DOMAINS, CANONICAL_CLASSIFIER_VERSION,
  makePrivateStageBundle,
} from "../lib/restricted-private-scored-stage.mjs";
import { makePrivateGriCompanionBundle } from
  "../lib/private-gri-original-publisher-companion.mjs";
import { buildPrivateGriSingletonSourceBridge } from
  "../lib/private-gri-singleton-source-bridge.mjs";

const ROOT="artifacts/restricted-current-scoring";
const MAX_INPUT_BYTES=80*1024;
function parse(path) {
  const raw=readFileSync(path);
  if(raw.length<20 || raw.length>MAX_INPUT_BYTES)
    throw new Error("GRI_PRIVATE_CANARY_SOURCE_INPUT_SIZE_INVALID");
  try {return JSON.parse(raw.toString("utf8"));}
  catch {throw new Error("GRI_PRIVATE_CANARY_SOURCE_JSON_INVALID");}
}
export function preflightThreeDomainPrivateSingleton({
  candidatesByCategory,sourcesByCategory,now=new Date(),
}={}) {
  const staged=[],originals=[];
  for(const category of STAGE_DOMAINS) {
    const candidate=candidatesByCategory?.[category];
    const source=sourcesByCategory?.[category];
    if(candidate?.schema!=="geomacro.private-scoring-candidates.v1" ||
      candidate.category!==category ||
      candidate.classifier_version!==CANONICAL_CLASSIFIER_VERSION ||
      candidate.private_only!==true ||
      source?.schema!=="geomacro.private-gri-source-candidates.v1" ||
      source.category!==category ||
      source.private_only!==true ||
      source.public_published!==false ||
      source.commercial_eligible!==false ||
      !Array.isArray(candidate.records) ||
      !Array.isArray(source.records) ||
      candidate.records.length!==1 ||
      source.records.length!==1) {
      throw new Error("GRI_PRIVATE_CANARY_SINGLETON_SOURCE_REQUIRED:"+category);
    }
    staged.push(candidate.records[0]);
    originals.push(source.records[0]);
  }
  const stage=makePrivateStageBundle(staged,{now});
  const companion=makePrivateGriCompanionBundle(stage,originals,{now});
  const proof=buildPrivateGriSingletonSourceBridge({
    stage,sourceCompanion:companion,now,
  });
  if(proof.private_proof.current_coverage!==1 ||
    proof.private_proof.event_count!==3 ||
    proof.private_proof.private_only!==true ||
    proof.private_proof.public_published!==false ||
    proof.private_proof.commercial_eligible!==false) {
    throw new Error("GRI_PRIVATE_CANARY_PORTABLE_PROOF_INVALID");
  }
  return {
    schema:"geomacro.private-three-domain-gri-pre-b2-preflight.v1",
    accepted:true,
    private_only:true,public_published:false,commercial_eligible:false,
    current_categories:[...STAGE_DOMAINS],
    singleton_per_category:true,
    independently_corroborated:false,
    source_rights_verified:false,
    source_authenticity_independently_verified:false,
    prior_history_ledger_checked:false,
    remote_network_calls:0,
    b2_requests:0,d1_writes:0,supabase_writes:0,usdc_spent:0,
  };
}
if(process.argv[1]?.endsWith("/preflight-private-griv12-singleton.mjs")) {
  try {
    if(process.argv.length!==2) throw new Error("GRI_PRIVATE_CANARY_ARGS_INVALID");
    const candidates={},sources={};
    for(const category of STAGE_DOMAINS) {
      candidates[category]=parse(`${ROOT}/${category}.json`);
      sources[category]=parse(`${ROOT}/${category}-source.json`);
    }
    console.log(JSON.stringify(preflightThreeDomainPrivateSingleton({
      candidatesByCategory:candidates,sourcesByCategory:sources,
    })));
  } catch(error) {
    const message=error instanceof Error?error.message:"";
    const code=/^(GRI_PRIVATE|PRIVATE_GRI|PRIVATE_SCORING)_[A-Z0-9_:]+$/u.test(message)
      ?message:"GRI_PRIVATE_CANARY_REJECTED";
    console.error(JSON.stringify({accepted:false,error:code,
      b2_requests:0,d1_writes:0,supabase_writes:0,usdc_spent:0,
      public_published:false,commercial_eligible:false}));
    process.exitCode=2;
  }
}
