import {describe,it,expect,vi} from "vitest";
import {createGdeltDocRequestGate} from "../../scripts/lib/gdelt-doc-request-gate.mjs";
const URL="https://api.gdeltproject.org/api/v2/doc/doc?query=China&mode=ArtList&format=json";
describe("shared GDELT DOC pressure control without retrying denials",()=>{
  it("spaces successful calls without real sleeping and forwards only the pinned origin",async()=>{
    let clock=0;const seen:number[]=[];
    const gate=createGdeltDocRequestGate({clock:()=>clock,wait:async ms=>{clock+=ms;}});
    const fake=vi.fn(async()=>{seen.push(clock);return Response.json({articles:[]});});
    await gate(URL,{},fake);await gate(URL,{},fake);await gate(URL,{},fake);
    expect(seen).toEqual([0,5500,11000]);expect(fake.mock.calls[0][1].redirect).toBe("error");
    await expect(gate(URL.replace("api.gdeltproject.org","evil.invalid"),{},fake)).rejects.toThrow("GDELT_DOC_SCOPE_INVALID");
  });
  it.each([401,403,429])("blocks later calls after %s instead of retrying or changing routes",async status=>{
    let clock=0;const gate=createGdeltDocRequestGate({clock:()=>clock,wait:async ms=>{clock+=ms;}});
    const fake=vi.fn(async()=>new Response("",{status,headers:{"Retry-After":"3600"}}));
    await gate(URL,{},fake);
    await expect(gate(URL+"&category=other",{},fake)).rejects.toThrow("ON_DEMAND_PROVIDER_COOLDOWN");
    expect(fake).toHaveBeenCalledOnce();
  });
  it("does not queue concurrent user requests or spend HTTP calls after cancellation",async()=>{
    let release:Function=()=>{};const response=new Promise<Response>(r=>{release=r;});
    const fake=vi.fn(()=>response);const gate=createGdeltDocRequestGate();
    const first=gate(URL,{},fake);await expect(gate(URL,{},fake)).rejects.toThrow("ON_DEMAND_PROVIDER_COOLDOWN");
    release(Response.json({articles:[]}));await first;
    const controller=new AbortController();controller.abort();
    await expect(gate(URL,{signal:controller.signal},fake)).rejects.toThrow();expect(fake).toHaveBeenCalledOnce();
  });
});
