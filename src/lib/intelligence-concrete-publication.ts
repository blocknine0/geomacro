import type {StatelessIntelligenceSignal,StatelessCategory} from "./stateless-intelligence-model";
import type {FindCardV1} from "./find-card-v1";
import {intelligenceActorHeadline,intelligenceActorChange} from "./public-intelligence-actor-copy";

/**
 * Strict public presentation gate shared by the Intelligence desk and homepage.
 * Keep all evidence (including rejected/unverified intake) in the existing
 * protected ingest path. Showing no card is preferable to an invented event.
 * Sources with mandatory public credits are not eligible for an attribution-
 * free card. Missing credit is not itself a grant of commercial re-use.
 */
const GENERIC=/\b(?:publisher candidate|source.feed observation|unverified|not specified|not established|unclassified|an official publisher|feed contains a dated item|original release concerns|publication concerns|monitoring topic)\b/iu;
// A display credit is not proof that an attribution licence is waived. Keep
// sources whose licence explicitly requires public credit OUT of a source-hidden
// card, even though their releases remain in the private/source-linked journal.
const REQUIRED_VISIBLE_CREDIT=/Open Government Licence|\bWTO news\b|Statistics Canada|UN News|United Nations|United Nations Office at Geneva|\bBeehive\b|Natural Resources Canada|Eurostat|European Commission|Council of the European Union|European Parliament|\bCC BY\b|Creative Commons Attribution/iu;
const ACTOR_ACTION=/\b(?:announced|approved|authorized|authorised|urged|warned|called for|appealed for|introduced|launched|cut|raised|lowered|increased|reduced|reported|imposed|proposed|signed|rejected|denied|supported|supports|opened|published|issued|unveiled|condemned|agreed|confirmed)\b/iu;
const NOT_ACTOR=/^(?:new|official|publisher|geopolitical|macro|macroeconomic|critical|minerals?|source|trade|policy|interest|market|risk|release|announcement|warning|call|update|reports?|feeds?|unverified)\b/iu;

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
const TOPIC_SENSITIVE=/\b(?:alleged|allegation|reported|announced|urged|warned|proposed|planned|rejected|approved|agreed|cut|raised|increased|signed|supported|supports|launched|issued|imposed|introduced|lowered|reduced|published|opened|unveiled|denied|confirmed|condemned|authorized|authorised|agreed)\b/iu;
export function isConcretePublicIntelligence(s:StatelessIntelligenceSignal):boolean{
 if(!s||s.status!=="official_release_observed_unscored"||
    !["geopolitics","macro","rare_earth"].includes(s.category)||
    !Array.isArray(s.sources_credited)||s.sources_credited.length>2||
    s.sources_credited.some(credit=>typeof credit!=="string"||REQUIRED_VISIBLE_CREDIT.test(credit))||
    s.severity!==null||s.same_event_corrob_verified!==false)return false;
 const headline=concreteIntelligenceHeadline(s),change=intelligenceActorChange(s);
 if(!headline)return false;
 if(headline.length<22||headline.length>220||change.length<30||change.length>650||
    GENERIC.test(headline)||GENERIC.test(change)||GENERIC.test(s.topic)||
    /https?:\/\/|www\.|[<>]/iu.test(headline+change)||
    !TOPIC_SENSITIVE.test(headline+" "+change))return false;
 const ms=Date.parse(s.published_at);
 return Number.isFinite(ms)&&s.title.startsWith("Geomacro finds ")&&
   typeof s.why_it_matters==="string"&&s.why_it_matters.length>=30;
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
   TOPIC_SENSITIVE.test(headline+" "+change);
}
