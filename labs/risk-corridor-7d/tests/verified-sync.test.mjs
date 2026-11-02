import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {COUNTRIES_195} from "../src/countries-195.mjs";
import {batchForTime,syncReadiness,syncVerifiedSignals} from "../src/sync-verified.mjs";
import {verifySignedGro,deriveSignalsFromSignedGro} from "../src/verified-gro.mjs";
import {canonical,sha256} from "../src/crypto.mjs";
import {readCountryGroB2} from "../src/b2-readonly.mjs";
import worker from "../src/worker.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const keys=await crypto.subtle.generateKey("Ed25519",true,["sign","verify"]);
const spki=Buffer.from(await crypto.subtle.exportKey("spki",keys.publicKey)).toString("base64");
const trust={"test-fixture-key":{spki,status:"active"}};
const NOW=new Date("2026-11-02T12:00:00.000Z");
async function fixture(iso3="IND",driver="conflict"){
  const unsigned={
    schema_version:"gro-1.1",issuer:"Geomacro",object_id:"fixture_gro_"+iso3,
    subject:{type:"country",id:iso3,name:iso3},
    generated_at:"2026-11-02T11:58:00.000Z",expires_at:"2026-11-02T14:58:00.000Z",
    verification:{status:"VERIFIED",reason_codes:[],last_verified_at:"2026-11-02T11:58:00.000Z"},
    commercial_eligibility:{status:"VERIFIED",reason_codes:[]},
    risk:{score:55,label:"WATCH",previous_score:null,delta:null,direction:"unknown"},
    confidence:0.92,attribution:[{driver,score_contribution:22,delta_contribution:null,event_count:2,weight:1}],
    evidence:[{event_id:"fixture-1",title:"fixture-only"}],
    evidence_summary:{independent_source_count:2,event_count:2,evidence_count:2},
    integrity:{payload_hash:null,signature:null,signing_key_id:"test-fixture-key",
      signature_scheme:"Ed25519",canonicalization:"geomacro-canonical-json-v1"}
  };
  const text=canonical(unsigned);
  const payloadHash=await sha256(text);
  const signature=Buffer.from(await crypto.subtle.sign("Ed25519",keys.privateKey,new TextEncoder().encode(text))).toString("base64");
  return {...unsigned,integrity:{...unsigned.integrity,payload_hash:payloadHash,signature}};
}
function env(overrides={}){
 return {RC_SYNC_ENABLED:"1",RC_STAGING_D1:{prepare:()=>({bind:()=>({first:async()=>({slot_start:"slot"}),
   run:async()=>({success:true})})})},
 RC_SUPABASE_URL:"https://ymjuwuvbialsevfawvvq.supabase.co",
 RC_SUPABASE_SERVICE_KEY:"s".repeat(40),
 RC_B2_READ_KEY_ID:"readonly-staging-key",
 RC_B2_READ_APPLICATION_KEY:"k".repeat(36),...overrides};
}
test("uses canonical 195 unique countries, 20 per schedule and bounded full sweep",()=>{
 assert.equal(COUNTRIES_195.length,195);assert.equal(new Set(COUNTRIES_195).size,195);
 const base=Date.parse("2026-11-02T00:00:00.000Z");
 const indices=new Map();
 for(let i=0;i<10;i++){const b=batchForTime(new Date(base+i*900000));indices.set(b.index,b.countries);}
 assert.equal(indices.size,10);
 assert.deepEqual([...indices.values()].flat().sort(),[...COUNTRIES_195].sort());
 assert.equal(Math.max(...[...indices.values()].map(c=>c.length)),20);
});
test("rejects unsigned, expired, tampered, mismatched country and noncommercial GRO",async()=>{
 const signed=await fixture();
 const pass=await verifySignedGro(signed,{iso3:"IND",now:NOW,keys:trust});
 assert.equal(pass.valid,true);
 assert.equal((await verifySignedGro({...signed,risk:{...signed.risk,score:1}},{iso3:"IND",now:NOW,keys:trust})).valid,false);
 assert.equal((await verifySignedGro(signed,{iso3:"USA",now:NOW,keys:trust})).valid,false);
 assert.equal((await verifySignedGro(signed,{iso3:"IND",now:new Date("2026-11-03T00:00:00Z"),keys:trust})).valid,false);
 assert.equal((await verifySignedGro({...signed,commercial_eligibility:{status:"UNVERIFIED"}},{iso3:"IND",now:NOW,keys:trust})).valid,false);
 assert.equal((await verifySignedGro({...signed,integrity:{...signed.integrity,signature:null}},{iso3:"IND",now:NOW,keys:trust})).valid,false);
});
test("verified GRO drivers map to only evidenced domain without raw title/publisher",async()=>{
 const signed=await fixture("IND","rare_earth_supply");
 const qualified=await verifySignedGro(signed,{iso3:"IND",now:NOW,keys:trust});
 const derived=await deriveSignalsFromSignedGro(signed,"IND",qualified,NOW);
 assert.equal(derived.length,1);assert.equal(derived[0].domain,"critical_minerals");
 assert.equal(derived[0].signal_kind,"gro_driver_rare_earth_supply");
 assert.equal(derived[0].intensity,22);
 assert.equal(derived[0].title,undefined);assert.equal(derived[0].source_url,undefined);
 assert.equal(derived[0].verified_gro_sha256,signed.integrity.payload_hash);
});
test("no keys, invalid URL or feature disabled means never ingest",async()=>{
 assert.equal((await syncVerifiedSignals(env({RC_SYNC_ENABLED:"0"}),NOW)).code,"SYNC_DISABLED");
 assert.equal((await syncVerifiedSignals(env({RC_SUPABASE_URL:"https://old.supabase.co"}),NOW)).code,"STAGING_SECRETS_OR_BINDINGS_MISSING");
 await assert.rejects(readCountryGroB2("IND",{}),/B2_READONLY_CREDENTIAL_MISSING/);
});
test("scheduled bounded run reads only verified GRO, writes derived metadata and records status",async()=>{
 let rows=0,claims=0,updates=0,reads=0;
 const db={prepare(sql){return {bind(...args){return {
   async first(){if(sql.startsWith("INSERT")){claims++;return {slot_start:args[0]};}throw Error("UNEXPECTED_SQL");},
   async run(){if(sql.startsWith("UPDATE"))updates++;return {success:true};}
 };}};}};
 const result=await syncVerifiedSignals(env({RC_STAGING_D1:db}),NOW,{
   loadKeys:async()=>trust,
   readGro:async iso=>{reads++;return iso===batchForTime(NOW).countries[0]?await fixture(iso):null;},
   createBuffer:()=>({putVerifiedSignal:async data=>{rows++;assert.equal(data.verification_status,"VERIFIED");}})
 });
 assert.equal(result.ok,true);assert.equal(result.attempted,batchForTime(NOW).countries.length);
 assert.equal(result.signals_written,1);assert.equal(rows,1);
 assert.equal(claims,1);assert.equal(updates,1);assert.equal(reads,result.attempted);
});
test("no source, no recipient, no money; Worker HTTP remains closed",async()=>{
 const wrangler=JSON.parse(readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8"));
 assert.deepEqual(wrangler.triggers.crons,["*/15 * * * *"]);
 assert.equal(wrangler.vars.RC_SYNC_ENABLED,"0");
 assert.equal(wrangler.d1_databases[0].binding,"RC_STAGING_D1");
 const r=await worker.fetch(new Request("https://staging.example/pay"),env());
 assert.equal(r.status,503);
 assert.equal((await r.json()).payment_active,false);
});
