import type {StatelessIntelligenceSignal,StatelessCategory} from "./stateless-intelligence-model";
import type {FindCardV1} from "./find-card-v1";
import {intelligenceActorHeadline,intelligenceActorChange} from "./public-intelligence-actor-copy";

/**
 * Strict public presentation gate shared by the Intelligence desk and homepage.
 * Keep all evidence (including rejected/unverified intake) in the existing
 * protected ingest path. Showing no card is preferable to an invented event.
 * Mandatory issuer credits are displayed with official-release cards rather
 * than dropping genuine evidence. Missing credit grants no commercial rights.
 */
const GENERIC=/\b(?:publisher candidate|source.feed observation|unverified|not specified|not established|unclassified|an official publisher|feed contains a dated item|original release concerns|publication concerns|monitoring topic)\b/iu;
// Credits preserved from the D1 derived-news schema. The desk renders the
// mandatory credits on each card. The source-neutral homepage Find adapter
// separately refuses ANY credited card, so it cannot silently strip attribution.
const REQUIRED_VISIBLE_CREDIT=/Open Government Licence|\bWTO news\b|Statistics Canada|UN News|United Nations|United Nations Office at Geneva|\bBeehive\b|Natural Resources Canada|Eurostat|European Commission|Council of the European Union|European Parliament|\bCC BY\b|Creative Commons Attribution/iu;
const ACTOR_ACTION=/\b(?:announced|approved|authorized|authorised|urged|warned|called for|appealed for|introduced|launched|cut|raised|lowered|increased|reduced|reported|imposed|proposed|signed|rejected|denied|supported|supports|opened|published|issued|unveiled|condemned|agreed|confirmed|released|releases|maintained|maintains|kept|holds|held|left|leaves|forecast|forecasts|projected|projects|revised|revises|estimated|estimates|recorded|records|sets|announces|approves|urges|warns|reports|says|said|told|issued|launches|supports|calls for|condemns|concludes|released|was approved|warn|urge|announce|approve|report|support|condemn|sign|raise|lower|reduce|increase|appeal|call for|launch|impose|propose)\b/iu;
const NOT_ACTOR=/^(?:new|official|publisher|geopolitical|macro|macroeconomic|critical|minerals?|source|trade|policy|interest|market|risk|release|announcement|warning|call|update|reports?|feeds?|unverified|inflation|gdp|prices?|employment|unemployment|interest rates?|consumer|economic data|finance)\b/iu;

/** Stable derived publisher-release headline only; never substitute a feed
 * hostname for the grammatical actor or imply verification of an outcome. */
export function concreteIntelligenceHeadline(s:StatelessIntelligenceSignal):string|null{
 const actorFirst=intelligenceActorHeadline(s);
 if(!actorFirst.startsWith("Actor not verified:"))return actorFirst;
 const title=s.title.replace(/^Geomacro finds\s+/iu,"").trim();
 const changed=s.what_changed.trim();
 if(title.length<24||title.length>200||NOT_ACTOR.test(title)||
    /\b(?:publisher candidate|source.feed observation|unverified|not verified|topic unverified)\b/iu.test(title+changed)||
    /[<>]|https?:\/\//iu.test(title+changed)||
    !ACTOR_ACTION.test(title)||!ACTOR_ACTION.test(changed))return null;
 // Derived titles are authored by a bounded named actor/action extractor,
 // but some genuine actor/action formulations have equivalent (not byte-identical)
 // first clauses in the recorded What changed.
 const verb=ACTOR_ACTION.exec(title);
 if(!verb||verb.index<3||verb.index>85)return null;
 const actor=title.slice(0,verb.index).trim();
 if(NOT_ACTOR.test(actor)||actor.split(/\s+/u).length>9||
    !/^[\p{Lu}][\p{L}\p{N}'.,\- ]+$/u.test(actor))return null;
 // The published change must mention the same actor; no inferred issuer credit.
 const key=actor.replace(/^The\s+/iu,"").toLocaleLowerCase();
 const hay=changed.toLocaleLowerCase();
 if(!hay.includes(key)&&!key.split(/\s+/u).filter(w=>w.length>=5).some(w=>hay.includes(w)))
   return null;
 return title;
}
/** Exact credit already retained by the derived D1 journal, never fetched
 * from the upstream body. These are *display acknowledgements*, not a licence
 * grant, independently verified issuer, source permalink or payment proof. */
export function intelligenceRequiredSourceCredits(s:StatelessIntelligenceSignal):string[]{
 if(s?.status!=="official_release_observed_unscored"||
    !Array.isArray(s.sources_credited))return [];
 return s.sources_credited.filter(credit=>typeof credit==="string"&&
   credit.length<=230&&REQUIRED_VISIBLE_CREDIT.test(credit));
}
export type IntelligenceDisplayRejection =
 "INVALID_STATE_OR_CREDIT"|"UNVERIFIED_ORIGINAL_SOURCE"|"UNKNOWN_ACTOR_OR_ACTION"|
 "GENERIC_OR_UNSAFE_COPY"|"INVALID_PUBLICATION_DATE"|null;

/** Mutually exclusive, stable reason for every public D1 story; no original
 * titles or URLs are returned to the caller or written to diagnostics. */
export function intelligenceDisplayRejection(s:StatelessIntelligenceSignal):IntelligenceDisplayRejection{
 if(!s||!["official_release_observed_unscored","osint_feed_observed_unverified"].includes(s.status)||
    !["geopolitics","macro","rare_earth"].includes(s.category)||
    !Array.isArray(s.sources_credited)||s.sources_credited.length>2||
    s.sources_credited.some(credit=>typeof credit!=="string"||
      credit.length>230||/[<>]|https?:\/\//iu.test(credit))||
    s.severity!==null||s.same_event_corrob_verified!==false)
   return "INVALID_STATE_OR_CREDIT";
 // Feed hostname is not the actual government/IGO original publisher credit.
 // Do not downgrade a first-party feed to a fake source-reported no-credit card.
 if(s.status==="osint_feed_observed_unverified"&&
   (s.development_type!=="unverified OSINT feed observation"||
    s.sources_credited.length!==1||
    !s.sources_credited[0].startsWith("Monitored feed: ")||
    /(?:news\.un\.org|press\.un\.org|gov\.uk|wto\.org|statcan\.gc\.ca|beehive\.govt\.nz|europa\.eu)/iu.test(s.sources_credited[0])))
   return "UNVERIFIED_ORIGINAL_SOURCE";
 const headline=concreteIntelligenceHeadline(s),change=intelligenceActorChange(s);
 if(!headline)return "UNKNOWN_ACTOR_OR_ACTION";
 if(headline.length<18||headline.length>220||change.length<30||change.length>650||
    GENERIC.test(headline)||GENERIC.test(change)||GENERIC.test(s.topic)||
    /https?:\/\/|www\.|[<>]/iu.test(headline+change)||
    !ACTOR_ACTION.test(headline+" "+change))
   return "GENERIC_OR_UNSAFE_COPY";
 const ms=Date.parse(s.published_at);
 if(!Number.isFinite(ms)||!s.title.startsWith("Geomacro finds ")||
   typeof s.why_it_matters!=="string"||s.why_it_matters.length<30)
   return "INVALID_PUBLICATION_DATE";
 return null;
}
export function isConcretePublicIntelligence(s:StatelessIntelligenceSignal):boolean{
 return intelligenceDisplayRejection(s)===null;
}

/**
 * News-specific explanatory watchpoints. Formerly each broad keyword returned
 * identical prose; now the verified display headline anchors every explanation
 * and narrower event patterns select an appropriate mechanism and limitation.
 * No new data fetches, model calls, risk scores or provenance promotions.
 */
type EventFocus=Readonly<{rule:RegExp;impact:string;limit:string}>;
const EVENT_FOCUS:Record<StatelessCategory,readonly EventFocus[]>={
 geopolitics:[
  {rule:/\b(?:elections?|electoral|ballots?|voting|votes?|democra\w*)\b/iu,
   impact:"the watchpoints are political legitimacy narratives, official reactions and possible diplomatic friction.",
   limit:"A public statement does not independently establish electoral misconduct or a changed result."},
  {rule:/\b(?:MSF|Médecins Sans Frontières|doctors without borders|aid workers?|humanitarian|relief|darfur|refugees?|medical teams?|civilian protection)\b/iu,
   impact:"the operational exposure is safety of relief workers and continuity of access to affected communities.",
   limit:"The reported appeal does not prove that new protections were implemented or access improved."},
  {rule:/\b(?:sanctions?|embargo(?:es)?|asset freezes?|trade restrictions?)\b/iu,
   impact:"the practical questions are which entities, transactions and trade routes would be covered.",
   limit:"Enforceability, effective dates and compliance duties need a confirmed policy text."},
  {rule:/\b(?:ceasefire|peace talks?|peace agreement|truce|hostage|prisoner exchange)\b/iu,
   impact:"the watchpoint is whether negotiating parties implement terms and whether access and safety conditions change.",
   limit:"A statement about talks does not prove hostilities have stopped."},
  {rule:/\b(?:shipping|strait|hormuz|red sea|port|maritime|vessel|sea lane|border crossing)\b/iu,
   impact:"the relevant exposure is passage across trade routes and continuity of freight.",
   limit:"A closure, delay or freight-price increase has not been established by this report."},
  {rule:/\b(?:tariffs?|trade agreement|trade policy|export ban|import ban)\b/iu,
   impact:"the decision-relevant channels are market access and trading-partner exposure.",
   limit:"Implementation and commercial magnitude require corroborated policy detail."},
  {rule:/\b(?:diplomac\w*|ambassador|foreign minister|bilateral|summit|treaty|negotiat\w*)\b/iu,
   impact:"the watchpoint is whether public remarks result in formal diplomatic or cross-border policy steps.",
   limit:"Statements alone do not change enforceable rules or treaty terms."},
  {rule:/\b(?:security|military|conflict|attack|strikes?|violence|war|armed|troops?|missiles?|drones?)\b/iu,
   impact:"the exposures to monitor are civilian safety, operating continuity and regional access.",
   limit:"This observation alone does not confirm changed conditions on the ground."},
 ],
 macro:[
  {rule:/\b(?:inflation|consumer prices?|CPI|producer prices?|PPI|cost of living)\b/iu,
   impact:"the economic channel is purchasing-power pressure and its relevance to monetary-policy expectations.",
   limit:"An announcement does not establish an inflation figure or a currency-market move."},
  {rule:/\b(?:interest rates?|policy rates?|central bank|federal reserve|FOMC|monetary|rate cut|rate hike)\b/iu,
   impact:"the channels to monitor are borrowing costs, rate differentials and currency exposure.",
   limit:"An FX or bond-price response needs separate observed market data."},
  {rule:/\b(?:jobs?|employment|unemployment|payrolls?|wages?|labou?r force|hiring)\b/iu,
   impact:"the relevant indicators are labour demand, household income and the policy outlook.",
   limit:"Direction and scale require the released statistics and comparison period."},
  {rule:/\b(?:GDP|gross domestic product|economic growth|recession|industrial production|manufacturing)\b/iu,
   impact:"the watchpoint is whether activity signals stronger or weaker output and demand.",
   limit:"No growth direction or magnitude follows without period-specific figures."},
  {rule:/\b(?:tariffs?|exports?|imports?|trade balance|customs|trade deficit)\b/iu,
   impact:"transmission channels include import costs, external balances and cross-border commerce.",
   limit:"The report is not proof of an implemented measure or a measurable FX effect."},
  {rule:/\b(?:currency|exchange rates?|foreign.exchange|FX|reserves?|capital flows?|balance of payments?)\b/iu,
   impact:"the exposure to monitor is currency liquidity and external funding conditions.",
   limit:"No directional currency forecast follows from the report alone."},
  {rule:/\b(?:gold|silver|precious metals?|bullion)\b/iu,
   impact:"the relevant channels are real rates, currency conditions and demand for precious metals.",
   limit:"Metal-price direction needs current market evidence."},
  {rule:/\b(?:energy|oil|gas|electricity|fuel|OPEC)\b/iu,
   impact:"the transmission channel is through energy costs, inflation and external balances.",
   limit:"Neither a supply disruption nor a price move is established by the headline."},
  {rule:/\b(?:debt|budget|tax|fiscal|government spending|treasury|bond)\b/iu,
   impact:"the watchpoints are fiscal capacity, financing needs and borrowing conditions.",
   limit:"Amounts and yield effects require verified figures."},
 ],
 rare_earth:[
  {rule:/\b(?:export controls?|export bans?|export restrictions?|licen[cs]ing|trade bans?|quotas?|tariffs?)\b/iu,
   impact:"the key question is which materials, jurisdictions and shipments face possible access restrictions.",
   limit:"A reported control does not establish a delayed cargo or commodity-price change."},
  {rule:/\b(?:refining|refiner\w*|processing|separation|smelting|magnets?|recycling)\b/iu,
   impact:"the capacity to watch is downstream conversion of raw material into usable industrial inputs.",
   limit:"Planned capacity is not verified operating throughput or delivered material."},
  {rule:/\b(?:mine|mining|exploration|deposit|discovery|drilling|resource estimate)\b/iu,
   impact:"the long-run question is whether the resource or project advances toward viable production.",
   limit:"The announcement does not prove recoverable reserves, output or a start date."},
  {rule:/\b(?:lithium|cobalt|nickel|graphite|battery)\b/iu,
   impact:"the exposure to monitor is battery-material sourcing and processing-chain concentration.",
   limit:"Available battery-grade supply or near-term pricing is not quantified here."},
  {rule:/\b(?:rare.earth|neodymium|dysprosium|terbium|gallium|germanium|tungsten|antimony)\b/iu,
   impact:"the dependency is access to strategic inputs for manufacturing and advanced technology.",
   limit:"The report does not verify changes in physical supply."},
  {rule:/\b(?:investment|funding|partnership|agreement|strateg\w*|supply chains?)\b/iu,
   impact:"the watchpoint is whether financing or cooperation leads to reliable new sourcing.",
   limit:"A commitment is not a completed facility or delivered tonnage."},
 ],
};
const EVENT_FALLBACK:Record<StatelessCategory,Readonly<{impact:string;limit:string}>>={
 geopolitics:{impact:"the next evidence to watch is the specific policy, security or diplomatic response.",
  limit:"The observation does not establish an implemented change or measured effect."},
 macro:{impact:"the next evidence to check is the affected indicator, economic channel and reporting period.",
  limit:"Market direction and size of the impact need verified figures."},
 rare_earth:{impact:"the next evidence to check is the affected material, supply-chain stage and geography.",
  limit:"Neither added output nor a disruption is established by the observation."},
};
export function concreteGeomacroAnalysis(s:StatelessIntelligenceSignal):string{
 const headline=concreteIntelligenceHeadline(s);
 // Rejected/anonymous statements must never acquire an invented actor.
 if(!headline)return s.why_it_matters;
 const event=headline.replace(/[.!?]+$/u,"").trim();
 const text=event+" "+intelligenceActorChange(s);
 const focus=EVENT_FOCUS[s.category].find(item=>item.rule.test(text))
   ??EVENT_FOCUS[s.category].find(item=>item.rule.test(s.topic))
   ??EVENT_FALLBACK[s.category];
 const prefix=s.status==="osint_feed_observed_unverified"
   ?"For the independently unverified report":"For the dated release";
 return prefix+" “"+event+"”, "+focus.impact+" "+focus.limit;
}

/** Source-neutral homepage Finds must have an explicit, concrete action. */
export function isConcreteHomeFind(card:FindCardV1):boolean{
 if(!card||!["geopolitics","macro","rare_earth"].includes(card.domain))return false;
 const headline=card.headline,change=card.what_changed;
 return typeof headline==="string"&&typeof change==="string"&&
   headline.length>=22&&change.length>=30&&
   !GENERIC.test(headline+" "+change)&&
   !/Actor not verified|no outcome is inferred|not establish who|publisher|original.dated publication/iu.test(headline+" "+change)&&
   ACTOR_ACTION.test(headline+" "+change);
}
