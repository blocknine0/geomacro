import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {capabilityPricingCatalog,publicCapabilityPricingCatalog} from "../lib/capability-pricing-catalog";
import {publicGeomacroPaidPricingManifest} from "../lib/geomacro-paid-pricing-manifest.server";
import {quoteGeomacroCapability} from "../lib/capability-pricing";
import {quoteGeomacroUsdcCapabilityPreflight} from "../lib/geomacro-multichain-usdc.server";
import {publicGeomacroStructuredOutputCatalog} from "../lib/capability-structured-output-contract";

describe("founder GRI public retirement permanent fail-closed, no funds",()=>{
 it("preserves legacy 8 prices only as old signed ledger history, but offers 7 non-GRI products",()=>{
  expect(capabilityPricingCatalog()).toHaveLength(8);
  expect(publicCapabilityPricingCatalog()).toHaveLength(7);
  expect(publicCapabilityPricingCatalog().flatMap(x=>x.variants)).toHaveLength(12);
  expect(publicGeomacroPaidPricingManifest().capability_count).toBe(7);
  expect(publicGeomacroPaidPricingManifest().capabilities.some(x=>x.capability==="gri_read")).toBe(false);
  expect(publicGeomacroStructuredOutputCatalog().some(x=>x.capability==="gri_read")).toBe(false);
 });
 it("cannot issue a GRI quote on any rail, including valid supplied availability",()=>{
  for(const variant of ["verified_cached","verified_change_attribution"]){
   expect(()=>quoteGeomacroCapability({
    capability:"gri_read",variant,requestFingerprint:"a".repeat(64),
    network:"eip155:8453",
    asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    recipient:"0x"+"b".repeat(40),rail:"coinbase_x402",
    availabilityVerified:true
   })).toThrow("CAPABILITY_RETIRED_NO_CHARGE");
   for(const network of ["base","arc","polygon"])
    expect(()=>quoteGeomacroUsdcCapabilityPreflight({capability:"gri_read",variant,network}))
     .toThrow("CAPABILITY_RETIRED_NO_CHARGE");
  }
 });
 it("retired frozen source page is never linked publicly and permanently redirects server side",()=>{
  const shell=readFileSync("src/components/site-shell.tsx","utf8");
  const middleware=readFileSync("server/middleware/05-retire-noncommercial-surfaces.ts","utf8");
  const sitemap=readFileSync("public/sitemap.xml","utf8");
  const store=readFileSync("src/components/capability-price-schedule.tsx","utf8");
  expect(shell).not.toContain('to: "/global-risk"');
  expect(shell).not.toContain('<Link to="/global-risk"');
  expect(middleware).toContain('["/global-risk", "/intelligence"]');
  expect(middleware).toContain('setResponseHeader(event, "X-Robots-Tag", "noindex, nofollow, noarchive")');
  expect(sitemap).not.toContain("https://geomacro.live/global-risk");
  expect(store).toContain("GEOMACRO_PUBLIC_PRICING_GROUPS");
 });
});