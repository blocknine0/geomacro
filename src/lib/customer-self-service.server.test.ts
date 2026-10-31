import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {authenticatedCustomer,customerSessionCookie,clearCustomerCookie,
 rejectCrossOrigin,CustomerError} from "./customer-auth.server";

describe("customer session fail-closed gate",()=>{
 it("rejects anonymous session before touching the customer database",async()=>{
  await expect(authenticatedCustomer(new Request("https://geomacro.live/api/v1/customer/account")))
   .rejects.toMatchObject({status:401,code:"CUSTOMER_SESSION_REQUIRED"});
 });
 it("rejects mutation without a pinned same-origin browser request",()=>{
  const request=new Request("https://geomacro.live/api/v1/customer/keys",
    {method:"POST",headers:{origin:"https://attacker.example"}});
  expect(()=>rejectCrossOrigin(request)).toThrow(CustomerError);
  expect(()=>rejectCrossOrigin(new Request("https://geomacro.live/api/v1/customer/keys",
    {method:"POST",headers:{origin:"https://geomacro.live.attacker.test"}}))).toThrow();
  expect(()=>rejectCrossOrigin(new Request("https://geomacro.live/api/v1/customer/keys",
    {method:"POST",headers:{origin:"https://geomacro.live"}}))).not.toThrow();
 });
 it("uses Secure HttpOnly host-only SameSite session; clears on signout",()=>{
  const request=new Request("https://geomacro.live/api/v1/customer/auth");
  const header=customerSessionCookie("signed-token",request,7200);
  expect(header).toContain("__Host-gm_customer=");
  expect(header).toContain("HttpOnly");
  expect(header).toContain("SameSite=Strict");
  expect(header).toContain("Secure");
  expect(header).toContain("Max-Age=3600");
  expect(header).not.toContain("Domain=");
  expect(clearCustomerCookie(request)).toContain("Max-Age=0");
 });
});

describe("verified customer API-key ledger safeguards",()=>{
 it("only exposes service-role callable, owner-scoped and payment-funded RPCs",()=>{
  const sql=readFileSync("supabase/migrations/9999999902_paid_customer_self_service.sql","utf8");
  for(const s of ["p_auth_user_id uuid","principal_type='api_client'",
   "source_type='payment_provider'","included_credits>credits_used",
   "if v_count>=3","KEY_CREATION_COOLDOWN","revoke_paid_customer_api_key",
   "to service_role"])expect(sql).toContain(s);
  expect(sql).toContain("from public,anon,authenticated");
 });
});
