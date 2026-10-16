import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {
 readB2CommercialSourceRights,readB2SourceNetworkStatus,
} from "../lib/b2-live.server";

beforeEach(()=>{
 vi.stubEnv("B2_S3_ENDPOINT","https://s3.us-east-005.backblazeb2.com");
 vi.stubEnv("B2_ARCHIVE_READ_KEY_ID","offline-test-key");
 vi.stubEnv("B2_ARCHIVE_READ_APPLICATION_KEY","offline-test-secret");
 vi.stubEnv("GEOMACRO_CONTROL_PLANE_TOKEN","");
 vi.stubEnv("CONTROL_PLANE_TOKEN","");
});
afterEach(()=>{
 vi.unstubAllGlobals();
 vi.unstubAllEnvs();
});
function receipt(){
 return Response.json({
  ok:true,schema:"geomacro.b2-account-request-reservation.v1",
  reserved:true,kind:"GET",b2_operation_performed:false,chargeable:false
 });
}
describe("private source metadata B2 Class B access / frozen Supabase quota failover",()=>{
 it("cannot issue a signed S3 GET when D1 quota credential is missing",async()=>{
   const hits:string[]=[];
   vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
     hits.push(String(input));
     return new Response(null,{status:500});
   }));
   expect(await readB2SourceNetworkStatus()).toBeNull();
   expect(await readB2CommercialSourceRights()).toBeNull();
   expect(hits).toEqual([]);
 });
 it("a rejected shared-account D1 reservation forbids any B2 request or quota bypass",async()=>{
   vi.stubEnv("GEOMACRO_CONTROL_PLANE_TOKEN","t".repeat(64));
   const hits:string[]=[];
   vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
     hits.push(String(input));
     expect(init?.method).toBe("POST");
     expect(init?.redirect).toBe("manual");
     expect(JSON.parse(String(init?.body)).kind).toBe("GET");
     return Response.json({ok:false,error:"B2_GLOBAL_DAILY_QUOTA_EXHAUSTED"},{status:429});
   }));
   expect(await readB2SourceNetworkStatus()).toBeNull();
   expect(await readB2CommercialSourceRights()).toBeNull();
   expect(hits).toHaveLength(2);
   expect(hits.every(u=>u.endsWith("/v1/b2-quota/reserve"))).toBe(true);
 });
 it("each private source-key read must reserve one GET before trying S3, never a write",async()=>{
   vi.stubEnv("GEOMACRO_CONTROL_PLANE_TOKEN","t".repeat(64));
   const observed:Array<{url:string;method:string;body?:string}>=[];
   vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
     const u=String(input);
     observed.push({url:u,method:String(init?.method),body:typeof init?.body==="string"?init.body:undefined});
     if(u.endsWith("/v1/b2-quota/reserve"))return receipt();
     if(u.startsWith("https://s3.us-east-005.backblazeb2.com/"))
       return Response.json({ok:false},{status:503});
     throw Error("UNEXPECTED_ORIGIN");
   }));
   expect(await readB2CommercialSourceRights()).toBeNull();
   expect(await readB2SourceNetworkStatus()).toBeNull();
   expect(observed).toHaveLength(4);
   expect(observed.map(x=>x.method)).toEqual(["POST","GET","POST","GET"]);
   expect(JSON.parse(String(observed[0].body)).workflow_id)
     .toBe("app_private_source_rights");
   expect(JSON.parse(String(observed[2].body)).workflow_id)
     .toBe("app_private_source_status");
   expect(observed.filter(x=>x.method==="GET").every(x=>x.url.startsWith(
     "https://s3.us-east-005.backblazeb2.com/geomacro-private-archive/"
   ))).toBe(true);
 });
 it("a superficially OK response without an atomic D1 reservation receipt must not authorize B2",async()=>{
  vi.stubEnv("GEOMACRO_CONTROL_PLANE_TOKEN","t".repeat(64));
  const hits:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
    hits.push(String(input));
    return Response.json({ok:true,reserved:false,kind:"GET"});
  }));
  expect(await readB2CommercialSourceRights()).toBeNull();
  expect(hits).toHaveLength(1);
 });
});
