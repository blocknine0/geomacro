import {describe,expect,it} from "vitest";
import {normalizeReusableNewsJson,normalizeReusableNewsBatch,
  REUSABLE_NEWS_JSON_SCHEMA} from "../lib/reusable-news-json";
import {readFileSync} from "node:fs";
const news="The Federal Reserve announced a 25 basis points policy rate decrease. The bank confirmed inflation was 2.4 percent in the new release.";
describe("all-license-class reusable factual news JSON",()=>{
  it("normalizes Macro/FX, geopolitics and minerals into one contract",()=>{
    for(const category of ["macro-fx","geopolitics","critical-minerals"]){
      const result=normalizeReusableNewsJson({category,text:news,license:"noncommercial"});
      expect(result.schema).toBe(REUSABLE_NEWS_JSON_SCHEMA);
      expect(result.category).toBe(category==="macro-fx"?"macro":category==="geopolitics"?"geopolitics":"rare_earth");
      expect(result.facts.named_organizations).toContain("Federal Reserve");
      expect(result.facts.action_terms).toContain("announce");
      expect(result.delivery.raw_article_included).toBe(false);
      expect(result.usage_rights.commercial_reuse_authorized).toBe(false);
      expect(JSON.stringify(result)).not.toContain(news);
    }
  });
  it("never equates a submitted license label with a legally verified commercial grant",()=>{
    for(const license of ["commercial","noncommercial","public_domain","unknown"]){
      const result=normalizeReusableNewsJson({category:"geopolitics",text:news,license});
      expect(result.usage_rights.declared_source_license).toBe(license);
      expect(result.usage_rights.declaration_is_verified).toBe(false);
      expect(result.usage_rights.article_specific_permission_verified).toBe(false);
      expect(result.delivery.downstream_paid_product_authorized).toBe(false);
      expect(result.verification.original_page_verified).toBe(false);
    }
  });
  it("extracts typed bounded numerics and never invents a country or timestamp",()=>{
    const result=normalizeReusableNewsJson({category:"macro",text:news});
    expect(result.facts.numeric_mentions.some(n=>n.value==="25")).toBe(true);
    expect(result.facts.numeric_mentions.some(n=>n.value==="2.4")).toBe(true);
    expect(result.country_iso3).toBeNull();
    expect(result.source.original_published_at).toBeNull();
  });
  it("deduplicates identical source submissions and enforces narrow untrusted input bounds",()=>{
    const input={category:"critical-minerals",text:"USGS announced 15 million tons of copper reserves in its latest resource update.",license:"unknown"};
    const batch=normalizeReusableNewsBatch([input,input]);
    expect(batch.count).toBe(1);
    expect(batch.items).toHaveLength(1);
    expect(()=>normalizeReusableNewsBatch([])).toThrow("NEWS_JSON_INPUT_INVALID");
    expect(()=>normalizeReusableNewsJson({...input,source_url:"http://127.0.0.1/private"})).toThrow();
    expect(()=>normalizeReusableNewsJson({...input,api_key:"SECRET"})).toThrow();
    expect(()=>normalizeReusableNewsJson({...input,text:"a".repeat(12001)})).toThrow();
    expect(()=>normalizeReusableNewsJson({...input,published_at:"2026-02-30T00:00:00Z"})).toThrow();
  });
  it("wires one public normalize POST, live D1 auto projection and human paste interface",()=>{
    const route=readFileSync("src/routes/api.v1.intelligence.live-structured.ts","utf8");
    const canonical=readFileSync("src/routes/api.v1.intelligence.query.ts","utf8");
    const projection=readFileSync("src/lib/derived-news-structural-response.server.ts","utf8");
    const ui=readFileSync("src/routes/data-api.tsx","utf8");
    expect(route).toContain('mode==="news-json"');
    expect(route).toContain('normalizeReusableNewsBatch');
    expect(canonical).toContain('"reusable-news-json"');
    expect(projection).toContain("normalizeReusableNewsJson");
    expect(ui).toContain("<NewsJsonWorkbench />");
  });
});
