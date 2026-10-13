import {describe,expect,it,vi} from "vitest";
import {chooseJevSourceReviewPriority} from "./on-demand-jev-source-priority.server";

const features=[
  {category:"geopolitics" as const,first_party_native_dated_count:0,
   first_party_index_only_count:2},
  {category:"macro" as const,first_party_native_dated_count:1,
   first_party_index_only_count:0},
  {category:"rare_earth" as const,first_party_native_dated_count:0,
   first_party_index_only_count:1},
];
describe("optional Jev Engineering decision router is not a source/paid proof",()=>{
  it("costs zero additional network without explicit opt-in, even with an API key",async()=>{
    const fetchImpl=vi.fn(async()=>{throw Error("JEV_MUST_NOT_BE_CALLED");}) as unknown as typeof fetch;
    expect(await chooseJevSourceReviewPriority(features,{
      enabled:false,key:"test",fetchImpl,
    })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("uses a single short redacted TypeSafe choice response to prioritize only source review",async()=>{
    const calls:{url:string,request:RequestInit|undefined}[]=[];
    const fetchImpl=vi.fn(async(input:RequestInfo|URL,opts?:RequestInit)=>{
      calls.push({url:String(input),request:opts});
      return Response.json({model:"jev-1.13.0",answers:{next_category:{
        type:"choice",choice:"rare_earth",confidence:0.83,
        probabilities:{rare_earth:0.86,macro:0.09,geopolitics:0.05},
      }}});
    }) as unknown as typeof fetch;
    expect(await chooseJevSourceReviewPriority(features,{
      key:"PRIVATE_TEST_ONLY",enabled:true,fetchImpl,
    })).toBe("rare_earth");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(calls[0].request?.method).toBe("POST");
    expect(calls[0].request?.redirect).toBe("error");
    const sent=JSON.parse(String(calls[0].request?.body));
    expect(sent.model).toBe("jev-latest");
    expect(sent.state.categories).toHaveLength(3);
    expect(sent.questions.next_category.type).toBe("choice");
    for(const restricted of ["original_article_url","source_url","article_title",
      "source_id","publisher_family","IND", "PRIVATE_TEST_ONLY"]){
      expect(JSON.stringify(sent)).not.toContain(restricted);
    }
  });
  it("rejects unsupported category, low confidence, invalid bodies and any paid denial",async()=>{
    const answer=(choice:string,probability:number,confidence:number)=>
      Response.json({answers:{next_category:{
        type:"choice",choice,confidence,probabilities:{[choice]:probability},
      }}});
    for(const response of [
      answer("third_party_search",1,1),answer("macro",0.5,0.99),
      answer("macro",0.9,0.5),
      new Response("{}",{status:403}),new Response("{}",{status:429}),
      new Response("not json",{status:200}),
    ]){
      const f=vi.fn(async()=>response.clone()) as unknown as typeof fetch;
      expect(await chooseJevSourceReviewPriority(features,{
        key:"PRIVATE_TEST_ONLY",enabled:true,fetchImpl:f,
      })).toBeNull();
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
  it("never asks Jev to choose outside a fixed policy or under invalid metrics",async()=>{
    const fetchImpl=vi.fn(async()=>{throw Error("No request");}) as unknown as typeof fetch;
    expect(await chooseJevSourceReviewPriority([{...features[0],
      first_party_index_only_count:100}],{
      enabled:true,key:"test",fetchImpl,
    })).toBeNull();
    expect(await chooseJevSourceReviewPriority([features[0],features[0]],{
      enabled:true,key:"test",fetchImpl,
    })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
