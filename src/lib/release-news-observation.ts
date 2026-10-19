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
