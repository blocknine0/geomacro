#!/usr/bin/env bun
// Assemble existing independently signed requests; never create approvals,
// private keys, signatures, source events, B2 writes or public entitlements.
import {createHash} from "node:crypto";
import {closeSync,constants,openSync,readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {assertPrivateReviewPaths} from "./accept-private-live-on-demand-gro";
import {parsePrivateMachineCommercialRequest} from "./accept-private-geomacro-machine-commercial-gro";
import {machineIntelligenceDerivedRow,qualifyMachineIntelligenceBatch} from "../../src/lib/machine-intelligence-publication.server";

export async function prepareMachinePublication(inputPath:string,outPath:string) {
  const paths=assertPrivateReviewPaths(inputPath,outPath);
  const batch=JSON.parse(readFileSync(paths.input,"utf8"));
  if(batch?.schema!=="geomacro.private-machine-intelligence-batch-request.v1"||
     Object.keys(batch).length!==2||!Array.isArray(batch.events)||
     batch.events.length<3||batch.events.length>12)
    throw Error("MACHINE_INTELLIGENCE_BATCH_INPUT_INVALID");
  const now=new Date();
  const eventPackages=batch.events.map((raw:unknown)=>{
    const item=parsePrivateMachineCommercialRequest(JSON.stringify(raw));
    return {schema:"geomacro.private-machine-intelligence-event.v1" as const,
      category:item.category,country_iso3:item.country_iso3,
      event:item.event as Parameters<typeof machineIntelligenceDerivedRow>[0]["event"],
      candidates:item.candidates as Parameters<typeof machineIntelligenceDerivedRow>[0]["candidates"],
      envelope:item.envelope as Parameters<typeof machineIntelligenceDerivedRow>[0]["envelope"]};
  });
  const rows=eventPackages.map((pkg:Parameters<typeof machineIntelligenceDerivedRow>[0])=>machineIntelligenceDerivedRow(pkg,now));
  const qualified=await qualifyMachineIntelligenceBatch({rows,eventPackages,now});
  if(Date.parse(qualified.qualified_until)<=Date.now())
    throw Error("MACHINE_INTELLIGENCE_BATCH_EXPIRED_DURING_READBACK");
  const bytes=Buffer.from(JSON.stringify({rows,eventPackages})+"\n");
  if(bytes.length>2*1024*1024)throw Error("MACHINE_INTELLIGENCE_BATCH_TOO_LARGE");
  const fd=openSync(paths.output,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,bytes)}finally{closeSync(fd)}
  const sha=createHash("sha256").update(bytes).digest("hex");
  return {status:"MACHINE_INTELLIGENCE_PRIVATE_BATCH_PREPARED",sha256:sha,
    private_b2_key:`geomacro-evidence/v1/private/machine-intelligence-current/${sha}.json`,
    qualified_until:qualified.qualified_until,event_count:eventPackages.length,
    public_published:false,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),input=args.find(a=>a.startsWith("--input="))?.slice(8),out=args.find(a=>a.startsWith("--out="))?.slice(6);
  (async()=>{if(args.length!==2||!input||!out)throw Error("INVALID_ARGS");
    console.log(JSON.stringify(await prepareMachinePublication(input,out)))})()
    .catch(()=>{console.error("MACHINE_INTELLIGENCE_BATCH_PREPARATION_FAILED_CLOSED");process.exitCode=3});
}
