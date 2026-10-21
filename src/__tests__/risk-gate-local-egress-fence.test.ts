import {describe,it,expect,vi,afterEach} from "vitest";
import {forwardRiskGateToD1} from "../routes/api.risk-gate";
afterEach(()=>vi.unstubAllEnvs());
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
 it('allows only an explicitly acknowledged development loopback D1 target',async()=>{
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('RISK_GATE_LOAD_TEST_ACK','STAGING_ONLY');
  const req=()=>new Request('http://127.0.0.1:3000/api/risk-gate',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  for(const origin of ['https://geomacro.live','http://localhost:3101','http://127.0.0.1:3101/path','']){
   vi.stubEnv('GEOMACRO_RISK_GATE_LOCAL_D1_ORIGIN',origin);const fetcher=vi.fn();
   expect((await forwardRiskGateToD1(req(),fetcher)).status).toBe(503);expect(fetcher).not.toHaveBeenCalled();
  }
  vi.stubEnv('GEOMACRO_RISK_GATE_LOCAL_D1_ORIGIN','http://127.0.0.1:3101');
  const fetcher=vi.fn(async(..._args:any[])=>Response.json({ok:true,execution_authorized:false,risk_gate:{execution_authorized:false}}));
  expect((await forwardRiskGateToD1(req(),fetcher)).status).toBe(200);
  expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:3101/v1/partner/predge/risk-gate');
  vi.stubEnv('NODE_ENV','production');fetcher.mockClear();
  expect((await forwardRiskGateToD1(req(),fetcher)).status).toBe(503);expect(fetcher).not.toHaveBeenCalled();
 });
});
