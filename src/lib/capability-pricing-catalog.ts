import type {GeomacroCreditCapability} from "./commercial-access-contract";

export const GEOMACRO_CAPABILITY_PRICING_VERSION =
  "geomacro.capability-usdc.v2" as const;
export const GEOMACRO_USDC_DECIMALS=6 as const;
export const GEOMACRO_CAPABILITY_PRICES={
  gri_read:{
    verified_cached:"0.005",verified_change_attribution:"0.01",
  },
  structural_country_digest:{standard:"0.02"},
  structural_corridor_digest:{standard:"0.03"},
  structural_country_profile:{standard:"0.03"},
  structural_corridor_profile:{standard:"0.05"},
  intelligence_query:{
    focused:"0.02",standard:"0.03",complex_multi_source:"0.05",
  },
  signed_risk_object:{
    existing_valid_signed:"0.03",newly_qualified_signed:"0.05",
  },
  risk_gate_bundle:{
    existing_proof_preflight:"0.03",standard:"0.05",complex_multi_source:"0.05",
  },
} as const satisfies Record<GeomacroCreditCapability,Record<string,string>>;

export type PricedCapability=keyof typeof GEOMACRO_CAPABILITY_PRICES;
/** Risk Gate remains visible at its locked prices, but is NOT a launch sale. */
export function publicCapabilityLaunchStatus(capability:string):"COMING_SOON"|"ELIGIBILITY_GATED"|"RETIRED"{
  if(capability==="risk_gate_bundle")return "COMING_SOON";
  if(capability==="gri_read")return "RETIRED";
  return "ELIGIBILITY_GATED";
}
export function publicCapabilityNewSalesAllowed(capability:string):boolean{
  return isPublicStoreCapability(capability) && publicCapabilityLaunchStatus(capability)!=="COMING_SOON";
}

/** Public GRI sales retired by founder; existing signed historical ledger prices stay immutable. */
export function isPublicStoreCapability(capability:string):boolean {
  return capability !== "gri_read" && Object.hasOwn(GEOMACRO_CAPABILITY_PRICES,capability);
}

export type PriceVariant={ [K in PricedCapability]:
  keyof (typeof GEOMACRO_CAPABILITY_PRICES)[K] }[PricedCapability];
export const GEOMACRO_PRICING_GROUPS=[
  {label:"Global Risk Index",ids:["gri_read"]},
  {label:"Structural digests",ids:["structural_country_digest","structural_corridor_digest"]},
  {label:"Structural profiles",ids:["structural_country_profile","structural_corridor_profile"]},
  {label:"Intelligence queries",ids:["intelligence_query"]},
  {label:"Signed Risk Objects",ids:["signed_risk_object"]},
  {label:"Risk Gate bundles",ids:["risk_gate_bundle"]},
] as const;

/** Reject floats and scientific notation; USDC always has six atomic places. */
export function usdcDecimalToAtomic(value:string):string{
  if(typeof value!=="string"||!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value))
    throw Error("USDC_DECIMAL_PRECISION_INVALID");
  const [whole,fraction=""]=value.split(".");
  const amount=BigInt(whole)*1_000_000n+BigInt(fraction.padEnd(6,"0"));
  if(amount<=0n||amount>50_000n)throw Error("USDC_FOUNDER_MAX_PRICE_EXCEEDED");
  return amount.toString();
}
export type CapabilityPrice=Readonly<{
  version:typeof GEOMACRO_CAPABILITY_PRICING_VERSION;
  capability:PricedCapability;
  variant:string;
  amount_usdc:string;
  amount_atomic:string;
  currency:"USDC";
  output_contract:"GEOMACRO_DERIVED_STRUCTURED_ONLY";
  included_signed_object_charge:"INCLUDED_NO_DOUBLE_CHARGE"|"NOT_APPLICABLE";
}>;
export function resolveGeomacroCapabilityPrice(capability:string,variant:string):CapabilityPrice{
  if(!Object.hasOwn(GEOMACRO_CAPABILITY_PRICES,capability))
    throw Error("CAPABILITY_NOT_IN_FOUNDER_SCHEDULE");
  const options=GEOMACRO_CAPABILITY_PRICES[capability as PricedCapability] as Record<string,string>;
  if(!Object.hasOwn(options,variant))throw Error("CAPABILITY_PRICE_VARIANT_NOT_APPROVED");
  const amount_usdc=options[variant];
  return Object.freeze({
    version:GEOMACRO_CAPABILITY_PRICING_VERSION,
    capability:capability as PricedCapability,variant,
    amount_usdc,amount_atomic:usdcDecimalToAtomic(amount_usdc),
    currency:"USDC" as const,
    output_contract:"GEOMACRO_DERIVED_STRUCTURED_ONLY" as const,
    included_signed_object_charge:capability==="risk_gate_bundle"?
      "INCLUDED_NO_DOUBLE_CHARGE" as const:"NOT_APPLICABLE" as const,
  });
}

export function capabilityPricingCatalog(){
  return (Object.entries(GEOMACRO_CAPABILITY_PRICES) as
    [PricedCapability,Record<string,string>][]).map(([capability,variants])=>({
      capability,variants:Object.keys(variants).map(variant=>
        resolveGeomacroCapabilityPrice(capability,variant)),
      // A published price schedule alone does not verify an available product.
      availability:"CHECK_LIVE_PROOF_BEFORE_PAYMENT" as const,
      launch_status:publicCapabilityLaunchStatus(capability),
      new_sales_allowed:publicCapabilityNewSalesAllowed(capability),
    }));
}

/** Active Store / API / Agent offerings; NOT a rewrite of past USDC prices. */
export function publicCapabilityPricingCatalog(){
  return capabilityPricingCatalog().filter(row=>isPublicStoreCapability(row.capability));
}
export const GEOMACRO_PUBLIC_PRICING_GROUPS = GEOMACRO_PRICING_GROUPS
  .filter(group=>group.ids.some(id=>isPublicStoreCapability(id)))
  .map(group=>({...group,ids:group.ids.filter(id=>isPublicStoreCapability(id))}));
