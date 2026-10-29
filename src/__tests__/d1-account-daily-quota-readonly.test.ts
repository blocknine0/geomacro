import {describe,it,expect,vi} from "vitest";
import {assessD1AccountFreeQuota,readCloudflareD1AccountQuota} from "../../scripts/ops/audit-d1-account-daily-quota-readonly.mjs";
import {checkD1BundledWork} from "../../scripts/ops/plan-d1-bundled-work.mjs";
const today="2026-10-11";
const mk=(read:number,write:number)=>({data:{viewer:{accounts:[{
 d1AnalyticsAdaptiveGroups:[{dimensions:{databaseId:"a".repeat(32),date:today},sum:{rowsRead:read,rowsWritten:write}}]
}]}}});
describe("#1827 actual D1 account-wide before-source-recovery quota audit",()=>{
 it("totals account-wide multiple databases and reserves headroom",()=>{
  const x=mk(500_000,2_000);
  x.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups.push({
    dimensions:{databaseId:"b".repeat(32),date:today},sum:{rowsRead:2_000_000,rowsWritten:60_000}});
  const r=assessD1AccountFreeQuota(x,{day:today});
  expect(r.caution_headroom_met).toBe(true);
  expect(r.remaining_rows_read).toBe(2_500_000);
  expect(r.remaining_rows_written).toBe(38_000);
  expect(r.provider_graphql_usage_observed).toBe(true);
  expect(r.b2_provider_capacity_verified).toBe(false);
  expect(r.authorized_bulk_migration).toBe(false);
  expect(r.d1_writes).toBe(0);
 });
 it("holds near the D1 free row-write edge",()=>{
  const r=assessD1AccountFreeQuota(mk(2000,80_000),{day:today});
  expect(r.caution_headroom_met).toBe(false);
  expect(r.status).toBe("QUOTA_HELD_D1_HEADROOM_INSUFFICIENT");
 });
 it("rejects partial, future, duplicate, malformed, and GraphQL-error accounting",()=>{
  for(const value of [
    {errors:[{message:"restricted"}]},
    {data:{viewer:{accounts:[]}}},
    mk(-1,0),mk(1,NaN),mk(2,1.5),
  ])expect(()=>assessD1AccountFreeQuota(value,{day:today})).toThrow();
  const dupe=mk(10,1);dupe.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups.push(
    dupe.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups[0]);
  expect(()=>assessD1AccountFreeQuota(dupe,{day:today})).toThrow();
  const stale=mk(10,1);stale.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups[0].dimensions.date="2026-10-10";
  expect(()=>assessD1AccountFreeQuota(stale,{day:today})).toThrow();
 });
 it("only calls Cloudflare GraphQL read-only and never logs token or source records",async()=>{
  const fetchImpl=vi.fn(async(_u:string,opts:any)=>({
    ok:true,json:async()=>mk(100,5),
  }));
  const env={CLOUDFLARE_API_TOKEN:"x".repeat(24),CLOUDFLARE_ACCOUNT_ID:"a".repeat(32)};
  const r=await readCloudflareD1AccountQuota({env,fetchImpl,now:new Date("2026-10-11T12:00:00Z")});
  expect(r.remaining_rows_written).toBe(99_995);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url,opts]=fetchImpl.mock.calls[0];
  expect(url).toBe("https://api.cloudflare.com/client/v4/graphql");
  expect(opts.method).toBe("POST");
  expect(opts.redirect).toBe("error");
  expect(JSON.stringify(opts.body)).not.toContain(env.CLOUDFLARE_API_TOKEN);
  expect(JSON.stringify(r)).not.toContain(env.CLOUDFLARE_API_TOKEN);
 });
 it("bounded retries recover genuine transient Cloudflare 503 usage evidence without spending D1 rows",async()=>{
  const env={CLOUDFLARE_API_TOKEN:"x".repeat(24),CLOUDFLARE_ACCOUNT_ID:"a".repeat(32)};
  let calls=0;
  const fetchImpl=vi.fn(async()=>{
   calls++;
   if(calls===1)return {ok:false,status:503};
   return {ok:true,status:200,json:async()=>mk(100,5)};
  });
  const out=await checkD1BundledWork({env,fetchImpl,now:new Date(today+"T12:00:00Z")});
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(out.reason).not.toBe("D1_ACCOUNT_QUOTA_PROBE_FAILED");
  expect(out.d1_queries).toBe(0);
  expect(out.predge_request_governor_is_separate_and_unchanged).toBe(true);
 });
 it("never retries permanent Cloudflare auth failures or treats unknown as healthy",async()=>{
  const env={CLOUDFLARE_API_TOKEN:"x".repeat(24),CLOUDFLARE_ACCOUNT_ID:"a".repeat(32)};
  const fetchImpl=vi.fn(async()=>({ok:false,status:403}));
  const out=await checkD1BundledWork({env,fetchImpl,now:new Date(today+"T12:00:00Z")});
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(out.state).toBe("HELD");
  expect(out.critical).toBe(false);
  expect(out.source_intake).toBe(false);
  expect(out.reason).toBe("D1_ACCOUNT_QUOTA_PROBE_FAILED");
 });

});
