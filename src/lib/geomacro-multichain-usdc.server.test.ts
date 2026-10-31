import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
  GEOMACRO_USDC_NETWORKS,
  quoteGeomacroUsdcCapabilityPreflight,
  publicGeomacroUsdcRailDiscovery,
} from "./geomacro-multichain-usdc.server";
import {GEOMACRO_CAPABILITY_PRICES,resolveGeomacroCapabilityPrice}
  from "./capability-pricing-catalog";

describe("founder locked three-chain native USDC x402 v2 discovery",()=>{
  it("includes exact Circle mainnet CAIP-2 and native USDC contract addresses only",()=>{
    expect(Object.keys(GEOMACRO_USDC_NETWORKS)).toEqual(["base","arc","polygon"]);
    const b=GEOMACRO_USDC_NETWORKS.base;
    const a=GEOMACRO_USDC_NETWORKS.arc;
    const p=GEOMACRO_USDC_NETWORKS.polygon;
    expect([b.chain_id,b.caip2,b.asset]).toEqual([
      8453,"eip155:8453","0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]);
    expect([a.chain_id,a.caip2,a.asset]).toEqual([
      5042,"eip155:5042","0x3600000000000000000000000000000000000000"]);
    expect([p.chain_id,p.caip2,p.asset]).toEqual([
      137,"eip155:137","0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"]);
    for(const x of Object.values(GEOMACRO_USDC_NETWORKS)){
      expect(x.decimals).toBe(6);
      expect(x.facilitator).toBe("circle_facilitator_service");
      expect(x.asset).toMatch(/^0x[a-fA-F0-9]{40}$/u);
      expect(x.asset.toLowerCase()).not.toBe(
        "0x2791bca1f2de4661ed88a30c99a7a9449aa84174");
    }
  });
  it("uses only exact founder prices for all capabilities and every chain",()=>{
    const caps=Object.entries(GEOMACRO_CAPABILITY_PRICES);
    let count=0;
    for(const [capability,variants] of caps){
      // Historic GRI price remains pinned for audit, not a new payable/preview offer.
      if(capability==="gri_read"){
        for(const variant of Object.keys(variants))for(const network of ["base","arc","polygon"])
          expect(()=>quoteGeomacroUsdcCapabilityPreflight({capability,variant,network}))
            .toThrow("CAPABILITY_RETIRED_NO_CHARGE");
        continue;
      }
      for(const variant of Object.keys(variants)){
        const standard=resolveGeomacroCapabilityPrice(capability,variant);
        for(const network of ["base","arc","polygon"]){
          const v=quoteGeomacroUsdcCapabilityPreflight({capability,variant,network});
          expect(v.amount_usdc).toBe(standard.amount_usdc);
          expect(v.amount_atomic).toBe(standard.amount_atomic);
          expect(v.output_contract).toBeUndefined();
          expect(v.quote_binding_sha256).toMatch(/^[0-9a-f]{64}$/u);
          expect(v.quotation_type).toBe("NON_PAYABLE_CATALOG_PREVIEW");
          expect(v.chargeable).toBe(false);
          expect(v.payment_requirement_issued).toBe(false);
          expect(v.payment_authorized).toBe(false);
          expect(v.exact_live_product_deliverability_verified).toBe(false);
          expect(v.receiver_wallet_verified).toBe(false);
          expect(v.facilitator_runtime_verified).toBe(false);
          expect(v.raw_upstream_material_delivered).toBe(false);
          count++;
        }
      }
    }
    expect(count).toBeGreaterThan(30);
  });
  it("ties exact amount and asset to network with no mixed-chain replay ambiguity",()=>{
    const make=(network:string)=>quoteGeomacroUsdcCapabilityPreflight({
      network,capability:"intelligence_query",variant:"focused",
    });
    const a=make("base"),b=make("arc"),c=make("polygon");
    expect(a.amount_atomic).toBe("20000");
    expect(new Set([a.quote_binding_sha256,b.quote_binding_sha256,
      c.quote_binding_sha256]).size).toBe(3);
    expect(new Set([a.asset,b.asset,c.asset]).size).toBe(3);
  });
  it("refuses caller-forged prices, aliases and unknown networks",()=>{
    for(const body of [
      {network:"ethereum",capability:"intelligence_query",variant:"focused"},
      {network:"polygon",capability:"intelligence_query",variant:"focused",amount_atomic:"1"},
      {network:"polygon",capability:"intelligence_query",variant:"new_discount"},
      {network:"arc",capability:"custom_free",variant:"focused"},
      {network:"eip155:5042002",capability:"intelligence_query",variant:"focused"},
      {network:"polygon",capability:"intelligence_query"},
      null,[],{},{"__proto__":"x"},1234,
    ])expect(()=>quoteGeomacroUsdcCapabilityPreflight(body)).toThrow();
  });
  it("does not misrepresent supported chain software as merchant enabled or x402 funds authorized",()=>{
    const info=publicGeomacroUsdcRailDiscovery();
    expect(info.network_count).toBe(3);
    expect(info.all_three_merchant_settlements_verified).toBe(false);
    expect(info.settlement_authorized).toBe(false);
    expect(info.real_money_acknowledged).toBe(false);
    expect(info.raw_data_delivery).toBe(false);
    expect(info.networks.every(x=>x.merchant_settlement_ready===false)).toBe(true);
  });
  it("shows owner control only when ALL configured aliases match the EIP-191 signed recipient",()=>{
    const wallet="0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5";
    const shared={
      NODE_ENV:"production",
      GEOMACRO_USDC_RECEIVER:wallet,
      COINBASE_X402_PAY_TO:wallet.toLowerCase(),
      CIRCLE_X402_SELLER_ADDRESS:wallet,
    };
    const verified=publicGeomacroUsdcRailDiscovery(shared);
    expect(verified.merchant_receiver).toEqual({
      state:"RECEIVER_CONFIGURED_CONTROL_ATTESTED",
      address:wallet.toLowerCase(),
      same_address_configuration_verified:true,
      wallet_control_verified:true,
    });
    expect(verified.settlement_authorized).toBe(false);
    expect(verified.real_money_acknowledged).toBe(false);
    expect(verified.networks.every(x=>x.merchant_settlement_ready===false)).toBe(true);
    const previous="0xF98c18231ceFBD6d11154DEc14b3Aec6D74dC4B0";
    expect(publicGeomacroUsdcRailDiscovery({
      NODE_ENV:"production",GEOMACRO_USDC_RECEIVER:previous,
    }).merchant_receiver.wallet_control_verified).toBe(false);
    const drift=publicGeomacroUsdcRailDiscovery({
      ...shared, CIRCLE_X402_SELLER_ADDRESS:previous,
    });
    expect(drift.merchant_receiver.wallet_control_verified).toBe(false);
    expect(drift.merchant_receiver.state).toBe("RECEIVER_CONFIGURATION_MISMATCH");
  });
  it("exposes separate no-funds routes and reuses the actual official AI agent",()=>{
    const agent=readFileSync("src/lib/official-geomacro-agent.server.ts","utf8");
    const n=readFileSync("src/routes/api.v1.payments.networks.ts","utf8");
    const pre=readFileSync("src/routes/api.v1.payments.preflight.ts","utf8");
    expect(agent).toContain("publicGeomacroUsdcRailDiscovery()");
    expect(agent).toContain("GEOMACRO_USDC_QUOTE_PREFLIGHT_PATH");
    expect(n).toContain('createFileRoute("/api/v1/payments/networks")');
    expect(pre).toContain('createFileRoute("/api/v1/payments/preflight")');
    expect(pre).toContain("quoteGeomacroUsdcCapabilityPreflight");
    expect(pre).not.toContain("settleCoinbaseX402");
    expect(pre).not.toContain("settleCircleGatewayProduction");
    expect(pre).not.toContain("COINBASE_X402_MAINNET_ACK");
    expect(pre).not.toContain("PAYMENT-REQUIRED");
    expect(pre).not.toContain("payTo");
  });
});
