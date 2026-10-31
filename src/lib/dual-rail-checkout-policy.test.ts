import { describe, expect, it } from "vitest";
import { readOnlyDualRailCatalog, readOnlyCryptoQuotePreview, DUAL_RAIL_CHECKOUT_POLICY } from "./dual-rail-checkout-policy";

describe("dual rail locked checkout contract", () => {
  it("never issues a payable quote, receiver or credits", () => {
    for (const network of ["base", "polygon"]) {
      for (const sku of ["starter_dev", "pro_analyst", "business_pilot",
        "starter_pack", "standard_pack", "growth_pack"]) {
        const p = readOnlyCryptoQuotePreview({ sku, network });
        expect(p).toMatchObject({
          ok: false, code: "EXTERNAL_PAYMENTS_LOCKED", quote_id: null,
          merchant_recipient: null, expires_at: null, payment_uri: null,
          chargeable: false, credits_funded: 0,
        });
      }
    }
  });
  it("always rejects foreign SKU, chain or buyer-supplied amount", () => {
    for (const data of [
      { sku: "retired", network: "base" },
      { sku: "starter_dev", network: "arc" },
      { sku: "starter_dev", network: "polygon", amount_usd: 1 },
      { sku: "starter_dev", network: "base", user_id: "attacker" },
    ]) expect(() => readOnlyCryptoQuotePreview(data)).toThrow();
  });
  it("retains all six founder-approved prices and native Circle contracts", () => {
    const c = readOnlyDualRailCatalog();
    expect(c.products.map(p => [p.sku, p.price_usd, p.credits])).toEqual([
      ["starter_dev",9,1000],["pro_analyst",29,5000],
      ["business_pilot",99,25000],["starter_pack",5,100],
      ["standard_pack",15,500],["growth_pack",30,1500],
    ]);
    expect(c.networks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id:"base", chain_id:8453,
        native_usdc_asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }),
      expect.objectContaining({ id:"polygon", chain_id:137,
        native_usdc_asset:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" }),
    ]));
    expect(DUAL_RAIL_CHECKOUT_POLICY.external_checkout_enabled).toBe(false);
    expect(DUAL_RAIL_CHECKOUT_POLICY.credit_grants_enabled).toBe(false);
    expect(DUAL_RAIL_CHECKOUT_POLICY.paypal_capture_enabled).toBe(false);
  });
});
