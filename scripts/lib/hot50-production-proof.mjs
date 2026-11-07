/** Source-free, no-funds production contract checker for the exact Hot50 × 3 grid. */
export const HOT50_CATEGORY_KEYS=Object.freeze(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const STATES=new Set(["VERIFIED_SIGNED_GRO","OBSERVED_UNVERIFIED","NO_VERIFIED_SIGNAL"]);
const STATUS=/^[A-Z0-9_]{1,90}$/u;
const validDate=(value)=>typeof value==="string"&&Number.isFinite(Date.parse(value));
/**
 * Never equate a daily observation or a ready Basic proxy with a current
 * three-domain signed GRO. Input is a trusted Worker response, not raw news.
 * Output contains symbolic states only; no source names, payloads or tokens.
 */
export function inspectHot50TierResponse({country,tier,price,httpStatus,body,now=Date.now()}){
 const product=body?.tiered_product;
 const categories=body?.categories;
 const keys=categories&&typeof categories==="object"&&!Array.isArray(categories)?
  Object.keys(categories):[];
 const exactCategories=keys.length===3&&HOT50_CATEGORY_KEYS.every(key=>
  keys.includes(key)&&STATES.has(categories[key]?.status));
 const category_statuses=Object.fromEntries(HOT50_CATEGORY_KEYS.map(key=>[
  key,exactCategories?categories[key].status:"INVALID_OR_MISSING"
 ]));
 const live=body?.verified_live_scoring;
 const signedLive=exactCategories&&HOT50_CATEGORY_KEYS.every(key=>
  categories[key].status==="VERIFIED_SIGNED_GRO")&&
  body?.policy_evaluation_has_complete_verified_score===true&&
  live?.trusted_signed_gro_verified===true&&
  validDate(live.gro_generated_at)&&validDate(live.gro_expires_at)&&
  Date.parse(live.gro_generated_at)<=now&&Date.parse(live.gro_expires_at)>now&&
  HOT50_CATEGORY_KEYS.every(key=>{
   const v=live?.category_scores?.[key];
   return typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1;
  });
 const contract_valid=httpStatus===200&&body?.ok===true&&
  body?.target_type==="COUNTRY"&&body?.target_id===country&&exactCategories&&
  product?.subject?.type==="COUNTRY"&&product?.subject?.id===country&&
  product?.tier===price.tier&&
  product?.price?.usd_per_call===price.usd_per_call&&
  product?.price?.usdc_atomic_at_1_usdc_per_usd===price.usdc_atomic&&
  product?.execution_authorized===false&&product?.charged===false;
 const rawStatus=String(product?.status??body?.error??"RESPONSE_INVALID");
 return {
  country_iso3:country,tier,http_status:httpStatus,
  status:STATUS.test(rawStatus)?rawStatus:"RESPONSE_INVALID",
  contract_valid:contract_valid===true,
  ready:contract_valid===true&&product.status==="READY",
  category_statuses,
  verified_current_three_category:contract_valid===true&&signedLive,
 };
}
