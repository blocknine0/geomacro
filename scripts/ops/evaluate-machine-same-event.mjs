#!/usr/bin/env node
/** Private local/stdin machine-event candidate evaluation, no reviewer key. */
import {readFileSync} from "node:fs";
import {evaluateGeomacroMachineCorroboration} from "../lib/geomacro-machine-corroboration.mjs";

const MAX_BYTES=256*1024;
try{
  if(process.argv.length!==2)throw Error("GEOMACRO_MACHINE_REVIEW_USAGE_INVALID");
  const bytes=readFileSync(0);
  if(bytes.length<2 || bytes.length>MAX_BYTES)
    throw Error("GEOMACRO_MACHINE_REVIEW_INPUT_INVALID");
  const payload=JSON.parse(bytes.toString("utf8"));
  if(payload?.schema!=="geomacro.private-normalized-original-candidates.v1" ||
     !Array.isArray(payload.candidates))
    throw Error("GEOMACRO_MACHINE_REVIEW_INPUT_INVALID");
  const result=evaluateGeomacroMachineCorroboration({
    candidates:payload.candidates,now:new Date(),
  });
  process.stdout.write(JSON.stringify(result)+"\n");
}catch{
  // Never echo private source bytes, titles, identities or upstream URLs.
  process.stderr.write(JSON.stringify({
    schema:"geomacro.private-automated-same-event-candidate.v1",
    error:"GEOMACRO_MACHINE_CANDIDATE_NOT_ADMITTED",
    paid_data_eligible:false,payment_authorized:false,
    raw_sources_disclosed:false,
  })+"\n");
  process.exitCode=2;
}
