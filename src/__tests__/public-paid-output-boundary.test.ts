import { describe, expect, it } from "vitest";
import { computeGeomacroIntelligenceProductHash } from "../lib/geomacro-intelligence-contract";
import { approvedWdiAttribution } from "../lib/world-bank-derived-attribution";
import {approvedFedBoardMinutesAttribution}
  from "../lib/federal-reserve-board-derived-attribution";
import {
  assertPublicPaidOutputBoundary,
  sanitizeAndRehashPaidPreparedResponse,
  sanitizePublicPaidOutput,
} from "../lib/public-paid-output-boundary";

describe("source-free paid output boundary", () => {
  it("removes internal source and rights metadata while preserving payment provider metadata", () => {
    const sanitized = sanitizePublicPaidOutput({
      structural: {
        macro: {
          source_id: "world_bank_indicators",
          source_contract: { licence_name: "CC BY 4.0" },
          source_observed_at: "2026-10-02T00:00:00.000Z",
          delivery: "GOVERNED_WORLD_BANK_MODULE_STATE",
          methodology_version: "world-bank-derived-v1",
          limitations: { scope: "World Bank governed source" },
          state: { score: 61 },
        },
      },
      payment: { provider: "coinbase_cdp_x402" },
    });

    expect(sanitized).toEqual({
      structural: {
        macro: {
          delivery: "GOVERNED_DERIVED_MODULE_STATE",
          methodology_version: "geomacro-governed-derived-v1",
          limitations: { scope: "governed derived intelligence" },
          state: { score: 61 },
        },
      },
      payment: { provider: "coinbase_cdp_x402" },
    });
    expect(() => assertPublicPaidOutputBoundary(sanitized)).not.toThrow();
  });

  it("fails closed if unsanitized source identity reaches the final boundary", () => {
    expect(() => assertPublicPaidOutputBoundary({ source_id: "hidden" })).toThrow(
      /PAID_OUTPUT_INTERNAL_SOURCE_FIELD/,
    );
    expect(() => assertPublicPaidOutputBoundary({ note: "USGS input" })).toThrow(
      /PAID_OUTPUT_PROVIDER_IDENTITY_LEAK/,
    );
  });

  it("blocks real publisher links hidden inside otherwise approved derived fields", () => {
    const leak={
      answer: { summary:"Geomacro finds escalation. Original: https://news.un.org/en/story/2026/10/12345" },
      limitations:["Review raw article at www.usgs.gov/news/mineral-supply"],
    };
    expect(() => assertPublicPaidOutputBoundary(leak)).toThrow(
      /PAID_OUTPUT_EMBEDDED_SOURCE_URL/,
    );
    expect(() => sanitizePublicPaidOutput(leak, {rejectEmbeddedLinks:true})).toThrow(
      /PAID_OUTPUT_EMBEDDED_SOURCE_URL_UNQUALIFIED/,
    );
    const scrubbed=sanitizePublicPaidOutput(leak);
    expect(scrubbed).toEqual({
      answer:{summary:"governed derived intelligence"},
      limitations:["governed derived intelligence"],
    });
    expect(() => assertPublicPaidOutputBoundary(scrubbed)).not.toThrow();
    expect(JSON.stringify(scrubbed)).not.toContain("news.un.org");
    expect(JSON.stringify(scrubbed)).not.toContain("usgs.gov");
  });

  it("refuses to prepare a NEW chargeable response with embedded third-party URLs, but scrubs old replay", () => {
    const prepared={
      schema_version:"geomacro.adaptive-intelligence-response.v1",
      product:"geomacro_adaptive_risk_intelligence_v1",
      request_id:"request-123",
      answer:{summary:"Source https://www.federalreserve.gov/newsevents/pressreleases/monetary.htm"},
      delivered_product_hash:"0".repeat(64),
      availability:{deliverable:true},
      payment:{provider:"coinbase_cdp_x402"},
    };
    expect(()=>sanitizeAndRehashPaidPreparedResponse(prepared,{rejectEmbeddedLinks:true}))
      .toThrow("PAID_OUTPUT_EMBEDDED_SOURCE_URL_UNQUALIFIED");
    const replay=sanitizeAndRehashPaidPreparedResponse(prepared);
    expect(replay.answer).toEqual({summary:"governed derived intelligence"});
    expect(JSON.stringify(replay)).not.toContain("federalreserve.gov");
    expect(()=>assertPublicPaidOutputBoundary(replay)).not.toThrow();
  });

  it("re-hashes legacy prepared responses after sanitation", () => {
    const sanitized = sanitizeAndRehashPaidPreparedResponse({
      schema_version: "geomacro.adaptive-intelligence-response.v1",
      product: "geomacro_adaptive_risk_intelligence_v1",
      request_id: "request-123",
      structural: { source_id: "usgs_mcs", value: 7 },
      delivered_product_hash: "0".repeat(64),
      availability: { source_contracts: [{ source_id: "usgs_mcs" }], deliverable: true },
      payment: { provider: "coinbase_cdp_x402" },
    });

    const {
      delivered_product_hash: deliveredProductHash,
      availability,
      payment,
      ...coreWithoutProductHash
    } = sanitized;
    expect(deliveredProductHash).toBe(
      computeGeomacroIntelligenceProductHash(coreWithoutProductHash),
    );
    expect(availability).toEqual({ deliverable: true });
    expect(payment).toEqual({ provider: "coinbase_cdp_x402" });
    expect(JSON.stringify(sanitized)).not.toContain("usgs_mcs");
  });

  it("preserves *only* exact WDI CC BY licence/data credit in hash-bound derived paid output",()=>{
    const credit=approvedWdiAttribution(["FP.CPI.TOTL.ZG"]);
    const prepared={
      schema_version:"geomacro.adaptive-intelligence-response.v1",
      product:"geomacro_adaptive_risk_intelligence_v1",
      request_id:"request-license-123",
      answer:{summary:"Geomacro-derived inflation assessment."},
      data_attribution:credit,
      delivered_product_hash:"0".repeat(64),
      availability:{deliverable:true},
      payment:{provider:"coinbase_cdp_x402"},
    };
    const payload=sanitizeAndRehashPaidPreparedResponse(prepared,{rejectEmbeddedLinks:true});
    expect(payload.data_attribution).toEqual(credit);
    expect(()=>assertPublicPaidOutputBoundary(payload)).not.toThrow();
    const {delivered_product_hash,availability,payment,...core}=payload;
    expect(delivered_product_hash).toBe(computeGeomacroIntelligenceProductHash(core));
    expect(JSON.stringify(payload)).not.toContain("world_bank_indicators");
    expect(JSON.stringify(payload)).not.toContain("raw_payload");
  });

  it("preserves exact Board publication credit in the delivered-product hash without original source links",()=>{
    const credit=approvedFedBoardMinutesAttribution();
    const prepared={
      schema_version:"geomacro.adaptive-intelligence-response.v1",
      product:"geomacro_adaptive_risk_intelligence_v1",
      request_id:"request-board-credit-001",
      answer:{summary:"Geomacro-derived factual Board minutes publication."},
      data_attribution:credit,
      delivered_product_hash:"0".repeat(64),
      availability:{deliverable:false},payment:{provider:"coinbase_cdp_x402"},
    };
    const value=sanitizeAndRehashPaidPreparedResponse(prepared,{rejectEmbeddedLinks:true});
    expect(value.data_attribution).toEqual(credit);
    expect(()=>assertPublicPaidOutputBoundary(value)).not.toThrow();
    const {delivered_product_hash,availability,payment,...core}=value;
    expect(delivered_product_hash).toBe(computeGeomacroIntelligenceProductHash(core));
    expect(availability).toEqual({deliverable:false});
    for(const secret of ["federalreserve.gov","source_id","article_url",
      "original_article_sha256","raw_payload"]){
      expect(JSON.stringify(value)).not.toContain(secret);
    }
  });

  it("fails closed on forged Board credit, endorsement, replaced source, URL or hidden receipt",()=>{
    const approved=approvedFedBoardMinutesAttribution();
    for(const forged of [
      {...approved,credit:"Federal Reserve Bank of New York"},
      {...approved,material:"Other rate announcement"},
      {...approved,use_scope:"Includes third-party charts and seals"},
      {...approved,endorsement:"Board endorses Geomacro"},
      {...approved,material_url:"https://www.federalreserve.gov/newsevents"},
      {...approved,article_identity_sha256:"a".repeat(64)},
    ]){
      expect(()=>sanitizePublicPaidOutput({data_attribution:forged},{rejectEmbeddedLinks:true}))
        .toThrow("PAID_OUTPUT_UNQUALIFIED_DATA_ATTRIBUTION");
      expect(()=>assertPublicPaidOutputBoundary({data_attribution:forged}))
        .toThrow("PAID_OUTPUT_UNQUALIFIED_DATA_ATTRIBUTION");
    }
    expect(()=>assertPublicPaidOutputBoundary({data_attribution:approved})).not.toThrow();
  });

  it("does not allow arbitrary upstream links or forged credits to escape the paid source firewall",()=>{
    const good=approvedWdiAttribution(["FP.CPI.TOTL.ZG"]);
    const corrupt=[
      {...good,material_uris:["https://evil.example.org"]},
      {...good,terms_uri:"https://evil.example.org"},
      {...good,credit:"GDELT original feed"},
      {...good,unapproved_field:"exfiltration"},
      {...good,material_uris:[...good.material_uris,...good.material_uris]},
    ];
    for(const value of corrupt){
      expect(()=>sanitizePublicPaidOutput({data_attribution:value},
        {rejectEmbeddedLinks:true})).toThrow("PAID_OUTPUT_UNQUALIFIED_DATA_ATTRIBUTION");
      expect(()=>assertPublicPaidOutputBoundary({data_attribution:value}))
        .toThrow("PAID_OUTPUT_UNQUALIFIED_DATA_ATTRIBUTION");
    }
    expect(()=>assertPublicPaidOutputBoundary({
      data_attribution:good,answer:{summary:"www.worldbank.org/raw-article"}
    })).toThrow("PAID_OUTPUT_EMBEDDED_SOURCE_URL");
    expect(()=>assertPublicPaidOutputBoundary({answer:{summary:"World Bank feed"}}))
      .toThrow("PAID_OUTPUT_PROVIDER_IDENTITY_LEAK");
    expect(()=>assertPublicPaidOutputBoundary({
      structural:{data_attribution:good}
    })).toThrow(/PAID_OUTPUT_(PROVIDER_IDENTITY_LEAK|EMBEDDED_SOURCE_URL)/);
  });

  it("blocks nested raw source HTML, feed bytes and upstream payload before ANY quote",()=>{
    const rawExamples=[
      {answer:{raw_html:"<article>upstream fixture</article>"}},
      {analysis:{article_body:"publisher fixture"}},
      {structural:[{feed_xml:"<rss>fixture</rss>"}]},
      {signed_risk_objects:[{object:{upstream_payload:{private:"fixture"}}}]},
      {current_state:[{dataset_dump:"bulk export fixture"}]},
      {risk_gate:[{result:{original_text:"copyrighted fixture"}}]},
      {payment:{storage_blob:"binary fixture"}},
    ];
    for(const input of rawExamples){
      expect(()=>sanitizePublicPaidOutput(input,{rejectEmbeddedLinks:true}))
        .toThrow("PAID_OUTPUT_UNQUALIFIED_RAW_MATERIAL_FIELD");
      expect(()=>assertPublicPaidOutputBoundary(input))
        .toThrow("PAID_OUTPUT_RAW_MATERIAL_FIELD");
      const legacy=sanitizePublicPaidOutput(input);
      const asJson=JSON.stringify(legacy);
      expect(asJson).not.toContain("fixture");
      expect(()=>assertPublicPaidOutputBoundary(legacy)).not.toThrow();
    }
  });
  it("retains only literally false raw-delivery safety flags, never true claims",()=>{
    const harmless={limitations:{raw_data_delivered:false,
      raw_source_material_delivered:false},answer:{summary:"Derived Geomacro assessment"}};
    expect(sanitizePublicPaidOutput(harmless,{rejectEmbeddedLinks:true})).toEqual(harmless);
    expect(()=>assertPublicPaidOutputBoundary(harmless)).not.toThrow();
    expect(()=>sanitizePublicPaidOutput({raw_data_delivered:true},
      {rejectEmbeddedLinks:true})).toThrow("PAID_OUTPUT_UNQUALIFIED_RAW_MATERIAL_FIELD");
  });

  it("wires sanitation before durable x402 preparation and on replay", async () => {
    const fs = await import("node:fs/promises");
    const route = await fs.readFile("src/lib/mainnet-intelligence-endpoint.server.ts", "utf8");
    const offer=await fs.readFile("src/lib/capability-x402-offer.server.ts","utf8");
    expect(offer).toContain("sanitizeAndRehashPaidPreparedResponse(assembled,{rejectEmbeddedLinks:true})");
    expect(offer).toContain("availability:publicAgentQueryAvailability(input.availability)");
    expect(route).not.toContain("availability: finalAvailability,");
    expect(route).toContain("assertFrozenCapabilityResponse(prepared)");
    expect(route).toContain("assertFrozenCapabilityResponse(prior.response)");
    expect(route).toContain("sendFrozenCapabilityHttpBody");
    // A replay may validate, but must never rewrite the quoted body.
    expect(route).not.toContain("sanitizeAndRehashPaidPreparedResponse");
  });
});
