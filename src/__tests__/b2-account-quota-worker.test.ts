import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import worker from "../../workers/control-plane/src/index.mjs";
import {
  reserveB2AccountQuota, readB2AccountQuota, B2_DAILY_LIMITS,
  ATOMIC_B2_QUOTA_SQL,B2_PUBLIC_EDGE_GLOBAL_GET_CEILING,
  B2_APP_STRUCTURAL_SHARED_GET_CEILING,B2_APP_PRIVATE_METADATA_SHARED_GET_CEILING,
} from "../../workers/control-plane/src/b2-account-quota.mjs";

const TOKEN = "t".repeat(64);
const date = new Date("2026-10-09T15:00:00.000Z");
type Count = { total_requests: number, get_requests: number,
  put_requests: number, head_requests: number, native_auth_requests: number };
function fakeD1() {
  const counters = new Map<string, Count>();
  const byWorkflow = new Map<string, number>();
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first() {
              if (sql.includes("INSERT INTO b2_account_daily_request_quota")) {
                const day = String(params[0]);
                const kind = ["get_requests","put_requests","head_requests","native_auth_requests"];
                const increments = (params.slice(1,5) as number[]);
                const max = (params.slice(6,11) as number[]);
                const current = counters.get(day) ?? {
                  total_requests:0, get_requests:0, put_requests:0,
                  head_requests:0, native_auth_requests:0,
                };
                if (current.total_requests >= Number(max[0]) ||
                    kind.some((k,i)=>current[k as keyof Count]+increments[i] > Number(max[i+1])) ||
                    (Number(params[11])===1 &&
                     current.get_requests + increments[0] > Number(params[12]))) return null;
                const next = { ...current, total_requests: current.total_requests + 1 };
                kind.forEach((k,i)=> { next[k as keyof Count] += increments[i]; });
                counters.set(day,next);
                return { ...next };
              }
              if (sql.includes("SELECT total_requests,get_requests")) {
                return counters.get(String(params[0])) ?? null;
              }
              throw Error("unexpected D1 quota SELECT");
            },
            async run() {
              if (!sql.includes("b2_request_quota_workflow_receipt")) throw Error("unexpected write");
              const key = params.slice(0,3).join("|");
              byWorkflow.set(key,(byWorkflow.get(key)??0)+1);
              return {success:true};
            },
          };
        },
      };
    },
  };
  return {db,counters,byWorkflow};
}

describe("#1827 atomic cross-workflow daily B2 quota", () => {
  it("uses one server-owned bounded atomic UPSERT, not a read/update race", () => {
    const sql=readFileSync("workers/control-plane/migrations/0014_b2_account_daily_request_quota.sql","utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS b2_account_daily_request_quota");
    // A literal backslash-n in SQL is not whitespace; Wrangler remote fails.
    expect(sql.split(String.fromCharCode(92) + "n")).toHaveLength(1);
    expect(sql).toContain("PRIMARY KEY");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS b2_request_quota_workflow_receipt");
    expect(sql).toContain("version = 5");
    expect(ATOMIC_B2_QUOTA_SQL).toContain("ON CONFLICT(day_utc) DO UPDATE");
    expect(ATOMIC_B2_QUOTA_SQL).toContain("WHERE b2_account_daily_request_quota.total_requests < ?");
    expect(ATOMIC_B2_QUOTA_SQL).toContain("RETURNING total_requests");
    expect(ATOMIC_B2_QUOTA_SQL).not.toContain("DELETE");
    expect(ATOMIC_B2_QUOTA_SQL).toContain("b2_account_daily_request_quota.get_requests + excluded.get_requests <= ?");
    expect(B2_PUBLIC_EDGE_GLOBAL_GET_CEILING).toBe(10);
    expect(B2_APP_STRUCTURAL_SHARED_GET_CEILING).toBe(10);
    expect(B2_APP_PRIVATE_METADATA_SHARED_GET_CEILING).toBe(18);
    expect(B2_DAILY_LIMITS).toEqual({total:100,GET:45,PUT:55,HEAD:10,NATIVE_AUTH:10});
  });

  it("enforces a single account cap across 6 workflows under concurrent reservation", async () => {
    const {db,counters,byWorkflow}=fakeD1();
    const results = await Promise.all(Array.from({length:130},(_,i)=>
      reserveB2AccountQuota(db,{kind:"PUT",workflow_id:"archive_"+(i%6)},{now:date})));
    expect(results.filter(x=>x.ok)).toHaveLength(55);
    expect(results.filter(x=>!x.ok)).toHaveLength(75);
    expect(results.filter(x=>!x.ok).every(x=>x.error==="B2_GLOBAL_DAILY_QUOTA_EXHAUSTED")).toBe(true);
    expect(counters.get("2026-10-09")?.put_requests).toBe(55);
    expect(byWorkflow.size).toBe(6);
    expect(Array.from(byWorkflow.values()).reduce((a,b)=>a+b,0)).toBe(55);
  });

  it("separately enforces GET and total hard caps, and starts a new day with fresh tickets", async () => {
    const {db}=fakeD1();
    for (let i=0;i<45;i++) {
      expect((await reserveB2AccountQuota(db,{
        kind:"GET",workflow_id:"reader_one"},{now:date})).ok).toBe(true);
    }
    expect((await reserveB2AccountQuota(db,{kind:"GET",workflow_id:"reader_two"},{now:date})).ok)
      .toBe(false);
    for(let i=0;i<55;i++) {
      expect((await reserveB2AccountQuota(db,{kind:"PUT",workflow_id:"writer_one"},{now:date})).ok)
        .toBe(true);
    }
    expect((await reserveB2AccountQuota(db,{kind:"HEAD",workflow_id:"writer_two"},{now:date})).ok)
      .toBe(false);
    const status=await readB2AccountQuota(db,{now:date});
    expect(status.used).toEqual({total:100,GET:45,PUT:55,HEAD:0,NATIVE_AUTH:0});
    const next=await reserveB2AccountQuota(db,{kind:"GET",workflow_id:"reader_one"},
      {now:new Date("2026-10-10T00:00:01Z")});
    expect(next.ok).toBe(true);
    expect(next.day_utc).toBe("2026-10-10");
  });

  it("reserves at least 15 GET quota tickets for core producer/restore paths, not the public edge",async()=>{
    const {db,counters,byWorkflow}=fakeD1();
    const edge=await Promise.all(Array.from({length:25},()=>reserveB2AccountQuota(db,{
      kind:"GET",workflow_id:"intelligence_public_edge"},{now:date})));
    expect(edge.filter(x=>x.ok)).toHaveLength(10);
    expect(edge.filter(x=>!x.ok)).toHaveLength(15);
    expect(counters.get("2026-10-09")?.get_requests).toBe(10);
    const important=await Promise.all(Array.from({length:15},(_,i)=>reserveB2AccountQuota(db,{
      kind:"GET",workflow_id:"restricted_private_scoring"},{now:date})));
    expect(important.every(x=>x.ok)).toBe(true);
    expect(counters.get("2026-10-09")?.get_requests).toBe(25);
    expect(byWorkflow.get("2026-10-09|intelligence_public_edge|GET")).toBe(10);
    expect(byWorkflow.get("2026-10-09|restricted_private_scoring|GET")).toBe(15);
    expect((await reserveB2AccountQuota(db,{
      kind:"GET",workflow_id:"intelligence_public_edge"},{now:new Date("2026-10-10T00:00:02Z")})).ok).toBe(true);
  });

  it("atomically protects 15 B2 GETs against ALL three shared public edges on same day",async()=>{
    const {db,counters,byWorkflow}=fakeD1();
    const ids=["intelligence_public_edge","global_risk_public_edge","risk_indices_public_edge"];
    const publicAttempts=await Promise.all(Array.from({length:35},(_,i)=>
      reserveB2AccountQuota(db,{kind:"GET",workflow_id:ids[i%ids.length]},{now:date})));
    expect(publicAttempts.filter(x=>x.ok)).toHaveLength(10);
    expect(publicAttempts.filter(x=>!x.ok)).toHaveLength(25);
    expect(counters.get("2026-10-09")?.get_requests).toBe(10);
    expect(ids.reduce((s,id)=>s+(byWorkflow.get(`2026-10-09|${id}|GET`)??0),0)).toBe(10);
    const producer=await Promise.all(Array.from({length:15},()=>
      reserveB2AccountQuota(db,{kind:"GET",workflow_id:"restricted_private_scoring"},{now:date})));
    expect(producer.every(x=>x.ok)).toBe(true);
    for (const id of ids) {
      const denied=await reserveB2AccountQuota(db,{kind:"GET",workflow_id:id},{now:date});
      expect(denied.ok).toBe(false);
      expect(denied.reserved).toBe(false);
    }
    expect(counters.get("2026-10-09")?.get_requests).toBe(25);
    expect(byWorkflow.get("2026-10-09|restricted_private_scoring|GET")).toBe(15);
  });

  it("protects historical/signed recovery GET budget from structural app fallback storms",async()=>{
    const {db,counters,byWorkflow}=fakeD1();
    const structural=await Promise.all(Array.from({length:30},()=>reserveB2AccountQuota(db,{
      kind:"GET",workflow_id:"app_private_structural_serving"},{now:date})));
    expect(structural.filter(x=>x.ok)).toHaveLength(10);
    expect(structural.filter(x=>!x.ok)).toHaveLength(20);
    expect(counters.get("2026-10-09")?.get_requests).toBe(10);
    // A historical original-version recovery still has its bounded 3 GETs.
    const historical=await Promise.all(Array.from({length:3},()=>reserveB2AccountQuota(db,{
      kind:"GET",workflow_id:"historical_gri_version_recovery"},{now:date})));
    expect(historical.every(x=>x.ok)).toBe(true);
    expect(byWorkflow.get("2026-10-09|historical_gri_version_recovery|GET")).toBe(3);
    // Other admitted producers retain the updated 45-GET HARD cap.
    const producer=await Promise.all(Array.from({length:40},()=>reserveB2AccountQuota(db,{
      kind:"GET",workflow_id:"gri_reviewed_current"},{now:date})));
    expect(producer.filter(x=>x.ok)).toHaveLength(32);
    expect(counters.get("2026-10-09")?.get_requests).toBe(45);
    expect((await reserveB2AccountQuota(db,{kind:"GET",
      workflow_id:"historical_gri_version_recovery"},{now:date})).ok).toBe(false);
  });

  it("caps fallback rights/status reads independently without weakening rights checks",async()=>{
    const {db,counters}=fakeD1();
    const get=async(workflow_id:string)=>reserveB2AccountQuota(db,{kind:"GET",workflow_id},{now:date});
    for(let i=0;i<18;i++)
      expect((await get(i%2?"app_private_source_status":"app_private_source_rights")).ok).toBe(true);
    expect((await get("app_private_source_rights")).ok).toBe(false);
    expect((await get("app_private_source_status")).ok).toBe(false);
    // Real signed publishing and historical recovery still get per-operation
    // tickets up to the guarded account hard ceiling, never without a ticket.
    for(let i=0;i<27;i++)expect((await get("historical_gri_version_recovery")).ok).toBe(true);
    expect(counters.get("2026-10-09")?.get_requests).toBe(45);
    expect((await get("historical_gri_version_recovery")).ok).toBe(false);
  });

  it("rejects untrusted identifiers, bogus counts, malformed clock and missing D1", async () => {
    const {db}=fakeD1();
    for (const body of [
      {kind:"get",workflow_id:"safe_reader"},
      {kind:"DELETE",workflow_id:"safe_reader"},
      {kind:"GET",workflow_id:"../archive"},
      {kind:"GET",workflow_id:"x"},
      {kind:"GET",workflow_id:"safe_reader",requests:900000},
    ]) {
      if (body.kind==="GET" && body.workflow_id==="safe_reader") {
        // A client-provided count is ignored: one ticket per request.
        const one=await reserveB2AccountQuota(db,body,{now:date});
        expect(one.used.total).toBe(1);
      } else {
        await expect(reserveB2AccountQuota(db,body,{now:date})).rejects.toThrow();
      }
    }
    await expect(reserveB2AccountQuota(null,{kind:"GET",workflow_id:"safe_reader"},{now:date}))
      .rejects.toThrow("B2_QUOTA_D1_UNAVAILABLE");
    await expect(readB2AccountQuota(db,{now:new Date("invalid")}))
      .rejects.toThrow("B2_QUOTA_CLOCK_INVALID");
  });

  it("keeps endpoint authenticated and refuses invalid method/body without reserving", async () => {
    const {db}=fakeD1();
    const make=(method:string,path:string,token:string|null,body?:object)=>new Request(
      "https://control.example"+path, {
        method,headers: {"content-type":"application/json", ...(token?{authorization:"Bearer "+token}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),
      });
    const env={DB:db,CONTROL_PLANE_TOKEN:TOKEN};
    expect((await worker.fetch(make("POST","/v1/b2-quota/reserve",null,
      {kind:"GET",workflow_id:"reader_one"}),env)).status).toBe(401);
    expect((await worker.fetch(make("POST","/v1/b2-quota/reserve",TOKEN,
      {kind:"DELETE",workflow_id:"reader_one"}),env)).status).toBe(400);
    const valid=await worker.fetch(make("POST","/v1/b2-quota/reserve",TOKEN,
      {kind:"GET",workflow_id:"reader_one"}),env);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ok:true, reserved:true,
      chargeable:false, public_published:false, b2_operation_performed:false});
    const status=await worker.fetch(make("GET","/v1/b2-quota/status",TOKEN),env);
    expect(status.status).toBe(200);
    expect((await status.json()).used.total).toBe(1);
    expect((await worker.fetch(make("GET","/v1/b2-quota/status",null),env)).status).toBe(401);
  });

  it("returns no B2 permission when workflow accounting fails after ticket reservation", async () => {
    const {db}=fakeD1();
    const original=db.prepare.bind(db);
    const broken={prepare(sql:string) {
      if(sql.includes("b2_request_quota_workflow_receipt")){
        return {bind(){return {run:async()=>{throw Error("D1 offline");}};}};
      }
      return original(sql);
    }};
    await expect(reserveB2AccountQuota(broken,{kind:"GET",workflow_id:"reader_one"},
      {now:date})).rejects.toThrow("D1 offline");
    expect((await readB2AccountQuota(db,{now:date})).used.total).toBe(1);
  });
});
