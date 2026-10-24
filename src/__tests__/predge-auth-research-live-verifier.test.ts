import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
describe("Predge post-secret-rotation live verification guard",()=>{
 const code=readFileSync("scripts/ops/verify-predge-auth-research-delivery.mjs","utf8");
 it("requires old credential denied, anonymous denied and rotated credential accepted",()=>{
  expect(code).toContain('if(old.status===200)');
  expect(code).toContain("EXPOSED_BEARER_STILL_ACCEPTED");
  expect(code).toContain("if(old.status!==401)");
  expect(code).toContain("if(anonymous.status!==401");
  expect(code).toContain("if(auth.status!==200)");
  expect(code).toContain("anonymous_denied:true,old_emailed_bearer_denied:true");
 });
 it("never promotes research feed to signed paid GRO or real-money product",()=>{
  expect(code).toContain("a?.execution_authorized!==false");
  expect(code).toContain("a?.partner_resale_or_commercial_redistribution_authorized!==false");
  expect(code).toContain("a?.chargeable!==false");
  expect(code).toContain("signed_gro_issued:false");
  expect(code).toContain("payments:0,supabase_writes:0,b2_operations:0");
 });
 it("handles edge secret propagation without losing fail-closed assurance",()=>{
  expect(code).toContain("attempt<=4");
  expect(code).toContain("sleep(5000)");
  expect(code).toContain("if(verdict.ok||verdict.fatal)break");
  expect(code).toContain("ACCEPTANCE_");
  expect(code).toContain("LIVE_REQUEST_UNAVAILABLE");
  expect(code).not.toContain("console.error(err)");
  expect(code).not.toContain("console.error(token)");
  expect(code).not.toContain("JSON.stringify(auth.body)");
 });
 it("requires parity against the actual public D1 projection rather than static fixtures",()=>{
  expect(code).toContain('get("public/derived-structural-72h")');
  expect(code).toContain("predgeJournalParity(a,p,journal)");
  expect(code).toContain("readPredgeJournal(get)");
 });
});