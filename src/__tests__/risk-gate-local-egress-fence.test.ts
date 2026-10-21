import {describe,it,expect,vi} from "vitest";
import {forwardRiskGateToD1} from "../routes/api.risk-gate";
describe("loopback Risk Gate cannot leak disposable credentials to production",()=>{
 it.each(["localhost","127.0.0.1","[::1]"])("blocks %s before any outgoing request",async host=>{
  const fetcher=vi.fn();
  const response=await forwardRiskGateToD1(new Request(`http://${host}:3000/api/risk-gate`,{
   method:"POST",headers:{"content-type":"application/json",authorization:"Bearer disposable-fixture"},
   body:JSON.stringify({synthetic_signed_object:true})}),fetcher);
  expect(response.status).toBe(503);
  expect((await response.json()).error).toBe("RISK_GATE_LOCAL_D1_FIXTURE_REQUIRED");
  expect(fetcher).not.toHaveBeenCalled();
 });
});
