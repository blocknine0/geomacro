import {describe,it,expect,vi,afterEach} from "vitest";
import {authenticatedCustomer,customerSessionCookie,clearCustomerCookie,
 rejectCrossOrigin,CustomerError,callCustomerWorker,customerIngressHeaderProbe} from "./customer-auth.server";

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

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
 it("missing D1 configuration never falls back to retired customer auth",async()=>{
  vi.stubEnv("GEOMACRO_CUSTOMER_WORKER_URL","");
  vi.stubEnv("APP_SUPABASE_URL","https://retired.example.invalid");
  vi.stubEnv("APP_SUPABASE_ANON_KEY","retired-key");
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  await expect(authenticatedCustomer(new Request("https://geomacro.live/api/v1/customer/account",{headers:{cookie:"__Host-gm_customer="+"a".repeat(64)}})))
   .rejects.toMatchObject({code:"CUSTOMER_D1_NOT_CONFIGURED"});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("Worker failure remains a failure with no second database attempt",async()=>{
  vi.stubEnv("GEOMACRO_CUSTOMER_WORKER_URL","https://customer-worker.example.invalid");
  vi.stubEnv("GEOMACRO_CUSTOMER_SSR_TOKEN","dedicated-test-token-".repeat(5));
  const fetcher=vi.fn().mockResolvedValue(Response.json({ok:false,code:"CUSTOMER_D1_UNAVAILABLE"},{status:503}));vi.stubGlobal("fetch",fetcher);
  await expect(callCustomerWorker(new Request("https://geomacro.live/api/v1/customer/account"),"account",{session_token:"a".repeat(64)}))
   .rejects.toMatchObject({status:503,code:"CUSTOMER_D1_UNAVAILABLE"});
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0][0])).toBe("https://customer-worker.example.invalid/v1/internal/customer/account");
 });
 it("spoofable IP headers cannot activate OTP without trusted ingress configuration",async()=>{
  vi.stubEnv("GEOMACRO_CUSTOMER_WORKER_URL","https://customer-worker.example.invalid");
  vi.stubEnv("GEOMACRO_CUSTOMER_SSR_TOKEN","dedicated-test-token-".repeat(5));
  vi.stubEnv("GEOMACRO_CUSTOMER_TRUSTED_EDGE","");
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  await expect(callCustomerWorker(new Request("https://geomacro.live/api/v1/customer/auth",{headers:{"cf-connecting-ip":"192.0.2.1"}}),"otp-start",{email:"a@example.com"}))
   .rejects.toMatchObject({code:"CUSTOMER_TRUSTED_IP_REQUIRED"});
  expect(fetcher).not.toHaveBeenCalled();
 });
});

describe("customer IP ingress diagnostic (no funds, no PII)",()=>{
 it("detects an attacker-supplied CF IP header without disclosing client IP",()=>{
  const url="https://geomacro.live/api/v1/customer/auth?edge_probe=customer-ip-v1";
  const forged=customerIngressHeaderProbe(new Request(url,{headers:{"CF-Connecting-IP":"198.51.100.217"}}));
  expect(forged).toMatchObject({ok:true,
   schema:"geomacro.customer-ingress-header-probe.v1",
   cf_connecting_ip_present:true,injected_cf_connecting_ip_survived:true,
   no_email_or_payment_touched:true});
  const legitimate=customerIngressHeaderProbe(new Request(url,{headers:{"CF-Connecting-IP":"203.0.113.61"}}));
  expect(legitimate.cf_connecting_ip_present).toBe(true);
  expect(legitimate.injected_cf_connecting_ip_survived).toBe(false);
  expect(JSON.stringify(legitimate)).not.toContain("203.0.113.61");
  expect(JSON.stringify(forged)).not.toContain("198.51.100.217");
 });
 it("missing/malformed Cloudflare IP must never pass presence acceptance",()=>{
  const url="https://geomacro.live/api/v1/customer/auth?edge_probe=customer-ip-v1";
  for(const value of ["","fake-host","203.0.113.8,192.0.2.1","192.0.2.1;evil"]){
   const headers=value?{"CF-Connecting-IP":value}:{};
   expect(customerIngressHeaderProbe(new Request(url,{headers})).cf_connecting_ip_present).toBe(false);
  }
 });
});
