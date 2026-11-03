import {
  reliefwebPrivateCandidates,persistUnscoredSourceCandidatesD1,
} from "./private-unscored-source-d1.mjs";
import {deriveControlPlaneRootToken} from "../ops/derive-control-plane-root-token.mjs";

/** Single current ReliefWeb metadata-only API page -> existing canonical D1.
 * Original partner report bodies are neither requested nor stored.
 */
export async function runReliefWebPrivateD1({
  env=process.env,fetchImpl=fetch,now=new Date(),persist=persistUnscoredSourceCandidatesD1,
}={}) {
  const appname=String(env.RELIEFWEB_APPROVED_APPNAME??env.RELIEFWEB_APPNAME??"").trim();
  if(!appname||appname.length>160||/\s/u.test(appname))
    throw Error("RELIEFWEB_APPROVED_APPNAME_REQUIRED");
  const token=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
  if(token.length<32)throw Error("RELIEFWEB_PRIVATE_D1_AUTH_REQUIRED");
  const endpoint=new URL("https://api.reliefweb.int/v2/reports");
  endpoint.searchParams.set("appname",appname);
  const rawLimit=Number(env.RELIEFWEB_MAX_REPORTS??250);
  const limit=Number.isSafeInteger(rawLimit)?Math.min(1000,Math.max(1,rawLimit)):250;
  const body={
    preset:"latest",profile:"list",limit,
    fields:{include:["id","title","date.original","country.iso3","country.name",
      "source.name","source.shortname","url","url_alias","disaster_type.name",
      "theme.name"]},
  };
  const response=await fetchImpl(endpoint.href,{
    method:"POST",redirect:"error",
    headers:{accept:"application/json","content-type":"application/json"},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw Error("RELIEFWEB_PRIVATE_D1_API_HTTP_"+response.status);
  const declared=Number(response.headers.get("content-length")??0);
  if(declared>2_000_000)throw Error("RELIEFWEB_PRIVATE_D1_RESPONSE_TOO_LARGE");
  const responseText=await response.text();
  if(responseText.length>2_000_000)throw Error("RELIEFWEB_PRIVATE_D1_RESPONSE_TOO_LARGE");
  let data;try{data=JSON.parse(responseText)}catch{throw Error("RELIEFWEB_PRIVATE_D1_RESPONSE_INVALID")}
  if(!Array.isArray(data?.data))throw Error("RELIEFWEB_PRIVATE_D1_DATA_INVALID");
  const {candidates,diagnostics}=reliefwebPrivateCandidates(data.data,now);
  // The control-plane compares against CONTROL_PLANE_TOKEN, derived via
  // HMAC from the protected commerce root; never send the root as a bearer.
  const controlPlaneToken=deriveControlPlaneRootToken(token);
  const saved=await persist(candidates,{now,token:controlPlaneToken,fetchImpl});
  if(saved.d1_exact_readback_verified!==true||
    saved.proposed!==saved.persisted+saved.unchanged+
      saved.existing_identity_conflicts_quarantined)
    throw Error("RELIEFWEB_PRIVATE_D1_READBACK_FAILED");
  const report={
    schema:"geomacro.part2.reliefweb-private-d1.v1",
    source:"reliefweb_v2_report_metadata",
    checked_at:now.toISOString(),api_requests:1,
    reports_seen:diagnostics.seen,
    private_candidates:diagnostics.accepted,
    reports_not_native_dated_or_invalid:diagnostics.invalid,
    d1_records_written:saved.persisted,
    d1_records_unchanged:saved.unchanged,
    d1_identity_conflicts_quarantined:saved.identity_conflicts_quarantined,
    d1_exact_readback_verified:true,
    source_body_stored:false,commercial_eligible:false,
    signed_gro:false,paid_delivery:false,
  };
  return report;
}
