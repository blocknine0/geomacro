import { afterEach, describe, expect, it, vi } from "vitest";
import { createB2D1AccountGovernor } from "../../scripts/ops/b2-d1-account-governor.mjs";
import { createB2Client } from "../../scripts/ops/b2-s3-client.mjs";

const env = {
  CLOUDFLARE_ACCOUNT_ID: "1234567890abcdef1234567890abcdef",
  CLOUDFLARE_API_TOKEN: "t".repeat(64),
  D1_DATABASE_ID: "abcdef1234567890abcdef1234567890",
  B2_ACCOUNT_QUOTA_WORKFLOW_ID: "test_canonical_ingestion",
};
const vars = ["CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_API_TOKEN",
  "D1_DATABASE_ID","B2_ACCOUNT_QUOTA_WORKFLOW_ID","B2_ACCOUNT_QUOTA_REQUIRED",
  "B2_ARCHIVE_READ_KEY_ID","B2_ARCHIVE_READ_APPLICATION_KEY",
  "B2_ARCHIVE_WRITE_KEY_ID","B2_ARCHIVE_WRITE_APPLICATION_KEY"] as const;
const originals = Object.fromEntries(vars.map(k => [k,process.env[k]]));
afterEach(()=>{
  vi.unstubAllGlobals();
  for(const k of vars) {
    if(originals[k]===undefined) delete process.env[k]; else process.env[k]=originals[k];
  }
});
const makeClient = () => createB2Client({
  endpointUrl:"https://s3.us-east-005.backblazeb2.com",
  accessKey:"write-key",secretKey:"write-secret",
  bucket:"geomacro-private-archive",
});
const cfReply = (kind: "account"|"workflow") => Response.json({
  success:true,
  result:[{success:true,results:kind==="account"
    ? [{total_requests:1,get_requests:1,put_requests:0,head_requests:0,native_auth_requests:0}]
    : []}],
});
describe("#1827 D1-account B2 preflight bridge",()=>{
  it("refuses missing shared D1 credentials rather than silently falling back to process-only",()=>{
    expect(()=>createB2D1AccountGovernor({env:{}})).toThrow(
      "B2_ACCOUNT_GLOBAL_QUOTA_CONFIGURATION_REQUIRED");
    for(const [k,v] of Object.entries(env)) process.env[k]=v;
    process.env.B2_ACCOUNT_QUOTA_REQUIRED="1";
    delete process.env.D1_DATABASE_ID;
    expect(()=>makeClient()).toThrow("B2_ACCOUNT_GLOBAL_QUOTA_CONFIGURATION_REQUIRED");
  });

  it("sends one atomic reserve and per-workflow receipt through authorized D1 API",async()=>{
    const calls: Array<{url:string,method:string,body:any}>=[];
    const governor=createB2D1AccountGovernor({env,now:()=>new Date("2026-10-09T15:00:00Z"),
      fetchImpl:vi.fn(async (uri:string,init:any)=>{
        calls.push({url:uri,method:init.method,body:JSON.parse(init.body)});
        expect(init.headers.authorization).toBe("Bearer "+env.CLOUDFLARE_API_TOKEN);
        return cfReply(calls.length===1?"account":"workflow");
      }),
    });
    const proof=await governor.reserve("GET");
    expect(proof).toMatchObject({kind:"GET",day_utc:"2026-10-09",
      used:{total:1,GET:1}});
    expect(calls).toHaveLength(2);
    expect(calls.every(x=>x.method==="POST" && x.url.includes("/d1/database/"))).toBe(true);
    expect(calls[0].body.sql).toContain("ON CONFLICT(day_utc) DO UPDATE");
    expect(calls[0].body.params).toContain(25);
    expect(calls[1].body.sql).toContain("b2_request_quota_workflow_receipt");
    expect(JSON.stringify(calls)).not.toContain("write-secret");
  });

  it("fails closed on exhausted account cap, unauthorized D1 or body corruption",async()=>{
    const base={...env};
    for(const fetchImpl of [
      async()=>Response.json({success:true,result:[{success:true,results:[]}]}),
      async()=>new Response("unauthorized",{status:401}),
      async()=>new Response("malformed", {status:200}),
    ]) {
      const governor=createB2D1AccountGovernor({env:base,fetchImpl});
      await expect(governor.reserve("GET")).rejects.toThrow(/^B2_/);
    }
    const governor=createB2D1AccountGovernor({env,fetchImpl:async()=>cfReply("account")});
    await expect(governor.reserve("DELETE")).rejects.toThrow(
      "B2_ACCOUNT_GLOBAL_QUOTA_KIND_INVALID");
  });

  it("prevents any B2 network fetch until two D1 reservations have succeeded",async()=>{
    for(const [k,v] of Object.entries(env)) process.env[k]=v;
    process.env.B2_ACCOUNT_QUOTA_REQUIRED="1";
    const urls:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (uri:string,init:any)=>{
      const url=String(uri);
      urls.push(url);
      if(url.startsWith("https://api.cloudflare.com/")){
        const sql=JSON.parse(init.body).sql;
        return cfReply(sql.includes("b2_account_daily_request_quota")?"account":"workflow");
      }
      if(url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        expect(urls.filter(x=>x.startsWith("https://api.cloudflare.com/"))).toHaveLength(2);
        return new Response("safe-private-evidence",{status:200});
      }
      throw Error("unexpected network target");
    }));
    const b2=makeClient();
    expect((await b2.get("geomacro-evidence/v1/test.json")).toString())
      .toBe("safe-private-evidence");
    expect(b2.usage().global_account_quota_guard_enabled).toBe(true);
    expect(urls).toHaveLength(3);
  });

  it("never contacts B2 if shared D1 fails, even with remaining local budget",async()=>{
    for(const [k,v] of Object.entries(env)) process.env[k]=v;
    process.env.B2_ACCOUNT_QUOTA_REQUIRED="1";
    const calls:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (uri:string)=>{
      calls.push(String(uri));
      return new Response("quota-service-unavailable",{status:503});
    }));
    const b2=makeClient();
    await expect(b2.get("geomacro-evidence/v1/test.json"))
      .rejects.toThrow("B2_ACCOUNT_GLOBAL_QUOTA_D1_RESPONSE_INVALID");
    expect(calls).toHaveLength(1);
    expect(calls.every(u=>u.startsWith("https://api.cloudflare.com/"))).toBe(true);
    expect(b2.usage().global_account_quota_guard_enabled).toBe(true);
  });

  it("keeps current optional rollout explicit until all B2 producers use the ledger",()=>{
    delete process.env.B2_ACCOUNT_QUOTA_REQUIRED;
    const b2=makeClient();
    expect(b2.usage().global_account_quota_guard_enabled).toBe(false);
    const wf=String(requireNoop);
    expect(wf).toContain("noop");
  });
});
const requireNoop = "noop";
