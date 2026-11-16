import {readFileSync} from "node:fs";

/**
 * Turn an ephemeral publisher title into a source-neutral watch finding.
 * This is a deterministic projection, not verification or scoring. It only
 * emits when a named country/corridor, subject, and transformed action exist.
 */
const countrySource=readFileSync(new URL("../../src/lib/canonical-country-registry-195.ts",import.meta.url),"utf8");
const countryRows=/const COUNTRY_ROWS=`([\s\S]*?)`;/u.exec(countrySource)?.[1];
if(!countryRows)throw Error("CONCRETE_OSINT_COUNTRY_REGISTRY_UNAVAILABLE");
const countryAliases={USA:["United States of America","U.S.","USA"],GBR:["Britain","Great Britain","UK","U.K."],
  AUS:["Australian"],
  RUS:["Russian Federation"],IRN:["Islamic Republic of Iran"],KOR:["Republic of Korea","South Korea"],
  PRK:["Democratic People's Republic of Korea","North Korea","DPR Korea"],COD:["DR Congo","DRC","Congo-Kinshasa"],
  COG:["Congo-Brazzaville"],CZE:["Czech Republic"],TUR:["Turkey"],VNM:["Viet Nam"],MMR:["Burma"]};
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&");
const LOCATIONS=countryRows.trim().split("\n").map(row=>{
  const [iso3,,name]=row.split("|");
  return [iso3,name,new RegExp(`(?<![\\p{L}])(?:${[name,...(countryAliases[iso3]??[])].map(escapeRegExp).join("|")})(?![\\p{L}])`,"iu")];
});
const CORRIDORS = [
  ["Red Sea Maritime Corridor", /\b(?:Red Sea|Bab el[- ]?Mandeb|Suez Canal)\b/iu],
  ["Strait of Hormuz Maritime Corridor", /\b(?:Strait of Hormuz|Hormuz)\b/iu],
  ["Taiwan Strait Corridor", /\bTaiwan Strait\b/iu],
  ["Panama Canal Corridor", /\bPanama Canal\b/iu],
  ["Black Sea Corridor", /\bBlack Sea\b/iu],
  ["Persian Gulf Corridor", /\bPersian Gulf\b/iu],
  ["English Channel Corridor", /\bEnglish Channel\b/iu],
];
const SUBJECTS = [
  [/\b(?:sanctions?|embargo|asset freeze)\b/iu, "Sanctions & Trade Restrictions"],
  [/\b(?:policy rate|interest rate|monetary policy|central bank|FOMC)\b/iu, "Monetary Policy & FX Liquidity"],
  [/\b(?:inflation|consumer prices?|CPI|price index)\b/iu, "Inflation & Consumer Prices"],
  [/\b(?:foreign exchange|exchange rate|currency|FX|reserves?)\b/iu, "Currency & External Balances"],
  [/\b(?:copper)\b/iu, "Copper Supply & Processing"],
  [/\b(?:lithium)\b/iu, "Lithium & Battery-Grade Supply"],
  [/\b(?:nickel)\b/iu, "Nickel Supply & Processing"],
  [/\b(?:cobalt)\b/iu, "Cobalt & Battery-Grade Supply"],
  [/\b(?:graphite)\b/iu, "Graphite & Anode Supply"],
  [/\b(?:rare[- ]earth|neodymium|dysprosium|terbium)\b/iu, "Rare-Earth Supply & Processing"],
  [/\b(?:critical minerals?)\b/iu, "Critical-Mineral Supply & Processing"],
  [/\b(?:mine|mining|mineral project|refinery|smelter|processing)\b/iu, "Mining & Mineral Processing"],
  [/\b(?:shipping|tanker|freight|maritime|port|vessel)\b/iu, "Maritime Transit & Freight"],
  [/\b(?:ceasefire|conflict|security|military|missile|attack|diplomacy)\b/iu, "Security & Diplomatic Developments"],
  [/\b(?:trade|tariff|export|import)\b/iu, "Trade Policy & Market Access"],
];
const FX = new Map([["Japan", "USD/JPY"], ["United States", "DXY / U.S. rates"], ["United Kingdom", "GBP/USD"],
  ["China", "USD/CNH"], ["India", "USD/INR"], ["Canada", "USD/CAD"], ["Australia", "AUD/USD"],
  ["Switzerland", "USD/CHF"], ["South Korea", "USD/KRW"], ["Brazil", "USD/BRL"], ["Mexico", "USD/MXN"]]);

function clean(value, max) {
  return typeof value === "string" && !/[<>]|https?:\/\/|www\./iu.test(value)
    ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
}
function actionLabel(value) {
  const text = value.toLocaleLowerCase();
  if (/\b(?:interrupt(?:ed|s)?|disrupt(?:ed|s|ion)?|shortfall|outage|closure|halt(?:ed|s)?)\b/u.test(text)) return "Reported Supply or Operations Disruption";
  if (/\b(?:affecting|faces? (?:new )?(?:(?:export|trade|supply) )?(?:restrictions?|controls?|curbs?))\b/u.test(text)) return "Reported Exposure to Supply Constraints";
  if (/\b(?:called for|appealed for|urged|warned)\b/u.test(text)) return "Policy Warning or Appeal";
  if (/\b(?:approved|authorized|authorised|adopted)\b/u.test(text)) return "Approval or Authorization";
  if (/\b(?:cut|lowered|reduced)\b/u.test(text)) return "Reported Reduction";
  if (/\b(?:raised|increased|hiked)\b/u.test(text)) return "Reported Increase";
  if (/\b(?:proposed|plans to|is considering)\b/u.test(text)) return "Proposal Under Review";
  if (/\b(?:announce[sd]?|issue[sd]?|introduce[sd]?|impose[sd]?|launch(?:ed|es)?|publish(?:ed|es)?|release[sd]?|confirm(?:s|ed)?|implement(?:ed|s)?|update(?:s|d)?)\b/u.test(text)) return "Reported Policy or Operating Action";
  if (/\b(?:report(?:s|ed)?|discuss(?:es|ed)?|debat(?:e|es|ed)|review(?:s|ed)?)\b/u.test(text)) return "Reported Review or Discussion";
  if (/\b(?:figures?|data|statistics|index|release)\b/u.test(text)) return "Reported Indicator Update";
  return "Reported Development";
}
function marketChannel(category, subject, location) {
  if (category === "rare_earth") {
    if (/copper/iu.test(subject)) return "COMEX copper benchmark; concentrate treatment charges";
    if (/lithium/iu.test(subject)) return "battery-grade lithium carbonate benchmark";
    if (/nickel/iu.test(subject)) return "LME nickel benchmark";
    if (/cobalt/iu.test(subject)) return "cobalt metal and hydroxide benchmarks";
    if (/graphite/iu.test(subject)) return "battery-grade graphite and anode material benchmarks";
    return "relevant mineral benchmark and concentrate or processing charges";
  }
  if (category === "macro") return FX.get(location) ?? "local currency versus USD and sovereign yields";
  if (/Maritime|Corridor/iu.test(subject)) return "freight and marine insurance rates";
  return (FX.get(location) ?? "local currency versus USD") + "; sovereign spreads";
}
function operationalEffect(category, subject, location) {
  if (category === "rare_earth") return `buyers and processors may need to recheck ${subject.toLocaleLowerCase()} delivery timing, eligible suppliers and conversion capacity linked to ${location}`;
  if (/Maritime|Corridor/iu.test(subject)) return `vessel transit, port access and cargo insurance planning may need review for ${location}`;
  if (category === "macro") return `import settlement, funding costs and local-currency hedging may need review for ${location}`;
  return `cross-border operating permissions, counterparties and shipment planning may need review for ${location}`;
}

export function concreteOsintPublication({category, title: rawTitle, event,
  country_iso3:countryIsoHint=null,country_name:countryNameHint=null,
  corridor:corridorHint=null,event_direction:directionHint=null}) {
  const title = clean(rawTitle, 250);
  const transformedHeadline = clean(event?.headline, 210);
  const changed = clean(event?.change, 500);
  if (!title || !["geopolitics", "macro", "rare_earth"].includes(category)) return null;
  const matchedLocation = CORRIDORS.find(([, pattern]) => pattern.test(title));
  const country = LOCATIONS.find(([iso3]) => iso3===countryIsoHint) ??
    LOCATIONS.find(([, , pattern]) => pattern.test(title));
  if (!matchedLocation && !country && !countryNameHint) return null;
  const corridor = CORRIDORS.find(([label])=>label===corridorHint)?.[0] ?? matchedLocation?.[0] ?? null;
  const countryName = country?.[1] ?? (typeof countryNameHint==="string"&&/^[\p{Lu}][\p{L}\p{N} &'’.-]{1,70}$/u.test(countryNameHint)?countryNameHint:null);
  const iso3 = country?.[0] ?? null;
  if(!countryName||!iso3)return null;
  const location = countryName && corridor ? `${countryName} / ${corridor}` : countryName ?? corridor;
  const subject = SUBJECTS.find(([pattern]) => pattern.test(title))?.[1];
  if (!subject) return null;
  const action = actionLabel(`${title} ${transformedHeadline} ${changed}`);
  if(action==="Reported Development")return null;
  const market = marketChannel(category, subject, countryName ?? location);
  const allowedDirections=new Set(["tightening","easing","uncertain","rising","falling","disrupted","restored","expanded","contracted"]);
  const actionEvidence=`${title} ${transformedHeadline} ${changed}`;
  const direction = allowedDirections.has(directionHint) ? directionHint :
    /\b(?:discuss(?:es|ed)?|consider(?:s|ed)?|review(?:s|ed)?)\b/iu.test(actionEvidence) ? "uncertain" :
    /\b(?:impos(?:e|es|ed)|ban(?:s|ned)?|restrict(?:s|ed|ion)?|control(?:s|led|ling)?|suspend(?:s|ed)?|halt(?:s|ed)?|disrupt(?:s|ed|ion)?|attack(?:s|ed)?|clos(?:e|es|ed)|delay(?:s|ed)?|shortfall)\b/iu.test(actionEvidence) ? "tightening" :
    /reduce|cut|lower|declin|fall/iu.test(actionEvidence) ? "falling" :
    /restore|resume|lift|ease|expand|approve|advance/iu.test(actionEvidence) ? "easing" :
    /raise|increase|hike/iu.test(actionEvidence) ? "rising" :
    /Reported Exposure|Proposal Under Review|Policy Warning or Appeal/u.test(action) ? "tightening" :
    /Reported Reduction|Approval or Authorization/u.test(action) ? "easing" :
    /Reported Increase/u.test(action) ? "rising" : "uncertain";
  const actor = category === "geopolitics" ? "government and security actors" :
    category === "macro" ? "central-bank and FX-market actors" :
    "mine operators, mineral regulators and processors";
  const development = direction === "tightening" ? `${action.toLocaleLowerCase()} with tightening pressure` :
    direction === "easing" ? `${action.toLocaleLowerCase()} with easing pressure` :
    direction === "rising" ? `${action.toLocaleLowerCase()} with an upward shift` :
    direction === "falling" ? `${action.toLocaleLowerCase()} with a downward shift` :
    `${action.toLocaleLowerCase()} with direction not yet established`;
  const titleText = `GeoMacro ${category === "geopolitics" ? "Geopolitics" : category === "macro" ? "Macro/FX" : "Critical Minerals"} Brief · ${subject} — ${location}`;
  const what = `WHAT CHANGED: GeoMacro's dated transformation records a ${action.toLocaleLowerCase()} by ${actor}, affecting ${subject.toLocaleLowerCase()} in ${countryName}${corridor?` along the ${corridor}`:""}; direction is ${direction}.`;
  const why = `WHY IT MATTERS — Risk: ${direction} pressure on ${subject.toLocaleLowerCase()} in ${countryName ?? location} → Downstream effect: ${operationalEffect(category, subject, countryName ?? location)} → Price impact channel: ${market}. Action Posture: ${direction === "tightening" || direction === "rising" ? "REDUCE_LIMIT" : direction === "uncertain" ? "REQUIRE_APPROVAL" : "CONTINUE"}.`;
  if (titleText.length > 220 || what.length > 650 || why.length > 700 ||
      titleText.toLocaleLowerCase() === title.toLocaleLowerCase()) return null;
  return {title: titleText, what_changed: what, why_it_matters: why,
    topic: subject, geography: countryName, country_iso3: iso3,
    corridor, event_direction: direction,event_action:action};
}
