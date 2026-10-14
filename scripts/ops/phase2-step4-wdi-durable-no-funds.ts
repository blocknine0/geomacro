/**
 * Trusted-server ONE-SHOT operator acceptance, not a publisher or payment.
 * Run only after the EXISTING commerce DO worker version has been deployed
 * and WDI signing + verification credentials are present on that server.
 * Deliberately excluded from CI, PR jobs, scheduled jobs and public routes.
 */
import process from "node:process";
import {buildAgentQueryPlan} from "../../src/lib/agent-query-plan";
import {COINBASE_X402_MAINNET_NETWORK,COINBASE_X402_MAINNET_USDC} from
  "../../src/lib/coinbase-x402.server";
import {prepareVerifiedChinaCpiStructuralAnswer} from
  "../../src/lib/wdi-attributed-structural-product.server";
import {durablyFreezeWdiNoFundsAnswer} from
  "../../src/lib/wdi-structural-signing.server";
import {loadRiskObjectVerificationKeysFromEnv} from
  "../../src/lib/risk-object-signing.server";

const ack=process.env.GEOMACRO_WDI_DURABLE_NO_FUNDS_ONCE;
if(ack!=="I_AUTHORIZE_SINGLE_NO_FUNDS_READBACK" ||
   process.env.GITHUB_EVENT_NAME==="pull_request" ||
   process.env.GEOMACRO_COMMERCE_LEDGER_BACKEND!=="durable_object")
  throw Error("WDI_NO_FUNDS_OPERATOR_AUTHORIZATION_OR_BACKEND_REQUIRED");
const price=String(process.env.COINBASE_X402_PRICE_USDC??"").trim();
if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(price))
  throw Error("WDI_NO_FUNDS_PRICE_INVALID");
const [whole,frac=""]=price.split(".");
const amountAtomic=(BigInt(whole)*1000000n+
  BigInt((frac+"000000").slice(0,6))).toString();
const payTo=String(process.env.COINBASE_X402_PAY_TO??"").trim();
if(!/^[1-9][0-9]{0,17}$/.test(amountAtomic) ||
   !/^0x[0-9a-f]{40}$/i.test(payTo))
  throw Error("WDI_NO_FUNDS_PAYMENT_TERMS_NOT_EXPLICIT");
const plan=buildAgentQueryPlan({
  question:"China CPI inflation annual structural baseline",
  subjects:[{type:"country",country_iso3:"CHN"}],
  topics:["macro_risk"],
  delivery_tier:"structural_baseline",
  fulfillment_mode:"published_only",
  max_age_seconds:400*86400,
  detail:"compact",
});
const signed=await prepareVerifiedChinaCpiStructuralAnswer(plan);
if(signed.status!=="PREPARED_NO_FUNDS_ONLY")
  throw Error("WDI_NO_FUNDS_SOURCE_SIGNING_OR_RIGHTS_UNAVAILABLE");
const receipt=await durablyFreezeWdiNoFundsAnswer({
  signed_answer:signed.signed_answer,
  verification_keys:loadRiskObjectVerificationKeysFromEnv(),
  query_plan:plan,
  payment_terms:{
    amountAtomic,
    network:COINBASE_X402_MAINNET_NETWORK,
    asset:COINBASE_X402_MAINNET_USDC,
    payTo,
  },
});
if(!receipt.durable_prequote_readback_verified ||
   !receipt.identical_no_funds_replay_verified ||
   receipt.quote_authorized!==false ||
   receipt.payment_authorized!==false ||
   receipt.settlement_attempted!==false)
  throw Error("WDI_NO_FUNDS_READBACK_NOT_VERIFIED");
// Never log signed customer bytes, source-rights rows, private keys, bearer,
// receipt inventory or payment authorization payload.
process.stdout.write(JSON.stringify({
  schema:"geomacro.wdi-durable-no-funds-operator-result.v1",
  status:"DURABLE_BYTES_VERIFIED_NO_FUNDS_ONLY",
  frozen_quote_reference:receipt.frozen_quote_reference,
  signed_customer_answer_sha256:receipt.signed_customer_answer_sha256,
  payment_terms_binding:receipt.payment_terms_binding,
  rights_expires_at:receipt.rights_expires_at,
  durable_prequote_readback_verified:true,
  identical_no_funds_replay_verified:true,
  quote_authorized:false,payment_authorized:false,settlement_attempted:false,
  lovable_runtime_verified:false,
})+"\n");
