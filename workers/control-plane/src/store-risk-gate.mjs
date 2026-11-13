import {generateProgressiveRiskGateDecision} from "./progressive-risk-gate.mjs";

/**
 * Public Store Risk Gate route is deliberately held while checkout is disabled.
 * The held route cannot touch the Predge request, license, or usage ledgers.
 */
const json=(body,status)=>Response.json(body,{status,headers:{
 "Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff",
 "Vary":"Authorization"
}});

export function storePaidCheckoutLocked(){
 return json({ok:false,error:"STORE_PAID_CHECKOUT_LOCKED",
  execution_authorized:false,chargeable:false},403);
}

/** Shared facts-only computation adapter; checkout and ledger authorization
 * remain outside the decision engine and separate from Predge's Addendum. */
export function generateStoreProgressiveDecision(parsed,facts,tier,
 signedGroReady=false,sevenDayRollupReady=false,now=Date.now()){
 return generateProgressiveRiskGateDecision(parsed,facts,tier,
  signedGroReady,sevenDayRollupReady,now);
}

export async function storeRiskGateD1(request,env){
 if(request.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 // Checkout, customer-key debit and store entitlements remain fail-closed.
 // This separate public path never accepts Predge credentials or consumes a
 // Predge Addendum usage receipt. A future store enablement needs its own
 // reviewed contract and customer credit/USDC ledger acceptance.
 if(env?.GEOMACRO_STORE_CHECKOUT_ENABLED!=="YES"||
    env?.GEOMACRO_STORE_RISK_GATE_ACCEPTANCE!=="ACCEPTED_STORE_RISK_GATE_V1")
  return storePaidCheckoutLocked();
 // Keep this fail-closed until customer key/entitlement debit parity is
 // explicitly accepted; configuration alone cannot enable paid delivery.
 return storePaidCheckoutLocked();
}
