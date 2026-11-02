import test from "node:test";
import assert from "node:assert/strict";
import {sevenDayCutoff,requireDerivedSignal,createSevenDayBuffer} from "../src/supabase-buffer.mjs";
test("seven-day read-side cutoff",()=>{
 assert.equal(sevenDayCutoff(new Date("2026-11-02T12:00:00Z")),"2026-10-26T12:00:00.000Z");
});
test("buffer accepts derived proofs only, without raw third-party data",()=>{
 const signal={event_sha256:"a".repeat(64),verified_gro_sha256:"b".repeat(64),
   country_iso3:"IND",domain:"critical_minerals",signal_kind:"export_control",intensity:80,
   verification_status:"VERIFIED",original_at:"2026-11-01T12:00:00Z",
   title:"raw publisher title",source_url:"https://publisher.example/private"};
 const out=requireDerivedSignal(signal,new Date("2026-11-02T00:00:00Z"));
 assert.equal(out.title,undefined);assert.equal(out.source_url,undefined);
 assert.throws(()=>requireDerivedSignal({...signal,verification_status:"UNVERIFIED"},new Date("2026-11-02T00:00:00Z")));
});
test("missed cron still cannot make expired rows visible",async()=>{
 const fetchImpl=async()=>new Response(JSON.stringify([
   {event_sha256:"expired",ingested_at:"2026-10-24T10:00:00Z"},
   {event_sha256:"valid",ingested_at:"2026-11-02T10:00:00Z"}]),{status:200});
 const buffer=createSevenDayBuffer({url:"https://ymjuwuvbialsevfawvvq.supabase.co",
  serviceKey:"x".repeat(40),now:()=>new Date("2026-11-02T12:00:00Z"),fetchImpl});
 assert.deepEqual((await buffer.listRecentSignals("IND","geopolitics")).map(x=>x.event_sha256),["valid"]);
});
test("only dedicated Risk/Corridor Supabase project can be configured",()=>{
 assert.throws(()=>createSevenDayBuffer({url:"https://unrelated-project.supabase.co",
  serviceKey:"x".repeat(40)}));
 assert.throws(()=>createSevenDayBuffer({url:"https://ldpwajisioljyjtojvfx.supabase.co",
  serviceKey:"x".repeat(40)}));
});

test("Supabase new secret key is sent via apikey only, never as a JWT bearer",async()=>{
 let headers;
 const key="sb_secret_"+"x".repeat(40);
 const fetchImpl=async(_url,options)=>{
   headers=new Headers(options.headers);
   return new Response("",{status:201});
 };
 const buffer=createSevenDayBuffer({url:"https://ymjuwuvbialsevfawvvq.supabase.co",
   serviceKey:key,fetchImpl,now:()=>new Date("2026-11-02T12:00:00Z")});
 await buffer.putVerifiedSignal({
   event_sha256:"a".repeat(64),verified_gro_sha256:"b".repeat(64),
   country_iso3:"IND",domain:"geopolitics",signal_kind:"gro_driver_conflict",
   intensity:30,verification_status:"VERIFIED",original_at:"2026-11-02T10:00:00Z"
 });
 assert.equal(headers.get("apikey"),key);
 assert.equal(headers.has("authorization"),false);
});
