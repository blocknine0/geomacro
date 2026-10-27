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

/** Topic-specific, cautiously worded implications. Never invent market moves
 * or the outcome of a policy/announcement. Event facts stay in What changed. */
const FOCUS:Record<StatelessCategory,ReadonlyArray<[RegExp,string]>>={
 geopolitics:[
  [/sanction|embargo|trade restriction/iu,"Sanctions or trade restrictions may change which counterparties and transactions need screening. The effective scope still needs checking."],
  [/ceasefire|peace|conflict|security|military/iu,"The reported development is relevant to conflict and security monitoring. It does not establish a change in conditions on the ground."],
  [/diplomac|foreign policy|international trade/iu,"The stated policy action may affect diplomatic or cross-border operating conditions. Practical implementation is not yet established."],
 ],
 macro:[
  [/inflation|prices|consumer price/iu,"The announcement affects the inflation data or policy outlook being monitored. No FX or interest-rate response is implied without market evidence."],
  [/interest rate|monetary|central bank/iu,"The stated monetary-policy action matters to rate and currency exposure. The actual market response requires separate price data."],
  [/trade|export|fiscal|debt/iu,"The stated trade or fiscal measure changes the monitored policy context. Its size and FX impact require independently checked figures."],
  [/employment|gdp|growth|economic|financial/iu,"The reported indicator or policy action informs the macro outlook. Its direction and magnitude must come from confirmed numerical data."],
 ],
 rare_earth:[
  [/export|restriction|control/iu,"The announced measure is relevant to mineral supply access and trade controls. A shipment or price impact has not been established."],
  [/mining|mine|deposit|exploration|project/iu,"The development concerns mineral project progress. It does not establish commercial production, output or a completion date."],
  [/processing|refining|supply|critical|mineral|rare.earth/iu,"The action is relevant to critical-mineral supply chains. Available volumes and delivery timelines are not confirmed by the announcement."],
 ],
};
export function concreteGeomacroAnalysis(s:StatelessIntelligenceSignal):string{
 const text=s.topic+" "+s.title+" "+s.what_changed;
 return FOCUS[s.category].find(([rule])=>rule.test(text))?.[1]??s.why_it_matters;
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
