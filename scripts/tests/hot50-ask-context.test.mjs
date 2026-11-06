import test from "node:test";
import assert from "node:assert/strict";
import {reviewedAskContext} from "../ops/verify-hot50-production-activation.mjs";
const at="2026-11-06T10:00:00.000Z";
const data={source_as_of:at,data:{indices:[{key:"geopolitics",score:41},{key:"macro",score:32},{key:"critical_minerals",score:23}]}};
function transport({wrongCategory=false,wrongScore=false,model=false}={}){
 const calls=[];
 const fetch=async(url,opts)=>{
 const {question}=JSON.parse(opts.body);calls.push(question);
 const key=question.includes("geopolitical")?"geopolitics":question.includes("macroeconomic")?"macro":"critical_minerals";
 const label=key==="geopolitics"?"Geopolitical Risk Index":key==="macro"?"Macroeconomic Risk Index":"Critical Minerals Risk Index";
 const score=data.data.indices.find(x=>x.key===key).score;
 const answer={summary:(wrongCategory?"Wrong Index":label)+": "+(wrongScore?99:score)+"/100 (reviewed GRI v1.2, as of "+at+").",
  real_time_message:"CURRENT_SIGNED_REVIEWED_RISK_INDEX",insufficient_evidence:false,answer_kind:"public_info",...(model?{model_rendering:"assisted"}:{})};
 return new Response('event: answer\ndata: '+JSON.stringify({ok:true,data:answer})+'\n\n',{
  headers:{"Content-Type":"text/event-stream"}});
 };return {fetch,calls};
}
test("all three signed score and source-clock values must match actual Ask SSE answers",async()=>{
 const t=transport();const result=await reviewedAskContext(data,t.fetch);
 assert.equal(result.pass,true);assert.equal(t.calls.length,3);assert.equal(result.timings.length,3);
});
test("wrong category, different score and model-generated numeric replacement fail retrieval",async()=>{
 for(const options of [{wrongCategory:true},{wrongScore:true},{model:true}])
  assert.equal((await reviewedAskContext(data,transport(options).fetch)).pass,false);
 assert.equal((await reviewedAskContext(null,()=>{throw Error('must not call')})).pass,false);
});
