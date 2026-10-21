import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {decideGriHistoryQuotaAdmission,readGriHistoryQuotaAdmission} from "../../scripts/ops/preflight-gri-historical-shared-quota.mjs";
const now=new Date("2026-10-18T12:00:00.000Z");
const row=(d:Record<string,unknown>={})=>({day_utc:"2026-10-18",total_requests:22,get_requests:7,put_requests:10,head_requests:3,native_auth_requests:2,...d});
const env={B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"historical_gri_version_recovery",B2_REQUEST_BUDGET:"4",CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),D1_DATABASE_ID:"db057ca9-9f6e-4957-ac28-144f3b798f9b",CLOUDFLARE_API_TOKEN:"synthetic_test_only"};
describe("quota-aware genuine immutable historical GRI retry",()=>{
 it("budgets one native auth and three B2 reads without claiming historical proof",()=>{
  const x=decideGriHistoryQuotaAdmission({rows:[row()],now});
  expect(x.quota_allows_attempt).toBe(true);
  expect(x.reserved_attempts_max).toBe(4);
  expect(x.restored_historical_version).toBe(false);
  expect(x.immutable_lineage_verified).toBe(false);
  expect(x.current_scored_gri_verified).toBe(false);
  expect(x.b2_requests+x.d1_writes+x.payments).toBe(0);
 });
 it("holds for native/GET/total quota exhaustion without spending",()=>{
  for(const d of [{get_requests:44,total_requests:59},{native_auth_requests:10,total_requests:30},{total_requests:99,get_requests:34,put_requests:50,head_requests:10,native_auth_requests:5}]){
   const x=decideGriHistoryQuotaAdmission({rows:[row(d)],now});
   expect(x.status).toBe("SHARED_B2_QUOTA_HELD");
   expect(x.quota_allows_attempt).toBe(false);
   expect(x.b2_requests).toBe(0);
  }
 });
 it("accepts a truly empty day and rejects malformed/adulterated reservations",()=>{
  expect(decideGriHistoryQuotaAdmission({rows:[],now}).quota_allows_attempt).toBe(true);
  for(const bad of [[row({day_utc:"2026-10-17"})],[row({total_requests:21})],[row({get_requests:46,total_requests:61})],[row({extra:"invalid"})],[row(),row()],null]){
   expect(()=>decideGriHistoryQuotaAdmission({rows:bad,now})).toThrow();
  }
 });
 it("queries one authorized Cloudflare D1 quota row with bound UTC date, no B2 request",async()=>{
  const f=vi.fn(async (url:string,opts:any)=>{
   expect(url).toContain("/d1/database/");
   expect(opts.method).toBe("POST");
   expect(opts.redirect).toBe("error");
   expect(JSON.parse(opts.body).params).toEqual(["2026-10-18"]);
   return Response.json({success:true,result:[{success:true,results:[row()]}]});
  });
  const result=await readGriHistoryQuotaAdmission({env,now,fetchImpl:f});
  expect(result.quota_allows_attempt).toBe(true);
  expect(f).toHaveBeenCalledOnce();
 });
 it("rejects forbidden funds, wrong D1 credentials, malformed D1 receipts",async()=>{
  const f=vi.fn();
  await expect(readGriHistoryQuotaAdmission({env:{...env,D1_DATABASE_ID:"bad"},now,fetchImpl:f})).rejects.toThrow();
  await expect(readGriHistoryQuotaAdmission({env:{...env,COINBASE_X402_MAINNET_ACK:"YES"},now,fetchImpl:f})).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
  for(const res of [Response.json({success:false,result:[]}),Response.json({success:true,result:[{success:true,results:[row(),row()]}]}),new Response("deny",{status:403})]){
   await expect(readGriHistoryQuotaAdmission({env,now,fetchImpl:vi.fn(async()=>res)})).rejects.toThrow();
  }
 });
 it("protects scheduled retry, quota gate, and no-funds inputs",()=>{
  const y=readFileSync(".github/workflows/gri-pinned-version-recovery.yml","utf8");
  expect(y).toContain('cron: "17 0 * * *"');
  expect(y).toContain("id: gri_history_quota");
  expect(y).toContain("node scripts/ops/preflight-gri-historical-shared-quota.mjs");
  expect(y).toContain("steps.gri_history_quota.outputs.ready == 'true'");
  expect(y).toContain("GRI_HISTORY_SHARED_QUOTA_HELD_NO_B2_READBACK");
  expect(y).toContain("GEOMACRO_GRI_RESTORE_WEBSITE_HISTORY");
  expect(y).not.toContain("COINBASE_API_KEY: "+String.fromCharCode(36)+"{{ secrets.");
 });
});
