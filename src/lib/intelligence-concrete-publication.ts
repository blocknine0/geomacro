import type {StatelessIntelligenceSignal,StatelessCategory} from "./stateless-intelligence-model";
import {intelligenceActorHeadline,intelligenceActorIsKnown,intelligenceActorChange} from "./public-intelligence-actor-copy";

/**
 * Strict public presentation gate shared by the Intelligence desk and homepage.
 * Keep all evidence (including rejected/unverified intake) in the existing
 * protected ingest path. Showing no card is preferable to an invented event.
 * Sources with mandatory public credits are not eligible for an attribution-
 * free card. Missing credit is not itself a grant of commercial re-use.
 */
const GENERIC=/\b(?:publisher candidate|source.feed observation|unverified|not specified|not established|unclassified|an official publisher|feed contains a dated item|original release concerns|publication concerns|monitoring topic)\b/iu;
const TOPIC_SENSITIVE=/\b(?:alleged|allegation|reported|announced|urged|warned|proposed|planned|rejected|approved|agreed|cut|raised|increased)\b/iu;
export function isConcretePublicIntelligence(s:StatelessIntelligenceSignal):boolean{
 if(!s||s.status!=="official_release_observed_unscored"||
    !["geopolitics","macro","rare_earth"].includes(s.category)||
    s.sources_credited.length!==0||s.severity!==null||
    s.same_event_corrob_verified!==false||!intelligenceActorIsKnown(s))return false;
 const headline=intelligenceActorHeadline(s),change=intelligenceActorChange(s);
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
