// Universal request scope / tier classifier. No partner-specific assumptions.
export const TIERS = Object.freeze(["BASIC","STANDARD","COMPLEX"]);
export const DOMAINS = Object.freeze(["geopolitics","macro_fx","critical_minerals"]);
const ISO3 = /^[A-Z]{3}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
export class GateError extends Error {
  constructor(code, httpStatus=422) { super(code); this.code=code; this.httpStatus=httpStatus; }
}
function obj(v) { return !!v && typeof v==="object" && !Array.isArray(v); }
function exactKeys(o, keys) { return Object.keys(o).every(k=>keys.includes(k)); }
export function normalizeSubject(s) {
  if (!obj(s)) throw new GateError("SUBJECT_INVALID",400);
  if (s.type==="country" && exactKeys(s,["type","country_iso3"]) && ISO3.test(s.country_iso3)) {
    return {type:"country",id:s.country_iso3};
  }
  if (s.type==="corridor" && exactKeys(s,["type","origin_country_iso3","destination_country_iso3"]) &&
      ISO3.test(s.origin_country_iso3) && ISO3.test(s.destination_country_iso3) &&
      s.origin_country_iso3!==s.destination_country_iso3) {
    return {type:"corridor",id:s.origin_country_iso3+">"+s.destination_country_iso3};
  }
  throw new GateError("SUBJECT_INVALID",400);
}
export function normalizeRequest(r) {
  if (!obj(r) || !exactKeys(r,["schema","request_id","tier","subjects","domains","policy_id","risk_question","scenarios","historical_comparison","action_context"]))
    throw new GateError("REQUEST_CONTRACT_INVALID",400);
  if (r.schema!=="geomacro.risk-request.v1" || !SAFE_ID.test(r.request_id) || !TIERS.includes(r.tier))
    throw new GateError("REQUEST_CONTRACT_INVALID",400);
  if (!Array.isArray(r.subjects)||r.subjects.length<1||r.subjects.length>8) throw new GateError("SUBJECT_COUNT_INVALID",400);
  const subjects = r.subjects.map(normalizeSubject);
  if (new Set(subjects.map(x=>x.type+":"+x.id)).size!==subjects.length) throw new GateError("SUBJECT_DUPLICATE",400);
  if (!Array.isArray(r.domains)||r.domains.length<1||r.domains.length>3 ||
      r.domains.some(d=>!DOMAINS.includes(d))||new Set(r.domains).size!==r.domains.length)
    throw new GateError("DOMAINS_INVALID",400);
  if (typeof r.policy_id!=="string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(r.policy_id)) throw new GateError("POLICY_INVALID",400);
  if (r.risk_question!==undefined && (typeof r.risk_question!=="string"||r.risk_question.length>1000)) throw new GateError("QUESTION_INVALID",400);
  const scenarios=r.scenarios===undefined?[]:r.scenarios;
  if (!Array.isArray(scenarios)||scenarios.length>4||scenarios.some(s=>typeof s!=="string"||!/^[A-Za-z0-9_.:-]{1,64}$/.test(s))||
      new Set(scenarios).size!==scenarios.length) throw new GateError("SCENARIOS_INVALID",400);
  if (r.historical_comparison!==undefined && typeof r.historical_comparison!=="boolean") throw new GateError("HISTORY_INVALID",400);
  if (r.action_context!==undefined && (!obj(r.action_context)||Object.keys(r.action_context).length>12||
      JSON.stringify(r.action_context).length>2048)) throw new GateError("ACTION_CONTEXT_INVALID",400);
  const derivedTier = subjects.length>1||scenarios.length>0||r.historical_comparison===true?"COMPLEX":r.domains.length>1?"STANDARD":"BASIC";
  // No client can mislabel scope, take a lower-price tier, or upsell purely by output length.
  if (r.tier!==derivedTier) throw new GateError("TIER_SCOPE_MISMATCH",422);
  return Object.freeze({schema:r.schema,request_id:r.request_id,tier:derivedTier,
    subjects,domains:[...r.domains].sort(),policy_id:r.policy_id,
    risk_question:r.risk_question||"",scenarios:[...scenarios].sort(),
    historical_comparison:r.historical_comparison===true,action_context:r.action_context||{}});
}
export function usdcAtomic(value) {
  if (typeof value!=="string"||!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) throw new GateError("PRICE_PRECISION_INVALID");
  const [a,b=""]=value.split(".");
  const n=BigInt(a)*1000000n+BigInt(b.padEnd(6,"0"));
  if (n<=0n||n>1000000000000000n) throw new GateError("PRICE_INVALID");
  return n.toString();
}
export function lockQuote(req,tenant,catalog) {
  // Catalog is trusted server-side configuration; NEVER supplied in customer JSON.
  const profile=catalog?.[tenant.pricing_profile];
  const corridor=req.subjects.some(s=>s.type==="corridor");
  if (corridor && profile?.corridor_pricing_approved!==true) {
    return Object.freeze({status:"UNPRICED_CORRIDOR",currency:"USDC",price_usdc:null,price_atomic:null,pricing_version:null});
  }
  if (!profile || profile.status!=="APPROVED" || !profile.version || !own(profile.tiers||{},req.tier)) {
    return Object.freeze({status:"PRICE_NOT_APPROVED",currency:"USDC",price_usdc:null,price_atomic:null,pricing_version:null});
  }
  const price=profile.tiers[req.tier];
  return Object.freeze({status:"LOCKED",currency:"USDC",price_usdc:price,
    price_atomic:usdcAtomic(price),pricing_version:profile.version});
}
