import {describe,it,expect} from "vitest";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {
  getPrivateLegacySourceDirectory,
  getPrivateLegacySourceDirectoryCoverage,
  validateDirectoryQuery,
} from "../../workers/control-plane/src/private-source-directory.mjs";
const sha=s=>createHash("sha256").update(s).digest("hex");
const meta=JSON.stringify({country_iso2:"US",government_portal_url:"https://example.invalid/country/us",
 verification_state:"DISCOVERED"});
function fakeDb(hash=sha(meta),data=meta,count=194){
 const calls=[];
 const DB={prepare(sql){calls.push(sql);return {
  bind(dataset,iso2){return {async first(){if(dataset!=="primary"||iso2!=="US")return null;
   return {dataset,country_iso2:iso2,source_row_json:data,
    source_row_sha256:hash,verification_state:"DISCOVERED"};}};},
  async all(){return {results:[
    {dataset:"primary",row_count:195},
    {dataset:"statistics",row_count:count},
    {dataset:"monetary",row_count:195},
    {dataset:"critical_minerals",row_count:195},
  ]};},
 };}};
 return {DB,calls};
}
describe("protected Supabase-free D1 official source directory lookup",()=>{
 it("rejects query injection, unknown dataset, duplicate keys, lower-case country",()=>{
  expect(validateDirectoryQuery(new URLSearchParams("dataset=primary&country_iso2=US"))).toEqual({dataset:"primary",iso2:"US"});
  for(const q of ["dataset=primary&country_iso2=us",
   "dataset=primary&country_iso2=US&country_iso2=GB",
   "dataset=primary&country_iso2=US&offset=3",
   "dataset=unknown&country_iso2=US",
   "dataset=primary&country_iso2=US%27%20OR%201=1",
   "dataset=primary"])expect(validateDirectoryQuery(new URLSearchParams(q))).toBeNull();
 });
 it("retrieves one matching record and verifies SHA256 while forbidding source activation",async()=>{
  const e=fakeDb();
  const r=await getPrivateLegacySourceDirectory(e,new URLSearchParams("dataset=primary&country_iso2=US"));
  expect(r.status).toBe(200);
  const d=await r.json();
  expect(d.source_directory_metadata.country_iso2).toBe("US");
  expect(d.metadata_sha256).toBe(sha(meta));
  expect(d.partner_output_authorized).toBe(false);
  expect(d.derivative_commercial_rights_approved).toBe(false);
  expect(d.original_live_retrieval_verified).toBe(false);
  expect(d.source_activated).toBe(false);
  expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(e.calls.every(x=>!x.includes("UPDATE")&&!x.includes("INSERT"))).toBe(true);
 });
 it("denies row hash corruption and wrong subject, never repairs/fabricates",async()=>{
  for(const e of [fakeDb("f".repeat(64)),fakeDb(sha(JSON.stringify({country_iso2:"GB"})),JSON.stringify({country_iso2:"GB"}))]){
   const r=await getPrivateLegacySourceDirectory(e,new URLSearchParams("dataset=primary&country_iso2=US"));
   expect(r.status).toBe(503);
   expect((await r.json()).error).toBe("SOURCE_DIRECTORY_INTEGRITY_UNAVAILABLE");
  }
 });
 it("does not synthesize the missing Vatican statistics source",async()=>{
  const r=await getPrivateLegacySourceDirectory(fakeDb(),new URLSearchParams("dataset=statistics&country_iso2=VA"));
  expect(r.status).toBe(404);
  expect((await r.json()).commercially_usable).toBe(false);
 });
 it("coverage 779 private metadata rows, never claims 195 fresh official sources",async()=>{
  const r=await getPrivateLegacySourceDirectoryCoverage(fakeDb(),new URLSearchParams());
  const j=await r.json();
  expect(r.status).toBe(200);
  expect(j.rows_verified_in_shadow).toBe(779);
  expect(j.status).toBe("PRIVATE_METADATA_COPIED_NOT_ACTIVATED");
  expect(j.commercial_rights_verified).toBe(false);
  expect(j.real_time_source_health_verified).toBe(false);
  const fail=await getPrivateLegacySourceDirectoryCoverage(fakeDb(sha(meta),meta,150),new URLSearchParams());
  expect(fail.status).toBe(503);
 });
 it("router enforces root authorization before private endpoint",()=>{
  const worker=readFileSync("workers/control-plane/src/index.mjs","utf8");
  const guard=worker.indexOf("const auth = authorized(request, env)");
  const privateCase=worker.indexOf('url.pathname==="/v1/internal/source-directory"');
  expect(guard).toBeGreaterThan(0);
  expect(privateCase).toBeGreaterThan(guard);
  expect(worker).not.toContain("/v1/public/source-directory?dataset=");
 });
});
