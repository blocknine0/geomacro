import {
  defineEventHandler,
  setResponseStatus,
} from "h3";
import {readGeoMacroNewsSeverityRiskIndices} from "../../../src/lib/news-severity-risk-index.server";
import {publicResponseCache} from "./public-response-cache.server";

export default defineEventHandler(async (event) => {
  try{return await publicResponseCache(event,"public-risk-indices-news-severity-v1",async()=>{
    const data=await readGeoMacroNewsSeverityRiskIndices();
    if(!data){setResponseStatus(event,503);return {ok:false,code:"RISK_INDICES_UNAVAILABLE",
      message:"No current GeoMacro self-certified 72-hour news-severity projection is available."};}
    return {ok:true,data,meta:{authority:"geomacro-news-severity-ed25519",
      signature_verified:true,review_status:"self_certified_not_independently_reviewed",
      snapshot_as_of:data.snapshotAsOf,source_event_facts_independently_verified:false}};
  });}catch(error){
    console.error("[api/public/risk-indices] unavailable",
      error instanceof Error?error.message:"unknown error");
    setResponseStatus(event,503);
    return {ok:false,code:"RISK_INDICES_UNAVAILABLE",
      message:"No current GeoMacro self-certified 72-hour news-severity projection is available."};
  }
});
