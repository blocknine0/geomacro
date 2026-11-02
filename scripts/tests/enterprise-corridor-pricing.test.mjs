import test from "node:test";
import assert from "node:assert/strict";
import {corridorEnterprisePricingDiscovery} from "../../src/lib/enterprise-corridor-pricing.ts";

test("enterprise corridor pricing stays additive, nonpayable and versioned",()=>{
 const v=corridorEnterprisePricingDiscovery();
 assert.equal(v.products.length,5);
 assert.deepEqual(v.credit_packs.slice(0,2).map(p=>p.price_usd),[50,250]);
 assert.equal(v.products.find(p=>p.id==="risk_gate_verification").credits_min,3);
 assert.equal(v.products.find(p=>p.id==="corridor_webhook_stream").monthly_usd,499);
 assert.equal(v.existing_subscriptions_unchanged,true);
 assert.equal(v.new_sales_enabled,false);
 assert.equal(v.checkout_enabled,false);
 assert.equal(v.sha256_integrity_not_immutability_guarantee,true);
});
