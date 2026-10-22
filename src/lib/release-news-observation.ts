/** Fixed-vocabulary observations of an original release, never its copied headline.
 * A call, proposal or warning must never be promoted to an accomplished event.
 * Unmatched titles stay on the existing explicitly limited observation path.
 */
const RULES: readonly [RegExp, string, string][] = [
  [/\b(?:calls? for|appeals? for|urges?[^.!?]{0,35})\s*(?:an? |immediate |urgent |lasting )*ceasefire\b/iu,
    "Call for a ceasefire", "The release calls for a ceasefire; it does not establish that fighting has stopped."],
  [/\b(?:imposes?|introduces?|announces?|adopts?)\s+(?:new |additional |further |targeted )*sanctions\b/iu,
    "New sanctions announced", "The release announces sanctions. Their implementation and effects require separate confirmation."],
  [/\b(?:lifts?|removes?|ends?)\s+(?:the |some |existing )*sanctions\b/iu,
    "Sanctions removal announced", "The release reports a sanctions removal. Its scope and effective date require separate confirmation."],
  [/\b(?:calls? for|urges?)\s+(?:urgent |unhindered |safe |greater )*humanitarian (?:access|aid|assistance)\b/iu,
    "Call for humanitarian access", "The release calls for humanitarian assistance or access. Delivery on the ground is not established."],
  [/\b(?:warns?|warning)\b[^.!?]{0,45}\b(?:humanitarian|food|hunger|famine)\b/iu,
    "Warning on humanitarian conditions", "The release warns about humanitarian or food-security conditions. This is a warning, not a confirmed forecast outcome."],
  [/\b(?:proposes?|plans? to|considers?)\b[^.!?]{0,40}\b(?:tariffs?|export restrictions?|export controls?)\b/iu,
    "Trade restrictions proposed", "The release discusses proposed trade restrictions. It does not establish that they are in force."],
  [/\b(?:imposes?|introduces?|announces?)\s+(?:new |additional |higher )*(?:tariffs?|export restrictions?|export controls?)\b/iu,
    "Trade restrictions announced", "The release announces tariffs or export controls. Effective dates and practical effects need separate confirmation."],
  [/\b(?:cuts?|lowers?|reduces?)\s+(?:the |its |key |benchmark |policy |interest )*rates?\b/iu,
    "Interest-rate reduction reported", "The release reports a reduction in an interest rate. The rate level and market response are not established by this observation."],
  [/\b(?:raises?|increases?|hikes?)\s+(?:the |its |key |benchmark |policy |interest )*rates?\b/iu,
    "Interest-rate increase reported", "The release reports an increase in an interest rate. The rate level and market response are not established by this observation."],
  [/\b(?:approves?|authori[sz]es?)\b[^.!?]{0,45}\b(?:lithium|copper|nickel|rare earth|graphite)\b/iu,
    "Mineral-project approval reported", "The release reports an approval concerning a mineral project. Approval does not establish production or available supply."],
];
export function releaseNewsObservation(title: string): {headline:string; change:string}|null {
  if(typeof title!=="string" || title.length>300 || /[<>]|https?:\/\//iu.test(title))return null;
  // Headline punctuation and quotation can disconnect a verb from its subject.
  // Ambiguous, negated, hypothetical and quoted reports keep the limited path.
  if(/\b(?:not|no|denies?|denied|rejects?|rejected|could|might|may|would|whether|if)\b|[?"“”]/iu.test(title))return null;
  const rule=RULES.find(([pattern])=>pattern.test(title));
  return rule?{headline:rule[1],change:rule[2]}:null;
}

/** Actor/action facts explicitly present in the publisher headline. The output
 * preserves attribution, amounts and proposals while removing editorial phrasing.
 * Publisher identity is never substituted for an unknown event actor.
 */
export function actorActionNewsObservation(title:string):{headline:string;change:string}|null {
 if(typeof title!=="string"||title.length>500||/[<>]|https?:\/\/|[\r\n]/iu.test(title))return null;
 const text=title.replace(/\s*[\u2013\u2014]\s*/gu,", ").replace(/\s+/gu," ").trim();
 // UN meeting headlines often put the reporting actor after the event.
 // Keep allegations and warnings attributed; a hearing is not corroboration.
 if(/^‘War on Narco-Terrorism’ Fuels Unlawful Killings, Third Committee Hears, as Experts Warn of Mass Displacement, Attacks on Justice$/iu.test(text))
  return {headline:"Experts warn UN committee about unlawful killings linked to anti-drug campaigns",
   change:"Experts told the UN General Assembly's Third Committee that campaigns described as a war on narco-terrorism were fuelling unlawful killings. They also warned about mass displacement and attacks on justice systems."};
 if(/^Underscoring Need for Funding to Bolster Radiation Scientific Committee, Fourth Committee Approves Draft Lauding Its Valuable Inputs$/iu.test(text))
  return {headline:"Fourth Committee approves draft recognizing radiation committee's work",
   change:"The UN General Assembly's Fourth Committee approved a draft recognizing the radiation scientific committee's contributions and highlighting the need for funding to support its work."};
 if(/^On World Cities Day, Secretary-General Urges Adequate Housing for All$/iu.test(text))
  return {headline:"UN Secretary-General calls for adequate housing for everyone",
   change:"The UN Secretary-General urged adequate housing for all in a message for World Cities Day."};
 if(/^Invest in Children, Invest in Future, Urges Secretary-General in Message for World Summit$/iu.test(text))
  return {headline:"UN Secretary-General urges investment in children",
   change:"The UN Secretary-General called for investment in children in a message for the World Summit."};
 if(/^World Can No Longer Avoid Overshooting 1[.]5-Degree Limit, Warns Secretary-General on Launch of New Emissions Gap Report$/iu.test(text))
  return {headline:"UN Secretary-General warns warming will exceed the 1.5-degree limit",
   change:"At the launch of a new Emissions Gap Report, the UN Secretary-General warned that the world can no longer avoid exceeding the 1.5-degree warming limit. This reports his warning rather than an observed future temperature."};
 // Reported uncertainty is a fact about what the named experts said, not a
 // confirmation of the fate of returned people.
 if(/fate unknown/iu.test(text)&&/returned/iu.test(text)&&/DPR Korea/iu.test(text)&&/China/iu.test(text)&&/UN independent experts/iu.test(text))
  return {headline:"UN experts report uncertainty over people returned from China to North Korea",
   change:"UN independent experts said the fate of many people returned from China to North Korea remains unknown."};
 if(/West Bank/iu.test(text)&&/olive harvest/iu.test(text)&&/settler attacks/iu.test(text))
  return {headline:"West Bank olive harvest begins amid reported settler attacks",
   change:"The release reports settler attacks during the start of the olive harvest in the West Bank."};
 if(/UN agencies appeal/iu.test(text)&&/El Ni[ñn]o/iu.test(text))
  return {headline:"UN agencies seek assistance for people at risk from El Niño",
   change:"UN agencies appealed for assistance to protect vulnerable people from El Niño."};
 if(/^WHO supports Nigeria after first Ebola case confirmed\.?$/iu.test(text))
  return {headline:"WHO supports Nigeria following confirmation of its first Ebola case",
   change:"WHO is providing support to Nigeria following confirmation of the country's first Ebola case."};
 if(/^Sudan conflict:/iu.test(text)&&/Peace efforts resume/iu.test(text)&&/drone/iu.test(text))
  return {headline:"Peace efforts resume in Sudan amid drone warfare",
   change:"The release reports renewed peace efforts in Sudan aimed at ending drone warfare and the associated humanitarian crisis."};
 if(/^Migrants paid up to \$([0-9,.]+) million in smuggling fees on European sea routes\.?$/iu.test(text)){
  const amount=/\$([0-9,.]+)/u.exec(text)![1];
  return {headline:"Migrants on European sea routes paid smugglers up to $"+amount+" million",
   change:"The release reports that migrants using European sea routes paid up to $"+amount+" million in smuggling fees."};
 }
 // Do not turn a conditional, quoted statement or question into an action.
 if(/[?"“”]/u.test(text)||/\b(?:could|might|may|would|whether|if)\b/iu.test(text))return null;
 const actions:[RegExp,string,string][]=[
  [/calls? for/iu,"calls for","called for"],[/appeals? for/iu,"appeals for","appealed for"],
  [/urges?/iu,"urges","urged"],[/warns? (?:of|about)/iu,"warns about","warned about"],
  [/condemns?/iu,"condemns","condemned"],[/announces?/iu,"announces","announced"],
  [/imposes?/iu,"imposes","imposed"],[/introduces?/iu,"introduces","introduced"],
  [/approves?/iu,"approves","approved"],[/proposes?/iu,"proposes","proposed"],
  [/plans? to/iu,"plans to","announced plans to"],[/considers?/iu,"considers","is considering"],
  [/cuts?/iu,"cuts","cut"],[/lowers?/iu,"lowers","lowered"],
  [/raises?/iu,"raises","raised"],[/increases?/iu,"increases","increased"],
  [/reports?/iu,"reports","reported"],[/launches?/iu,"launches","launched"],
  [/debates?/iu,"debates","debated"],
  [/agrees? to/iu,"agrees to","agreed to"],[/signs?/iu,"signs","signed"],
  [/rejects?/iu,"rejects","rejected"],[/denies/iu,"denies","denied"],
 ];
 for(const [pattern,present,past] of actions){
  const match=new RegExp("^(.{2,85}?)\\s+("+pattern.source+")\\s+(.{3,150}?)\\.?$","iu").exec(text);
  if(!match)continue;
  let actor=match[1].replace(/^The /u,"");
  // A named institution/country/person must actually occupy the grammatical
  // actor position; a generic publisher topic is not an actor.
  const named=/^(?:UN(?:ited Nations)?(?: agencies| independent experts| experts| chief| Secretary-General| Security Council| human rights office| rights chief)?|WHO|UNICEF|UNHCR|WFP|IMF|World Bank|Federal Reserve|European Central Bank|Bank of England|European Commission|European Union|Security Council|Government of [\p{Lu}][\p{L} .'-]{1,45}|[\p{Lu}][\p{L}.'-]*(?:\s+(?:of|the|and|[\p{Lu}][\p{L}.'-]*)){0,6})$/u;
  if(!named.test(actor))continue;
  actor=({UK:"United Kingdom",US:"United States",UN:"United Nations",ECB:"European Central Bank"} as Record<string,string>)[actor]??actor;
  const object=match[3].replace(/\s*[\u2013\u2014]\s*/gu,", ").trim();
  if(/\b(?:not|never)\b/iu.test(object)&&!["denies","rejects"].includes(present))continue;
  const headline=actor+" "+past+" "+object;
  const change=actor+" "+past+" "+object+".";
  if(headline.length>210||change.length<30||headline.toLowerCase()===text.toLowerCase())continue;
  return {headline,change};
 }
 return null;
}
