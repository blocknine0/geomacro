import watch from "../../../config/hot-50-three-domain-watch.v1.json" with { type: "json" };

const COUNTRY = new Set(watch.country_iso3);
const CATEGORY = new Map([
  ["GEOPOLITICS", "geopolitics"], ["geopolitics", "geopolitics"],
  ["MACRO", "macro"], ["MACRO_FX", "macro"], ["macro", "macro"],
  ["CRITICAL_MINERALS", "critical_minerals"],
  ["critical_minerals", "critical_minerals"], ["rare_earth", "critical_minerals"],
]);
const EVENTS = Object.freeze({
  conflict: /\b(conflict|war|attack|strike|clash|invasion|blockade|military escalation|armed forces|hostilities)\b/iu,
  sanctions: /\b(sanction(?:s|ed|ing)?|embargo|asset freeze|trade restriction)\b/iu,
  export_ban: /\b(export ban|export prohibition|export restriction|ban(?:ned|ning)? exports?)\b/iu,
  chokepoint: /\b(?:chokepoint|strait|canal|shipping lane|port)\b.{0,50}\b(?:disruption|closure|blockade|closed|halt|suspended|attack)\b|\b(?:disruption|closure|blockade|closed|halt|suspended|attack)\b.{0,50}\b(?:chokepoint|strait|canal|shipping lane|port)\b/iu,
  macro_stress: /\b(fx (?:stress|crisis|shortage|controls?)|foreign exchange (?:stress|crisis|shortage|shortfall)|currency (?:collapse|crisis|devaluation|plunge)|sovereign (?:stress|default|debt crisis)|bond (?:selloff|spread|crisis)|capital controls|reserve crisis)\b/iu,
  mineral_supply_shock: /\b(lithium|cobalt|nickel|graphite|rare earths?|critical minerals?|copper|uranium|manganese|platinum group)\b/iu,
  supply_disruption: /\b(supply (?:shock|disruption|shortage|cut)|mine closure|production halt|shipment halt|processing disruption|shortage|supply chain disruption)\b/iu,
});

export function isHot50RiskGateWatchCell(country_iso3, category_value) {
  const country=String(country_iso3??"").trim().toUpperCase();
  const category=CATEGORY.get(String(category_value??"").trim());
  return COUNTRY.has(country)&&watch.categories.includes(category);
}

export function hot50RiskGateWatchMatch(item = {}) {
  const country = String(item.country_iso3 ?? item.country ?? "").trim().toUpperCase();
  const category = CATEGORY.get(String(item.category ?? item.signal_category ?? "").trim());
  if (!isHot50RiskGateWatchCell(country, category))
    return Object.freeze({ accepted: false, reason: "OUTSIDE_HOT50_CELL", country_iso3: country, category });
  const text = [item.event_type, item.topic_code, item.event_signal, item.watch_event, item.headline, item.derived_summary]
    .filter(value => typeof value === "string").join(" ").replaceAll("_", " ");
  let event = null;
  if (category === "geopolitics") {
    if (EVENTS.conflict.test(text)) event = "conflict";
    else if (EVENTS.sanctions.test(text)) event = "sanctions";
    else if (EVENTS.export_ban.test(text)) event = "export_ban";
    else if (EVENTS.chokepoint.test(text)) event = "chokepoint_disruption";
  } else if (category === "macro") {
    if (EVENTS.macro_stress.test(text)) event = "fx_sovereign_stress";
  } else if (category === "critical_minerals" && EVENTS.mineral_supply_shock.test(text)) {
    if (EVENTS.supply_disruption.test(text) || EVENTS.export_ban.test(text) ||
        EVENTS.sanctions.test(text) || EVENTS.chokepoint.test(text) || EVENTS.conflict.test(text))
      event = "critical_mineral_supply_shock";
  }
  return Object.freeze({ accepted: event !== null,
    reason: event ? "HOT50_RISK_GATE_TRIGGER" : "NOT_RISK_GATE_EVENT",
    country_iso3: country, category, event });
}

export function isHot50RiskGateWatchItem(item) {
  return hot50RiskGateWatchMatch(item).accepted;
}

const COUNTRY_ALIASES = Object.freeze({
  USA:["United States","United States of America","USA"],
  CHN:["China","PRC"], IND:["India"], RUS:["Russia","Russian Federation"],
  GBR:["United Kingdom","UK","Britain","British"], DEU:["Germany","German"],
  FRA:["France","French"], JPN:["Japan","Japanese"],
  KOR:["South Korea","Republic of Korea","Korean Peninsula"], BEL:["Belgium"],
  CAN:["Canada","Canadian"], AUS:["Australia","Australian"], BRA:["Brazil","Brazilian"],
  MEX:["Mexico","Mexican"], ITA:["Italy","Italian"], ESP:["Spain","Spanish"],
  NLD:["Netherlands","Dutch"], CHE:["Switzerland","Swiss"], NOR:["Norway","Norwegian"],
  SWE:["Sweden","Swedish"], POL:["Poland","Polish"], UKR:["Ukraine","Ukrainian"],
  TUR:["Türkiye","Turkey","Turkish"], SAU:["Saudi Arabia","Saudi"],
  ARE:["United Arab Emirates","UAE","Emirates"], IRN:["Iran","Iranian"],
  ISR:["Israel","Israeli"], EGY:["Egypt","Egyptian"], QAT:["Qatar"], OMN:["Oman"],
  IRQ:["Iraq","Iraqi"], ZAF:["South Africa","South African"], NGA:["Nigeria","Nigerian"],
  COD:["Democratic Republic of the Congo","DR Congo","DRC"], ZMB:["Zambia","Zambian"],
  CHL:["Chile","Chilean"], PER:["Peru","Peruvian"], ARG:["Argentina","Argentine"],
  BOL:["Bolivia","Bolivian"], IDN:["Indonesia","Indonesian"], VNM:["Vietnam","Vietnamese"],
  THA:["Thailand","Thai"], MYS:["Malaysia","Malaysian"], SGP:["Singapore","Singaporean"],
  PHL:["Philippines","Filipino"], PAK:["Pakistan","Pakistani"],
  BGD:["Bangladesh","Bangladeshi"], KAZ:["Kazakhstan","Kazakh"],
  MNG:["Mongolia","Mongolian"], MMR:["Myanmar","Burma","Burmese"],
});
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&");
export function classifyHot50TelegramText(value) {
  if(typeof value!=="string"||!value.trim()||value.length>16_384)return null;
  const text=value.slice(0,8_192);
  const countries=Object.entries(COUNTRY_ALIASES).filter(([,aliases])=>
    aliases.some(alias=>new RegExp("(^|[^\\p{L}])"+escapeRegExp(alias)+"(?=$|[^\\p{L}])","iu").test(text))
  ).map(([country_iso3])=>country_iso3);
  for(const country_iso3 of countries){
    for(const category of ["critical_minerals","macro","geopolitics"]){
      const result=hot50RiskGateWatchMatch({country_iso3,category,headline:text});
      if(result.accepted)return result;
    }
  }
  return null;
}
