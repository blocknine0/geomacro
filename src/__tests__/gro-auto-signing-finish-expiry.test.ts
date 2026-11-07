import {describe,it,expect} from "vitest";
import {finishSigningJob} from "../../scripts/lib/gro-auto-signing-jobs.mjs";

const now=Date.parse("2026-11-08T00:00:00.000Z");
const sourceSha="a".repeat(64);
const job={
 country_iso3:"USA",input_sha256:sourceSha,
 b2_key:"geomacro-evidence/v1/private/machine-gro-qualified/"+sourceSha+".json",
 expires_at:new Date(now+60_000).toISOString(),lease_token:"lease",
};
const published={
 ok:true,country_iso3:"USA",record_sha256:"b".repeat(64),
 gro_expires_at:new Date(now+2*3600_000).toISOString(),
 b2_archive_readback_verified:true,canonical_d1_hot_readback_verified:true,
 live_worker_signed_hot_verified:true,
};
const neverWrite={query:async()=>{throw Error("UNEXPECTED_D1_WRITE")}};

describe("protected signed GRO completion guard",()=>{
 it("rejects delayed signing after independent source proof expiry",async()=>{
  await expect(finishSigningJob(neverWrite,job,published,now+60_001))
   .rejects.toThrow("GRO_AUTO_SIGNING_PUBLICATION_UNVERIFIED");
 });
 it("rejects forged proof pin, missing actual hot readback and overlong TTL",async()=>{
  await expect(finishSigningJob(neverWrite,{...job,b2_key:"not-immutable"},published,now))
   .rejects.toThrow("GRO_AUTO_SIGNING_PUBLICATION_UNVERIFIED");
  await expect(finishSigningJob(neverWrite,job,{...published,live_worker_signed_hot_verified:false},now))
   .rejects.toThrow("GRO_AUTO_SIGNING_PUBLICATION_UNVERIFIED");
  await expect(finishSigningJob(neverWrite,job,{...published,
   gro_expires_at:new Date(now+4*3600_000).toISOString()},now))
   .rejects.toThrow("GRO_AUTO_SIGNING_PUBLICATION_UNVERIFIED");
 });
});
