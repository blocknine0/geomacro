/**
 * A published pricing catalog is only a price-lock witness, never a payable
 * quote. This strictly checks the existing owner-locked structural digest
 * pilot variant. No payments, external discovery, signatures or rights grant.
 */
export const FIRST_SALE_CAPABILITY="structural_country_digest";
export const FIRST_SALE_VARIANT="standard";
export const FIRST_SALE_LOCKED_USDC="0.02";
export const FIRST_SALE_LOCKED_ATOMIC="20000";
export function verifyFirstSalePriceManifest(manifest){
 if(manifest?.schema!=="geomacro.public-capability-price-catalog.v2"||
    manifest?.pricing_version!=="geomacro.capability-usdc.v2"||
    manifest?.pricing_status!=="FOUNDER_APPROVED_LOW_BARRIER_SCHEDULE"||
    manifest?.payment_authorized!==false||
    manifest?.money_transferred!==false||
    manifest?.x402_payment_requirement_issued!==false||
    manifest?.source_and_rights_required!==true||
    !Array.isArray(manifest?.capabilities))throw Error("FIRST_SALE_PRICING_MANIFEST_INVALID");
 const rows=manifest.capabilities.filter(x=>x?.capability===FIRST_SALE_CAPABILITY);
 if(rows.length!==1||!Array.isArray(rows[0]?.variants))throw Error("FIRST_SALE_PRICING_VARIANT_UNVERIFIED");
 const variants=rows[0].variants.filter(v=>v?.variant===FIRST_SALE_VARIANT);
 if(variants.length!==1)throw Error("FIRST_SALE_PRICING_VARIANT_UNVERIFIED");
 const v=variants[0];
 if(v.price_usdc!==FIRST_SALE_LOCKED_USDC||v.amount_atomic!==FIRST_SALE_LOCKED_ATOMIC||
    v.currency!=="USDC"||v.decimals!==6||
    v.output_contract!=="GEOMACRO_DERIVED_STRUCTURED_ONLY"||
    !v.structured_delivery||typeof v.structured_delivery!=="object"||
    v.included_signed_object_charge!=="NOT_APPLICABLE")
  throw Error("FIRST_SALE_LOCKED_PRICE_OR_OUTPUT_CONTRACT_MISMATCH");
 return Object.freeze({
  founder_price_catalog_verified:true,
  capability:FIRST_SALE_CAPABILITY,variant:FIRST_SALE_VARIANT,
  catalog_only_usdc:FIRST_SALE_LOCKED_USDC,
  catalog_only_atomic:FIRST_SALE_LOCKED_ATOMIC,
  payable_quote_verified:false,settlement_verified:false,real_money_authorized:false
 });
}