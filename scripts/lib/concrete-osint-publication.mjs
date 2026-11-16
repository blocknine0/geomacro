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
  return [name,new RegExp(`(?<![\\p{L}])(?:${[name,...(countryAliases[iso3]??[])].map(escapeRegExp).join("|")})(?![\\p{L}])`,"iu")];
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
  if (/\b(?:affecting|faces? (?:new )?(?:restrictions?|controls?|curbs?))\b/u.test(text)) return "Reported Exposure to Supply Constraints";
  if (/\b(?:called for|appealed for|urged|warned)\b/u.test(text)) return "Policy Warning or Appeal";
  if (/\b(?:approved|authorized|authorised|adopted)\b/u.test(text)) return "Approval or Authorization";
  if (/\b(?:cut|lowered|reduced)\b/u.test(text)) return "Reported Reduction";
  if (/\b(?:raised|increased|hiked)\b/u.test(text)) return "Reported Increase";
  if (/\b(?:proposed|plans to|is considering)\b/u.test(text)) return "Proposal Under Review";
  if (/\b(?:announced|issued|introduced|imposed|launched|published|released|confirmed)\b/u.test(text)) return "Reported Policy or Operating Action";
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

export function concreteOsintPublication({category, title: rawTitle, event}) {
  const title = clean(rawTitle, 250);
  const transformedHeadline = clean(event?.headline, 210);
  const changed = clean(event?.change, 500);
  const normalizeWords=value=>value.toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu," ").trim();
  if (!title || !transformedHeadline || changed.length < 30 ||
      normalizeWords(title) === normalizeWords(transformedHeadline) ||
      normalizeWords(title) === normalizeWords(changed) ||
      !["geopolitics", "macro", "rare_earth"].includes(category)) return null;
  const matchedLocation = CORRIDORS.find(([, pattern]) => pattern.test(title));
  const country = LOCATIONS.find(([, pattern]) => pattern.test(title));
  if (!matchedLocation && !country) return null;
  const location = matchedLocation?.[0] ?? country?.[0];
  const subject = SUBJECTS.find(([pattern]) => pattern.test(title))?.[1];
  if (!subject) return null;
  const action = actionLabel(transformedHeadline + " " + changed);
  const market = marketChannel(category, subject, location);
  const titleText = `${subject} · ${action} — ${location}`;
  const what = `Unverified feed observation: ${changed}`;
  const why = `Risk: ${action.toLocaleLowerCase()} affecting ${subject.toLocaleLowerCase()} in ${location}. Effect: ${operationalEffect(category, subject, location)} if the report is confirmed. Price channel to monitor: ${market}. Action Posture: REQUIRE_APPROVAL; no independent corroboration or price move is asserted.`;
  if (titleText.length > 220 || what.length > 650 || why.length > 700 ||
      titleText.toLocaleLowerCase() === title.toLocaleLowerCase()) return null;
  return {title: `Geomacro finds ${titleText}`, what_changed: what, why_it_matters: why,
    topic: subject, geography: location};
}
