#!/usr/bin/env bun
/**
 * NO-FUNDS automatic batch conversion of ALREADY real, separately dual-signed
 * private commercial requests into canonical GROs. Trust boundary:
 * protected owner-private directory and existing fixed canonical verifier.
 *
 * This CLI cannot create article licences, independent facts, human consent
 * or paid customer availability. It also cannot publish B2/D1 hot products.
 * Operator's only safe stdout is aggregate counts, never input identities.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
// @ts-expect-error JavaScript service shares repo's tested local runtime.
import {processAutomaticPrivateCommercialNewsBatch} from "../lib/automatic-private-commercial-news-batch.mjs";
import {parsePrivateMachineCommercialRequest,acceptMachineCommercialPrivateGRO}
 from "./accept-private-geomacro-machine-commercial-gro";

export async function runAutomaticPrivateCommercialNewsBatch(
  env=process.env, args=process.argv.slice(2),
){
 if(args.length!==1||args[0]!=="--once"||
    !env.GEOMACRO_PRIVATE_REVIEW_DIR)
   throw Error("AUTOMATIC_PRIVATE_COMMERCIAL_NEWS_BATCH_REJECTED");
 return processAutomaticPrivateCommercialNewsBatch({
  root:env.GEOMACRO_PRIVATE_REVIEW_DIR,
  inspect:async (raw:string)=>{
   const request=parsePrivateMachineCommercialRequest(raw);
   const event=request.event as Record<string,unknown>;
   return {category:request.category,country_iso3:request.country_iso3,
    event_id:event.id};
  },
  qualify:acceptMachineCommercialPrivateGRO,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 runAutomaticPrivateCommercialNewsBatch().then(result=>{
   console.log(JSON.stringify(result));
   if(result.invalid_or_unverified_private_requests>0||
      result.repeated_event_requests_rejected>0)
     process.exitCode=2;
 }).catch(()=>{
   console.error("AUTOMATIC_PRIVATE_COMMERCIAL_NEWS_BATCH_REJECTED");
   process.exitCode=2;
 });
}
