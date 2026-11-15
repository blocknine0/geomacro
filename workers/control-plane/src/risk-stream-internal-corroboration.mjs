const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const SOURCES=new Set(["PRIVATE_OSINT","TELEGRAM_WATCH","DERIVED_BASELINE"]);
const EVENTS=Object.freeze([
 ["CONFLICT",/\b(?:war|armed conflict|invasion|missile strike|attack|clashes)\b/iu],
 ["SANCTIONS",/\bsanctions?\b/iu],
 ["EXPORT_RESTRICTION",/\b(?:export ban|export control|trade restriction)\b/iu],
 ["CHOKEPOINT_DISRUPTION",/\b(?:chokepoint|strait closure|canal disruption|shipping disruption)\b/iu],
 ["FX_SOVEREIGN_STRESS",/\b(?:fx stress|currency crisis|sovereign stress|debt distress|default)\b/iu],
 ["MINERAL_SUPPLY_SHOCK",/\b(?:critical mineral|rare earth|lithium|cobalt|nickel|graphite|mine closure)\b/iu]
]);
const LIMITS={text:8000,weight:100,corridors:12};
const fail=()=>{throw Error("RISK_STREAM_INTERNAL_CORROBORATION_INVALID")};

/** Require a private/watch observation to match the primary event class. */
export function riskStreamInternalEventMatches(category,primaryText,eventCode){
 const text=String(primaryText??"");
 const rules=category==="GEOPOLITICS"?[
  [/\b(?:war|armed conflict|invasion|missile strike|attack|clashes)\b/iu,"CONFLICT"],
  [/\bsanctions?\b/iu,"SANCTIONS"],
  [/\b(?:export ban|export control|trade restriction)\b/iu,"EXPORT_RESTRICTION"],
  [/\b(?:chokepoint|strait closure|canal disruption|shipping disruption)\b/iu,"CHOKEPOINT_DISRUPTION"]
 ]:category==="MACRO_FX"?[
  [/\b(?:fx stress|currency crisis|sovereign stress|debt distress|default)\b/iu,"FX_SOVEREIGN_STRESS"],
  [/\b(?:inflation|cpi surge|price shock|interest rate|monetary policy|central bank rate)\b/iu,"MACRO_POLICY_STRESS"]
 ]:category==="CRITICAL_MINERALS"?[
  [/\b(?:critical mineral supply shock|rare earth supply shock|mine closure)\b/iu,"MINERAL_SUPPLY_SHOCK"],
  [/\b(?:export ban|export control|trade restriction)\b/iu,"EXPORT_RESTRICTION"],
  [/\b(?:chokepoint|strait closure|canal disruption|shipping disruption)\b/iu,"CHOKEPOINT_DISRUPTION"],
  [/\b(?:critical mineral|rare earth|lithium|cobalt|nickel|graphite)\b/iu,"MINERAL_SUPPLY_SHOCK"]
 ]:[];
 const expected=rules.find(([pattern])=>pattern.test(text))?.[1];
 const normalized=eventCode==="EXPORT_BAN"?"EXPORT_RESTRICTION":eventCode;
 return Boolean(expected&&expected===normalized);
}

/** Reduce private/watch text to a closed set of signed numeric and enum features. */
export function normalizeRiskStreamInternalCorroboration(input={}){
 const source=input.source_kind,category=input.category,country=input.country_iso3;
 if(!SOURCES.has(source)||!CATEGORIES.has(category)||! /^[A-Z]{3}$/u.test(country??""))fail();
 const raw=typeof input.text==="string"?input.text.slice(0,LIMITS.text):"";
 const event=EVENTS.find(([,pattern])=>pattern.test(raw))?.[0]??"GENERAL_RISK_SIGNAL";
 const severity=Number(input.severity_weight);
 const corroboration=Number(input.corroboration_weight);
 const corridors=input.corridors??[];
 if(!Number.isFinite(severity)||severity<0||severity>LIMITS.weight||
    !Number.isFinite(corroboration)||corroboration<0||corroboration>1||
    !Array.isArray(corridors)||corridors.length>LIMITS.corridors||
    corridors.some(x=>typeof x!=="string"||! /^[A-Z]{3}>[A-Z]{3}$/u.test(x)))fail();
 return Object.freeze({schema:"geomacro.risk-stream-internal-corroboration.v1",
  country_iso3:country,category,event_code:event,
  severity_weight_0_100:Number(severity.toFixed(2)),
  corroboration_weight_0_1:Number(corroboration.toFixed(3)),
  origin_kind:source,corridors:[...new Set(corridors)].sort(),raw_source_redacted:true});
}

export function isRiskStreamInternalCorroboration(value){
 return value?.schema==="geomacro.risk-stream-internal-corroboration.v1"&&
  SOURCES.has(value.origin_kind)&&CATEGORIES.has(value.category)&&
  /^[A-Z]{3}$/u.test(value.country_iso3??"")&&
  typeof value.event_code==="string"&&/^[A-Z_]{3,40}$/u.test(value.event_code)&&
  Number.isFinite(value.severity_weight_0_100)&&value.severity_weight_0_100>=0&&
  value.severity_weight_0_100<=100&&Number.isFinite(value.corroboration_weight_0_1)&&
  value.corroboration_weight_0_1>=0&&value.corroboration_weight_0_1<=1&&
  Array.isArray(value.corridors)&&value.corridors.length<=LIMITS.corridors&&
  value.corridors.every(x=>typeof x==="string"&&/^[A-Z]{3}>[A-Z]{3}$/u.test(x))&&
  value.raw_source_redacted===true&&
  !JSON.stringify(value).match(/https?:\/\/|www\.|headline|publisher|channel|telegram_username|"text"/iu);
}

export function summarizeRiskStreamInternalCorroboration(values=[]){
 if(!Array.isArray(values)||values.length>12||values.some(x=>!isRiskStreamInternalCorroboration(x)))fail();
 const families=[...new Set(values.map(x=>x.origin_kind))].sort();
 const categories=[...new Set(values.map(x=>x.category))].sort();
 const corridors=[...new Set(values.flatMap(x=>x.corridors))].sort();
 return Object.freeze({signal_count:values.length,families,categories,corridors,
  max_severity_weight_0_100:values.length?Math.max(...values.map(x=>x.severity_weight_0_100)):0,
  max_corroboration_weight_0_1:values.length?Math.max(...values.map(x=>x.corroboration_weight_0_1)):0,
  raw_source_redacted:true});
}
