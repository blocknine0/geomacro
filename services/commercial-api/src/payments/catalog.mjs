import { requireValue } from './common.mjs';
const definitions={pack5:['pack',500],pack15:['pack',1500],pack30:['pack',3000],
  monthly9:['subscription',900],monthly29:['subscription',2900],monthly99:['subscription',9900]};
export function loadCatalog(json) {
  const supplied=JSON.parse(requireValue(json,'PAYPAL_CATALOG_JSON_REQUIRED',500));
  const catalog={};
  for(const [sku,[kind,amount]] of Object.entries(definitions)) {
    const value=supplied[sku];
    requireValue(value && Number.isSafeInteger(value.credits) && value.credits>0 &&
      Number.isSafeInteger(value.credits*1_000_000),'CATALOG_CREDITS_REQUIRED',500);
    if(kind==='subscription')requireValue(/^P-[A-Z0-9]+$/.test(value.planId),'CATALOG_PLAN_ID_REQUIRED',500);
    catalog[sku]=Object.freeze({sku,kind,usd_cents:amount,credit_units:value.credits*1_000_000,plan_id:value.planId??null});
  }
  return Object.freeze(catalog);
}
