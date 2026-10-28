/** Reviewed discovery rules: roles stay valid when office-holders change. */
export const GLOBAL_MACRO_RELEASE_PATTERN=/\b(?:CPI|PPI|PMI|GDP|PCE|payrolls?|unemployment|employment data|labour market|labor market|retail sales|industrial production|manufacturing output|housing starts|consumer confidence|business confidence|trade balance|current account|balance of payments|foreign reserves?|fx intervention|currency intervention|capital controls?|sovereign (?:debt|default|rating)|bond auctions?|treasury auctions?|yield curve|fiscal (?:budget|deficit|surplus)|bank (?:stress|liquidity|deposits?|credit|lending|capital|earnings|balance sheet)|non.performing loans?|deposit flight|deposit insurance|financial stability|interest rates?|policy rates?|monetary policy|tariffs?|import dut(?:y|ies)|trade (?:restrictions?|agreement|negotiations?)|export controls?|Hormuz|Red Sea|Suez|Bab.el.Mandeb|port closures?|port strikes?|freight rates?|shipping disruption|customs restrictions?)\b/iu;
const COMMUNICATION=/\b(?:speech|speaks?|remarks?|testimon(?:y|ies)|statements?|says?|said|announces?|announced|warns?|addresses?|briefings?|press conference)\b/iu;
const MONETARY_ROLE=/\b(?:central.bank (?:governor|president|chair)|Fed(?:eral Reserve)?(?:'s)?(?: chair| governor| president)?|FOMC|ECB(?:'s)? (?:president|governor)|Bank of England|Bank of Japan|Bank of Canada|Reserve Bank of India|Reserve Bank of Australia|Reserve Bank of New Zealand|Swiss National Bank|Sveriges Riksbank|Norges Bank|People.s Bank of China|PBoC|Bank of Korea|Bank Indonesia|Banco Central|treasury secretary|finance minister|finance ministry)\b/iu;
const GOVERNMENT_ROLE=/\b(?:president|prime minister|chancellor|trade minister|commerce minister|G7 leaders?|G20 leaders?)\b/iu;
const MARKET_CONTEXT=/\b(?:markets?|econom(?:y|ic)|inflation|rates?|trade|tariffs?|sanctions?|energy|oil|gas|currency|investment|banking|Hormuz|shipping|ceasefire|war)\b/iu;
export function marketRelevantOfficialCommunication(title:string):boolean{
 return typeof title==='string'&&COMMUNICATION.test(title)&&
  (MONETARY_ROLE.test(title)||(GOVERNMENT_ROLE.test(title)&&MARKET_CONTEXT.test(title)));
}
// Check in either order; no inference about the observed price reaction.
export const GLOBAL_MACRO_TOPIC_PATTERN=new RegExp(
 `(?:${GLOBAL_MACRO_RELEASE_PATTERN.source})|^(?=[\\s\\S]*${COMMUNICATION.source})(?=[\\s\\S]*(?:${MONETARY_ROLE.source}|${GOVERNMENT_ROLE.source}))(?=[\\s\\S]*(?:${MONETARY_ROLE.source}|${MARKET_CONTEXT.source}))[\\s\\S]+`,'iu');
