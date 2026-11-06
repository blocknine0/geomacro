import {defineEventHandler,setResponseHeaders,setResponseStatus} from "h3";
import {readRiskIndicesEdge} from "../../../src/lib/risk-indices-edge.server";

/**
 * Historical evidence recovery. This is intentionally NOT the current
 * independently-reviewed Ed25519 GRI API, not a payment/score generator and
 * not a substitute for the missing real signed source inputs.
 */
export default defineEventHandler(async (event) => {
  setResponseHeaders(event,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"public, max-age=30, s-maxage=60",
    "X-Content-Type-Options":"nosniff",
    "X-Robots-Tag":"noindex, nofollow",
  });
  const data=await readRiskIndicesEdge("historical");
  if (!data) {
    setResponseStatus(event,503);
    return {ok:false,code:"VERIFIED_HISTORICAL_RISK_INDICES_UNAVAILABLE",
      message:"No independently published verified index history could be authenticated."};
  }
  return {
    ok:true,
    data,
    meta:{
      authority:"backblaze-b2-risk-indices-edge",
      transport:"verified-archival-cloudflare-edge",
      display_status:"last_verified",
      current:false,
      source_as_of:data.snapshotAsOf,
      original_publication_time_preserved:true,
      current_reviewer_approval_not_inferred:true,
      current_signed_griparent_not_inferred:true,
      customer_chargeable:false,
    }
  };
});
