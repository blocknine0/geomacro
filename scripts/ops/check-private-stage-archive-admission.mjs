#!/usr/bin/env node
/**
 * Zero-funds / zero-B2 admission after the canonical PRIVATE classifier.
 * Empty source-matched scored stages have nothing to archive. A nonempty
 * private stage still MUST complete full B2+D1 verification before ACK.
 * Invalid or mismatched staged companions are terminal, never an empty skip.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {STAGE_DOMAINS,CANONICAL_CLASSIFIER_VERSION} from
  "../lib/restricted-private-scored-stage.mjs";

const fail=()=>{throw Error("PRIVATE_SCORING_B2_ARCHIVE_ADMISSION_INVALID")};
const MAX_INPUT_BYTES=80*1024;
export function evaluatePrivateStageArchiveAdmission(stageFiles,sourceFiles) {
  if(!stageFiles||!sourceFiles||
     Object.keys(stageFiles).sort().join(",")!==[...STAGE_DOMAINS].sort().join(",")||
     Object.keys(sourceFiles).sort().join(",")!==[...STAGE_DOMAINS].sort().join(","))fail();
  let count=0;
  for(const domain of STAGE_DOMAINS){
    const a=stageFiles[domain],b=sourceFiles[domain];
    if(a?.schema!=="geomacro.private-scoring-candidates.v1"||
       a.category!==domain||
       a.classifier_version!==CANONICAL_CLASSIFIER_VERSION||
       a.private_only!==true||!Array.isArray(a.records)||
       a.records.length>2||
       a.records.some(x=>x?.category!==domain)||
       b?.schema!=="geomacro.private-gri-source-candidates.v1"||
       b.category!==domain||b.private_only!==true||
       b.public_published!==false||b.commercial_eligible!==false||
       !Array.isArray(b.records)||b.records.length!==a.records.length||
       b.records.length>2||b.records.some(x=>x?.category!==domain))fail();
    // Identity equality is required before choosing a no-archive path.
    // The full canonical stage/companion validator remains mandatory
    // for every nonempty archive (including title, clock and SHA binding).
    const aIds=a.records.map(x=>x?.id);
    const bIds=b.records.map(x=>x?.event_id);
    if(aIds.some(id=>typeof id!=="string"||!/^[a-f0-9]{64}$/u.test(id))||
       bIds.some(id=>typeof id!=="string"||!/^[a-f0-9]{64}$/u.test(id))||
       new Set(aIds).size!==aIds.length||
       aIds.sort().join(",")!==bIds.sort().join(","))fail();
    count+=a.records.length;
  }
  return Object.freeze({
    archive_required:count>0,
    stage_row_count:count,
    b2_calls_by_preflight:0,
    public_published:false,
    commercial_eligible:false,
  });
}

function parseBounded(file){
  const bytes=readFileSync(file);
  if(bytes.byteLength<20||bytes.byteLength>MAX_INPUT_BYTES)fail();
  try{return JSON.parse(bytes.toString("utf8"))}
  catch{fail()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url).pathname){
  try{
    if(process.argv.length!==2)fail();
    const dir="artifacts/restricted-current-scoring";
    const stage={},source={};
    for(const domain of STAGE_DOMAINS){
      stage[domain]=parseBounded(`${dir}/${domain}.json`);
      source[domain]=parseBounded(`${dir}/${domain}-source.json`);
    }
    const result=evaluatePrivateStageArchiveAdmission(stage,source);
    // Numeric, sanitized CLI output; zero means NO archive and NO public data.
    process.stdout.write(result.archive_required?"1\n":"0\n");
  }catch{
    console.error("::error::PRIVATE_SCORING_B2_ARCHIVE_ADMISSION_INVALID");
    process.exitCode=2;
  }
}
