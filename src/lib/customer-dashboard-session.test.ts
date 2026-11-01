import {describe,expect,it,vi} from "vitest";
import {customerDashboardAccess,revokeCustomerSession} from "./customer-dashboard-session";

describe("Customer dashboard authentication-dependent controls",()=>{
 it("shows sign out only for verified accounts, never for logged-out or anonymous users",()=>{
  expect(customerDashboardAccess(true,false,false)).toBe("authenticated");
  expect(customerDashboardAccess(false,false,false)).toBe("anonymous");
  expect(customerDashboardAccess(true,false,true)).toBe("anonymous");
  expect(customerDashboardAccess(true,true,false)).toBe("checking");
  expect(customerDashboardAccess(false,true,false)).toBe("checking");
 });
});

describe("Server-confirmed customer logout",()=>{
 const fetchOptions={method:"DELETE",credentials:"same-origin",cache:"no-store"};
 it("accepts only server-confirmed JSON logout response",async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({ok:true}));
  await expect(revokeCustomerSession(fetcher)).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/v1/customer/auth",fetchOptions);
 });
 it("does not mark HTTP 401 and 403 responses as successful logout",async()=>{
  for(const status of [401,403]){
   const fetcher=vi.fn().mockResolvedValue(Response.json({ok:false,code:"CUSTOMER_SESSION_REQUIRED"},{status}));
   await expect(revokeCustomerSession(fetcher)).rejects.toThrow("CUSTOMER_SESSION_REQUIRED");
  }
 });
 it("fails closed when the Worker or SSR gateway is unavailable",async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({ok:false,code:"CUSTOMER_D1_UNAVAILABLE"},{status:503}));
  await expect(revokeCustomerSession(fetcher)).rejects.toThrow("CUSTOMER_D1_UNAVAILABLE");
 });
 it("rejects malformed or ambiguous 2xx responses instead of falsely showing signed out",async()=>{
  const malformed=vi.fn().mockResolvedValue(new Response("<html>error</html>",{status:200}));
  await expect(revokeCustomerSession(malformed)).rejects.toThrow("CUSTOMER_LOGOUT_NOT_CONFIRMED");
  const missingOk=vi.fn().mockResolvedValue(Response.json({success:true},{status:200}));
  await expect(revokeCustomerSession(missingOk)).rejects.toThrow("CUSTOMER_LOGOUT_NOT_CONFIRMED");
  const explicitFalse=vi.fn().mockResolvedValue(Response.json({ok:false},{status:200}));
  await expect(revokeCustomerSession(explicitFalse)).rejects.toThrow("CUSTOMER_LOGOUT_NOT_CONFIRMED");
 });
 it("leaves session outcome unconfirmed on network failure",async()=>{
  const fetcher=vi.fn().mockRejectedValue(new Error("network unavailable"));
  await expect(revokeCustomerSession(fetcher)).rejects.toThrow("network unavailable");
 });
});
