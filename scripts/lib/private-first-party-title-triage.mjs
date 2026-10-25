/**
 * NON-AUTHORITATIVE, in-memory topical hints for actual first-party feed
 * entry titles. This never admits an event, verifies a place, proves rights,
 * signs a GRO or authorizes x402. Only fixed, small reason codes survive.
 *
 * Critical distinction: discovery is never blocked by this classifier.
 * "RELATED_UNVERIFIED" means a query should inspect the original, NOT that a
 * news event or commercial intelligence has been verified.
 */
const TOPICS=Object.freeze({
  geopolitics:Object.freeze([
    ["SANCTIONS",/\b(?:sanctions?|embargo(?:es)?|trade restrictions?)\b/iu],
    ["SECURITY",/\b(?:security council|ceasefire|armed conflict|military (?:strike|attack)|border dispute|coup)\b/iu],
    ["DIPLOMACY",/\b(?:foreign minister|diplomatic relations|peace talks|treaty|bilateral talks)\b/iu],
  ]),
  macro:Object.freeze([
    ["INFLATION",/\b(?:inflation|consumer prices?|producer prices?|cpi|price indexes?|price indices)\b/iu],
    ["MONETARY",/\b(?:central bank|interest rates?|policy rates?|monetary policy|exchange rates?|currency intervention)\b/iu],
    ["ACTIVITY",/\b(?:gross domestic product|gdp|employment|unemployment|trade balance|economic growth|retail sales)\b/iu],
  ]),
  rare_earth:Object.freeze([
    ["CRITICAL_MINERAL",/\b(?:critical minerals?|rare earths?|lithium|cobalt|nickel|graphite|gallium|germanium|neodymium|dysprosium)\b/iu],
    ["MATERIAL_SUPPLY",/\b(?:mineral (?:supply|production|processing)|rare earth processing|copper mining|uranium mine|battery minerals?)\b/iu],
    // The undated first-party feed review lane must recognize the policy and
    // industrial vocabulary used by mining/mineral ministries, not just named
    // elements. This remains an ephemeral query hint; it is not a news verdict.
    ["STRATEGIC_RAW_MATERIALS",/\b(?:critical raw materials|strategic raw materials|raw materials (?:act|strategy|policy|supply)|mineral (?:strategy|policy|reserves?|projects?|exploration|extraction|processing|refining|permits?|licen[cs]es?)|rare earth (?:magnet|separation|refining|processing)|battery (?:materials?|metals?|supply chain)|mineral supply chain|mineral value chain|ore processing|smelting|refining capacity|mining permit|exploration licen[cs]e|geological survey|mineral deposit)\b/iu],
  ]),
});
const MAX_TITLE=300;
const UNREADABLE=Object.freeze({
  status:"TITLE_UNREADABLE",reason_code:"UNREADABLE_SOURCE_TITLE",
  topic_codes:[],publication_clock_verified:false,
  article_country_verified:false,independent_event_verified:false,
  commercial_rights_verified:false,score_verified:false,
  customer_delivery_eligible:false,
});
export function classifyPrivateFirstPartyTitle(title,domain){
  if(!Object.hasOwn(TOPICS,domain))throw Error("PRIVATE_FEED_TRIAGE_DOMAIN_INVALID");
  if(typeof title!=="string"||title.length<8||title.length>MAX_TITLE||
     /<[^>]*>|\p{Cc}/u.test(title))return {...UNREADABLE};
  const topics=TOPICS[domain].filter(([,re])=>re.test(title))
    .map(([code])=>code);
  return {
    status:topics.length?"RELATED_UNVERIFIED":"UNCLASSIFIED",
    reason_code:topics.length?"TOPIC_HINT_ONLY":"NO_FIXED_TOPIC_HINT",
    topic_codes:topics,
    publication_clock_verified:false,
    article_country_verified:false,
    independent_event_verified:false,
    commercial_rights_verified:false,
    score_verified:false,
    customer_delivery_eligible:false,
  };
}
export const PRIVATE_FEED_TRIAGE_STATUSES=Object.freeze([
  "RELATED_UNVERIFIED","UNCLASSIFIED","TITLE_UNREADABLE",
]);
