import {describe,it,expect} from "vitest";
import {createAskTabReuse} from "./ask-tab-reuse";
import type {AskAnswer} from "./ask-geomacro.functions";

const answer={
 summary:"Inflation describes a general rise in consumer prices over time.",
 what_changed:"This is a general explanation; no new event is established.",
 why_it_matters:"Purchasing power declines as prices rise.",
 geomacro_view:"Compare headline inflation, core inflation and reporting dates.",
 answer_kind:"explainer",evidence:[],insufficient_evidence:false,low_confidence:false,
 gri:null,mean_relevance:null,generatedAt:"2026-11-06T01:00:00.000Z",
 data_mode:"permanent",cache_status:"bypassed",
 source_identity_exposed:false,durable_live_storage_write:false,
} satisfies AskAnswer;

describe("private-safe same-tab repeat answer reuse",()=>{
 it("avoids repeated network requests for exact standalone timeless public explainers",()=>{
  const reuse=createAskTabReuse();
  reuse.remember("What is inflation?",false,answer,10_000);
  const hit=reuse.get("  WHAT is  inflation? ",false,10_001);
  expect(hit?.summary).toBe(answer.summary);
  expect(hit?.cache_status).toBe("hit");
  expect(hit).not.toBe(answer);
  expect(reuse.get("What is inflation?",false,10_000+30*60_000)).toBeNull();
 });
 it("never reuses dialogue-context-dependent queries, personalized prompts or time-sensitive intelligence",()=>{
  const reuse=createAskTabReuse();
  reuse.remember("What is inflation?",true,answer,10_000);
  expect(reuse.get("What is inflation?",false,10_001)).toBeNull();
  reuse.remember("What is inflation?",false,answer,10_000);
  expect(reuse.get("What is inflation?",true,10_001)).toBeNull();
  for(const q of ["What's my account?", "Latest inflation news", "Current macro outlook", "What is the price now?"]){
   reuse.remember(q,false,answer,10_000);
   expect(reuse.get(q,false,10_001)).toBeNull();
  }
 });
 it("rejects insufficient, scored and source-bearing results; clear removes reuse",()=>{
  const reuse=createAskTabReuse();
  const q="Explain geopolitical risk";
  for(const unsafe of [
   {...answer,insufficient_evidence:true},
   {...answer,gri:1},
   {...answer,evidence:[{eventId:"abc"}] as AskAnswer["evidence"]},
   {...answer,what_changed:""},
   {...answer,answer_kind:"public_info" as const},
  ]){
   reuse.remember(q,false,unsafe as AskAnswer,10_000);
   expect(reuse.get(q,false,10_001)).toBeNull();
  }
  reuse.remember(q,false,answer,10_000);
  reuse.clear();
  expect(reuse.get(q,false,10_001)).toBeNull();
 });
});