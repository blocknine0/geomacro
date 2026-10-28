import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {publicGeomacroStructuredOutputCatalog} from "./capability-structured-output-contract";
import {paidMarketWatchLimitFor} from "./paid-market-watch";
import {assertLockedCapabilityDataBoundary} from "./capability-priced-data-boundary.server";

const json=(path:string)=>JSON.parse(readFileSync(path,"utf8"));

describe("nine paid SKU machine-readable schema and delivery acceptance",()=>{
  const adaptive=json("schemas/adaptive-intelligence-response-v1.schema.json");
  const market=json("schemas/paid-market-watch-v1.schema.json");
  const request=json("schemas/agent-query-v1.schema.json");
  it("pins the exact nested market-watch schema to the canonical adaptive response",()=>{
    expect(adaptive.properties.decision_intelligence.items.properties.market_watch.$ref)
      .toBe("#/$defs/paidMarketWatch");
    expect(adaptive.$defs.paidMarketWatch).toEqual({
      type:"object",additionalProperties:false,required:market.required,
      properties:market.properties,allOf:market.allOf,
    });
    expect(market.properties.items.items.properties.current_market_price.type).toBe("null");
    expect(market.properties.items.items.properties.predicted_direction.const).toBe("NOT_ESTABLISHED");
    expect(market.properties.limitations.properties.execution_authorized.const).toBe(false);
    expect(market.allOf).toHaveLength(2);
  });
  it("models genuine signed GRO attestation while leaving old frozen optional signature bytes compatible",()=>{
    const risk=adaptive.properties.signed_risk_objects.items.properties.object;
    expect(risk.required).toEqual(expect.arrayContaining([
      "risk_object_id","verification","integrity","delivery_boundary",
    ]));
    expect(risk.properties.integrity.required).toContain("payload_hash");
    expect(risk.properties.integrity.properties.signature.contentEncoding).toBe("base64");
    expect(risk.properties.integrity.properties.signature_scheme.const).toBe("Ed25519");
    expect(risk.properties.delivery_boundary.const).toBe("SIGNED_RISK_OBJECT_ATTESTATION_ONLY");
    expect(risk.properties.integrity.required).not.toContain("signature");
    const prep=readFileSync("src/lib/capability-x402-offer.server.ts","utf8");
    expect(prep).toContain("SIGNED_GRO_CRYPTOGRAPHIC_SIGNATURE_NOT_DELIVERABLE");
  });
  it("keeps optional language hash-bound and all nine current paid variants tier-limited",()=>{
    expect(request.properties.response_locale.enum).toEqual(["en","bn","hi"]);
    expect(adaptive.properties.question_interpretation.properties.response_locale.enum)
      .toEqual(["en","bn","hi"]);
    expect(adaptive.properties.decision_intelligence.items.properties.localized.properties.scope.const)
      .toBe("BOUNDED_FACTUAL_SUMMARY_ONLY");
    const products=publicGeomacroStructuredOutputCatalog().filter(p=>p.capability!=="risk_gate_bundle");
    expect(products).toHaveLength(9);
    for(const product of products){
      const limit=paidMarketWatchLimitFor(product.capability,product.variant);
      expect(limit).toBeGreaterThanOrEqual(1);
      expect(limit).toBeLessThanOrEqual(5);
      const response={execution_authorized:false,risk_gate:[],structural:[{
        subject:{type:product.capability.includes("corridor")?"corridor":"country"},
        intelligence:{macro:{observations:[{}]}},
      }],current_state:[{risk:null}],signed_risk_objects:[],gri_context:null,
      decision_intelligence:[{market_watch:{items:Array.from({length:limit+1},(_,i)=>i)}}]};
      expect(()=>assertLockedCapabilityDataBoundary(response,product.capability,product.variant))
        .toThrow("MARKET_WATCH_TIER_EXCEEDED");
    }
  });
});
