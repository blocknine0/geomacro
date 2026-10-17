import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {readB2StructuralServingSnapshot} from "../lib/b2-structural.server";
import {reservePrivateB2Read} from "../lib/b2-live.server";

const readKey="geomacro-evidence/v1/structural/serving/latest.json.gz";
const proofKey="geomacro-evidence/v1/structural/serving/latest-proof.json";
const worker="https://geomacro-control-plane.daspallab202391.workers.dev/v1/b2-quota/reserve";
beforeEach(()=>{
  vi.stubEnv("B2_S3_ENDPOINT","https://s3.us-east-005.backblazeb2.com");
  vi.stubEnv("B2_ARCHIVE_READ_KEY_ID","quota-test-archive-key");
  vi.stubEnv("B2_ARCHIVE_READ_APPLICATION_KEY","quota-test-archive-secret");
  vi.stubEnv("B2_KEY_ID","");
  vi.stubEnv("B2_APPLICATION_KEY","");
  vi.stubEnv("GEOMACRO_CONTROL_PLANE_TOKEN","");
  vi.stubEnv("CONTROL_PLANE_TOKEN","");
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const ticket=()=>Response.json({
  ok:true,schema:"geomacro.b2-account-request-reservation.v1",
  reserved:true,kind:"GET",b2_operation_performed:false,chargeable:false,
});
describe("structural serving uses the existing atomic D1 B2 Class B governor",()=>{
  it("without control-plane auth cannot issue ANY B2 signed request",async()=>{
    const hits:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async(url:RequestInfo|URL)=>{
      hits.push(String(url));
      throw Error("SHOULD_NOT_FETCH");
    }));
    expect(await readB2StructuralServingSnapshot()).toBeNull();
    expect(hits).toEqual([]);
  });
  it("quota denied forbids S3 fallback even with read credentials",async()=>{
    vi.stubEnv("GEOMACRO_CONTROL_PLANE_TOKEN","t".repeat(64));
    const hits:Array<{url:string,method:string}>=[];
    vi.stubGlobal("fetch",vi.fn(async(url:RequestInfo|URL,options?:RequestInit)=>{
      hits.push({url:String(url),method:options?.method??"GET"});
      return Response.json({ok:false,error:"B2_GLOBAL_DAILY_QUOTA_EXHAUSTED"},{status:429});
    }));
    expect(await readB2StructuralServingSnapshot()).toBeNull();
    expect(hits).toHaveLength(2);
    expect(hits.every(hit=>hit.url===worker && hit.method==="POST")).toBe(true);
  });
  it("both structural keys use the SAME existing D1 account quota receipt",async()=>{
    vi.stubEnv("GEOMACRO_CONTROL_PLANE_TOKEN","t".repeat(64));
    const hits:Array<{url:string,method:string,body?:string}>=[];
    vi.stubGlobal("fetch",vi.fn(async(url:RequestInfo|URL,options?:RequestInit)=>{
      const item={url:String(url),method:options?.method??"GET",body:String(options?.body??"")};
      hits.push(item);
      if(item.url===worker)return ticket();
      if(item.url.startsWith("https://s3.us-east-005.backblazeb2.com/"))
        return new Response("",{status:404});
      throw Error("UNKNOWN_B2_GATEWAY");
    }));
    expect(await readB2StructuralServingSnapshot()).toBeNull();
    const reservations=hits.filter(hit=>hit.method==="POST");
    const attempts=hits.filter(hit=>hit.method==="GET");
    expect(reservations).toHaveLength(2);
    expect(attempts).toHaveLength(2);
    expect(reservations.every(hit=>JSON.parse(hit.body??"{}").workflow_id==="app_private_structural_serving")).toBe(true);
    expect(reservations.every(hit=>JSON.parse(hit.body??"{}").kind==="GET")).toBe(true);
    expect(attempts.every(hit=>hit.url.startsWith("https://s3.us-east-005.backblazeb2.com/geomacro-private-archive/"))).toBe(true);
  });
  it("foreign/unapproved keys never reserve quota or reveal secret network credentials",async()=>{
    vi.stubEnv("GEOMACRO_CONTROL_PLANE_TOKEN","t".repeat(64));
    const hit=vi.fn();
    vi.stubGlobal("fetch",hit);
    expect(await reservePrivateB2Read("geomacro-evidence/v1/structural/serving/foreign.json.gz")).toBe(false);
    expect(await reservePrivateB2Read("../private")).toBe(false);
    expect(hit).not.toHaveBeenCalled();
    // New structural quota is for exact snapshot + proof keys only.
    expect([readKey,proofKey].every(s=>s.startsWith("geomacro-evidence/v1/structural/serving/"))).toBe(true);
  });
});
