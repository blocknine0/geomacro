#!/usr/bin/env node
/**
 * Public, read-only Base + Polygon merchant and three-category acceptance.
 * No PAYMENT-SIGNATURE, USDC, token approval, fee, private B2, credentials
 * or raw publisher payload. Output contains only vetted statuses/codes.
 */
import {readFileSync} from "node:fs";
import {mkdir,writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

export const NETWORKS=Object.freeze({
  base:Object.freeze({id:"eip155:8453",asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}),
  polygon:Object.freeze({id:"eip155:137",asset:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"}),
});
export const CATEGORIES=Object.freeze([
  "geopolitics","macro-fx","critical-minerals",
]);
const SHA=/^[a-f0-9]{40}$/;
const EVM=/^0x[a-fA-F0-9]{40}$/;
const allowedPublicCodes=new Set([
  "MAINNET_SELECTED_NETWORK_NOT_LIVE",
  "NO_CARD_MERCHANT_MAINNET_NOT_AUTHORIZED",
  "NO_CARD_AVAILABILITY_UNAVAILABLE",
  "NO_CARD_PRICE_OR_RIGHTS_UNVERIFIED",
  "NO_CARD_OFFER_NOT_INDEPENDENTLY_VERIFIED",
  "NOT_AVAILABLE","INSUFFICIENT_COVERAGE","STALE_REQUIRED_DATA",
  "UNAVAILABLE","AVAILABILITY_CHECK_UNAVAILABLE",
  "CAPABILITY_PRICE_UNVERIFIED_NO_CHARGE","COINBASE_X402_NOT_CONFIGURED",
  "COINBASE_X402_CONFIGURATION_INVALID",
  "MAINNET_NETWORK_QUERY_UNSUPPORTED",
  "MAINNET_SELECTED_NETWORK_PAYMENT_RAIL_MISMATCH",
  "CENTRAL_SECURITY_UNAVAILABLE","CENTRAL_SECURITY_KEY_UNAVAILABLE",
  "REAL_FUNDS_SECURITY_GATE_LOCKED","X402_RATE_LIMITED",
]);
const expected=JSON.parse(readFileSync(new URL("../../config/mainnet-usdc-recipient.json",import.meta.url),"utf8"));
const normalize=x=>String(x??"").toLowerCase();
async function publicJson(fetcher,url,options={}){
  const response=await fetcher(url,{redirect:"error",cache:"no-store",
    headers:{Accept:"application/json",...(options.method==="POST"?
      {"Content-Type":"application/json"}:{})},
    signal:AbortSignal.timeout(15_000),...options});
  // Protect against unbounded/error HTML. Do not persist response bodies.
  if(response.redirected||Number(response.headers.get("content-length")||0)>65_536)
    throw Error("UNSAFE_PUBLIC_RESPONSE");
  let body=null;
  try{const text=await response.text();if(text.length<=65_536)body=JSON.parse(text);}catch{}
  return {status:response.status,body};
}
function checkQuote(body,network,recipient,resource){
  const accepts=body?.accepts;
  return body?.x402Version===2 && body?.resource?.url===resource &&
    Array.isArray(accepts)&&accepts.length===1 &&
    accepts.every(p=>p?.scheme==="exact"&&p?.network===network.id &&
      normalize(p.asset)===normalize(network.asset) &&
      normalize(p.payTo)===normalize(recipient) &&
      /^\d+$/.test(String(p.amount??"")) && BigInt(p.amount)>0n);
}
export async function inspectTwoChainMerchant({
  origin="https://geomacro.live",fetcher=fetch,expectedSha,
  expectedRecipient=expected.receiver,
}={}){
  if(!SHA.test(String(expectedSha??""))||!EVM.test(expectedRecipient))
    throw Error("INVALID_EXPECTED_MAIN_OR_RECIPIENT");
  const base=new URL(origin);
  if(base.protocol!=="https:"||base.pathname!=="/"||base.username||base.password||
    base.search||base.hash)throw Error("INVALID_PUBLIC_ORIGIN");
  const out={schema:"geomacro.base-polygon-three-category-no-funds.v1",
    checked_at:new Date().toISOString(),expected_main_sha:expectedSha,
    receiver:expectedRecipient, wallet_ownership_publicly_attested:false,
    deployed_exact_main:false,merchant_environment_aligned:false,
    payment_signature_sent:false,money_transferred:false,
    settlement_verified:false,customer_paid_delivery_verified:false,
    categories:[],status:"BLOCKED"};
  try{
    const build=await publicJson(fetcher,new URL("/.well-known/geomacro-build.json",base));
    out.deployed_exact_main=build.status===200 &&
      build.body?.canonical_main_sha===expectedSha &&
      build.body?.canonical_repository==="blocknine0/geomacro";
  }catch{}
  try{
    const r=await publicJson(fetcher,new URL("/api/v1/payments/networks",base));
    const receiver=r.body?.merchant_receiver;
    out.merchant_environment_aligned=r.status===200 && r.body?.ok===true &&
      normalize(receiver?.address)===normalize(expectedRecipient) &&
      receiver?.same_address_configuration_verified===true;
    out.wallet_ownership_publicly_attested=out.merchant_environment_aligned &&
      receiver?.wallet_control_verified===true &&
      receiver?.state==="RECEIVER_CONFIGURED_CONTROL_ATTESTED";
  }catch{}
  for(const category of CATEGORIES){
    for(const [networkName,network] of Object.entries(NETWORKS)){
      const path="/api/v1/intelligence/"+category+"?network="+networkName;
      const row={category,network:networkName,http_status:0,
        quote_scope_verified:false, no_charge_verified:false,
        payment_performed:false,blocker_code:"PUBLIC_REQUEST_UNAVAILABLE"};
      try{
        const result=await publicJson(fetcher,new URL(path,base),{
          method:"POST",
          body:JSON.stringify({subjects:[{type:"country",country_iso3:"IND"}],
            fulfillment_mode:"published_only",detail:"compact"}),
        });
        row.http_status=result.status;
        const b=result.body;
        if(result.status===402){
          const resource=new URL("/api/v1/intelligence/query?network="+networkName,base).toString();
          row.quote_scope_verified=checkQuote(b,network,expectedRecipient,resource);
          row.blocker_code=row.quote_scope_verified?"NONE":"INVALID_PAYMENT_QUOTE_SCOPE";
        }else if([400,422,429,503].includes(result.status) &&
          b?.chargeable===false &&
          b?.payment_required_now===false){
          row.no_charge_verified=true;
          const code=b?.error?.code;
          row.blocker_code=allowedPublicCodes.has(code)?code:"OTHER_NONPAYABLE_OR_UNAVAILABLE";
        }else{
          row.blocker_code="UNEXPECTED_PUBLIC_PAYMENT_RESPONSE";
        }
      }catch{}
      out.categories.push(row);
    }
  }
  const quotes=out.categories.filter(r=>r.quote_scope_verified).length;
  out.qualified_offers=quotes;
  out.six_no_funds_requests_verified=out.categories.length===6 &&
    out.categories.every(r=>r.quote_scope_verified||r.no_charge_verified);
  // A payable challenge certifies neither payment nor delivery. Require
  // exact deployed main, pinned receiver and one legitimate 402 per category
  // on both chains before calling this narrow prequote result green.
  if(out.deployed_exact_main && out.wallet_ownership_publicly_attested &&
      quotes===6 && out.six_no_funds_requests_verified)
    out.status="SIX_QUALIFIED_PREQUOTES_NO_FUNDS";
  return out;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await inspectTwoChainMerchant({expectedSha:process.env.GITHUB_SHA});
  await mkdir("artifacts/base-polygon-no-funds",{recursive:true});
  await writeFile("artifacts/base-polygon-no-funds/proof.json",
    JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result));
  if(result.status!=="SIX_QUALIFIED_PREQUOTES_NO_FUNDS")process.exitCode=1;
}
