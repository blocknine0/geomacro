import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {
  freezeCanonicalCapabilityHttpBody,
  sendFrozenCapabilityHttpBody,
} from "./capability-x402-exact-http-body.server";

describe("exact x402 customer HTTP body bytes, no settlement",()=>{
  it("sends byte-identical canonical JSON that matches the immutable ledger SHA256",async()=>{
    const source={z:"Geomacro Finds",a:{variant:"focused",capability:"intelligence_query"},
      payment:{amount_atomic:"50000",network:"base",settlement_reference:null}};
    const frozen=freezeCanonicalCapabilityHttpBody(source);
    expect(frozen.body).toBe('{"a":{"capability":"intelligence_query","variant":"focused"},"payment":{"amount_atomic":"50000","network":"base","settlement_reference":null},"z":"Geomacro Finds"}');
    expect(frozen.sha256).toBe(createHash("sha256").update(frozen.body,"utf8").digest("hex"));
    source.z="Mutated after initial freeze";
    const response=sendFrozenCapabilityHttpBody(frozen,frozen.sha256,{"Access-Control-Allow-Origin":"*"});
    const wire=await response.text();
    expect(response.status).toBe(200);
    expect(wire).toBe(frozen.body);
    expect(response.headers.get("X-Geomacro-Delivery-SHA256")).toBe(
      createHash("sha256").update(wire,"utf8").digest("hex"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rejects mismatched final bytes or ledger commitment instead of returning HTTP 200",()=>{
    const frozen=freezeCanonicalCapabilityHttpBody({intelligence:"signed",payment:{quote_id:"q"}});
    expect(()=>sendFrozenCapabilityHttpBody(frozen,"0".repeat(64),{}))
      .toThrow("X402_FINAL_HTTP_LEDGER_BODY_HASH_MISMATCH");
    expect(()=>sendFrozenCapabilityHttpBody({...frozen,body:'{"tampered":true}'},frozen.sha256,{}))
      .toThrow("X402_FINAL_HTTP_LEDGER_BODY_HASH_MISMATCH");
    expect(()=>sendFrozenCapabilityHttpBody(frozen,"not-a-sha",{}))
      .toThrow("X402_FINAL_HTTP_LEDGER_BODY_HASH_MISMATCH");
  });

  it("refuses invalid/noncanonical payloads prior to settlement, including undefined members",()=>{
    expect(()=>freezeCanonicalCapabilityHttpBody({a:undefined})).toThrow(
      "X402_FINAL_HTTP_BODY_NOT_JSON");
    expect(()=>freezeCanonicalCapabilityHttpBody(["array-is-not-an-envelope"]))
      .toThrow("X402_FINAL_HTTP_BODY_INVALID");
    expect(()=>freezeCanonicalCapabilityHttpBody(null))
      .toThrow("X402_FINAL_HTTP_BODY_INVALID");
  });
});
