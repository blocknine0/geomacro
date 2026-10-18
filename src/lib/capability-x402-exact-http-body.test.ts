import {it,expect} from "vitest";
import {freezeCanonicalCapabilityHttpBody as freeze,sendFrozenCapabilityHttpBody as send} from "./capability-x402-exact-http-body.server";
it("sends exactly canonical UTF-8 bytes and binds the authenticated ledger hash",async()=>{
  const input={z:"বাংলা",a:{why:"Derived output"}};
  const body=freeze(input);input.a.why="changed after quote";
  const response=send(body,body.sha256,{"PAYMENT-RESPONSE":"test-receipt"});
  expect(await response.text()).toBe(body.body);
  expect(body.body).not.toContain("changed after quote");
  expect(response.headers.get("X-Geomacro-Delivery-SHA256")).toBe(body.sha256);
  expect(()=>send(body,"f".repeat(64),{})).toThrow("X402_FINAL_HTTP_LEDGER_BODY_HASH_MISMATCH");
  expect(()=>send({...body,body:body.body+" "},body.sha256,{})).toThrow("X402_FINAL_HTTP_LEDGER_BODY_HASH_MISMATCH");
});
it("rejects values that JSON could coerce or omit, cycles, excessive depth and oversized bytes",()=>{
  const cyclic:any={};cyclic.self=cyclic;
  let deep:any={};for(let i=0;i<65;i++)deep={deep};
  for(const bad of [null,[],{value:NaN},{value:Infinity},{value:undefined},{value:1n},{value:()=>1},{value:Symbol()}, {value:new Date()}, {value:new Array(2)},cyclic,deep])
    expect(()=>freeze(bad)).toThrow();
  expect(()=>freeze({value:"a".repeat(96*1024)})).toThrow("X402_FINAL_HTTP_BODY_SIZE_INVALID");
});
