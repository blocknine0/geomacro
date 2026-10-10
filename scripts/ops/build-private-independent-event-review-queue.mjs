#!/usr/bin/env node
// Manual/private local handoff only. No workflow schedule and no model, B2,
// Supabase, D1, x402, publisher fetch or raw article output.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { clusterPrivateIndependentEventCandidates } from "../lib/private-independent-event-review-queue.mjs";

export async function producePrivateReviewQueue(input,now=new Date()) {
  if(!input||!Array.isArray(input.candidates))
    throw Error("PRIVATE_REVIEW_QUEUE_INPUT_INVALID");
  return clusterPrivateIndependentEventCandidates({
    candidates:input.candidates,now,
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    let raw="";
    for await(const buf of process.stdin){
      raw+=buf.toString("utf8");
      if(raw.length>256*1024)throw Error("PRIVATE_REVIEW_QUEUE_INPUT_TOO_LARGE");
    }
    // Deliberately do not log input or private article metadata.
    const receipt=await producePrivateReviewQueue(JSON.parse(raw));
    console.log(JSON.stringify(receipt));
    if(receipt.matched_event_claims===0||
       receipt.review_candidates.every(x=>x.state!=="MULTI_ORIGIN_REVIEW_REQUIRED"))
      process.exitCode=2;
  }catch{
    console.error("::error::PRIVATE_MULTI_SOURCE_REVIEW_QUEUE_NOT_VERIFIED");
    process.exitCode=2;
  }
}
