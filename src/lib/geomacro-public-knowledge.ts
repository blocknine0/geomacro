import {publicCapabilityPricingCatalog} from "./capability-pricing-catalog";
import type {HybridAskAnswer} from "./hybrid-ask-intelligence.server";
import type {GeomacroPublicLink} from "./geomacro-public-links";

// Reviewed public facts from /about, /contact, /data-api, /pricing and the
// public homepage. No repository search, environment, database or private
// retrieval is available to this answer path. Unknown details stay unknown.
const PRODUCT_NAMES: Record<string,string> = {
 structural_country_digest:"Country Structural Digest",
 structural_country_profile:"Country Structural Profile",
 structural_corridor_digest:"Corridor Structural Digest",
 structural_corridor_profile:"Corridor Structural Profile",
 intelligence_query:"Intelligence — Focused / Standard / Complex Multi-source",
 signed_risk_object:"Signed Risk Object — Existing / New",
 risk_gate_bundle:"Risk Gate — Preflight / Standard / Complex",
};
function publicAnswer(summary:string,links:GeomacroPublicLink[]):HybridAskAnswer {
 return {summary,what_changed:"",why_it_matters:"",geomacro_view:"",evidence:[],
  insufficient_evidence:false,mean_relevance:null,low_confidence:false,gri:null,
  generatedAt:new Date().toISOString(),data_mode:"permanent",cache_status:"bypassed",
  source_identity_exposed:false,durable_live_storage_write:false,
  answer_kind:"public_info",public_links:links};
}
export function geomacroPublicAnswer(question:string):HybridAskAnswer|null {
 const q=question.trim();
 if(!/\bgeomacro\b/i.test(q))return null;
 // A brand mention never turns private/operational requests into permission.
 if(/\b(?:secrets?|credentials?|passwords?|tokens?|seed phrases?|private keys?|internal|database|logs?|hidden|system prompt|raw (?:feeds?|sources?|articles?)|source (?:code|feeds?|list)|wallet balances?)\b/i.test(q))
  return publicAnswer("I can share Geomacro's published product information, pricing, documentation and contact details. Private records, credentials, internal operations and unpublished data are not available through public chat.",["about","docs","contact"]);
 if(/\bfree\b/i.test(q) && !/\b(?:pric(?:e|es|ing)|cost|fees?|usdc|pay|payment)\b/i.test(q))
  return publicAnswer("Public Intelligence browsing and Ask Geomacro are free. Structured API products have separate published pay-per-use USDC prices. The public website lists API keys and self-service checkout as coming soon.",["intelligence","pricing","data_api"]);
 if(/\b(?:pric(?:e|es|ing)|cost|fees?|usdc|pay|payment|paid)\b/i.test(q)){
  const rows=publicCapabilityPricingCatalog();
  return publicAnswer("Public Intelligence browsing and Ask Geomacro are free. Published pay-per-use structured API prices, in USDC per eligible delivery:\n\n"+
    rows.map(row=>PRODUCT_NAMES[row.capability]+": "+row.variants.map(v=>"$"+v.amount_usdc).join(" / ")).join("\n")+
    "\n\nA published price does not confirm live product availability or payment acceptance. The public website lists API keys and self-service checkout as coming soon; check the product page or contact Geomacro for access.",["pricing","data_api","contact"]);
 }
 if(/\b(?:contact|email|support|sales|partnership|reach)\b/i.test(q))
  return publicAnswer("Contact Geomacro at contact@geomacro.live for product access, support, API integrations or partnerships. For support, include the page, time and issue you encountered.",["contact"]);
 if(/\b(?:privacy|personal (?:data|information)|save|saved|account|history|store(?:d)?.{0,25}(?:chats?|conversations?|research))\b/i.test(q))
  return publicAnswer("Ask Geomacro conversations stay in the current browser tab and are not saved to an account. The public privacy page says reader preferences stay in the browser and Geomacro does not sell personal information. Privacy or data-removal enquiries: contact@geomacro.live.",["about","contact"]);
 if(/\b(?:methodology|trust|verified|verification|reliable|accuracy|sources?|security|audit|certif|sla|guarantee|delay|freshness)\w*\b/i.test(q))
  return publicAnswer("Geomacro publishes derived intelligence across Geopolitics, Macro / FX and Critical Minerals, with original dates and coverage limits. Raw articles, source feeds and private retrieval records are not sold. Public findings have no added publication delay; Risk Indices retain their 60-minute delay. Missing evidence is not a zero-risk reading. The public trust page does not claim an independent external security certification or production SLA unless completed or contracted.",["research","about","docs"]);
 if(/\b(?:api|agents?|json|integrat|products?|store|digests?|profiles?|risk gate|signed risk object|access|checkout)\w*\b/i.test(q))
  return publicAnswer("Geomacro's public product catalog covers country and corridor digests and profiles, structured intelligence answers, Signed Risk Objects and Risk Gate bundles. Applications and AI agents receive structured Geomacro data. Public pricing is listed separately; API keys and self-service checkout are listed as coming soon. Contact Geomacro to discuss your product, geography and delivery format.",["data_api","pricing","docs","contact"]);
 if(/\b(?:docs?|documentation|use|start|work|find|read|explore|roadmap)\b/i.test(q))
  return publicAnswer("Start with Intelligence to read Geomacro findings, Risk Indices to inspect available risk readings, and Ask Geomacro to ask questions. For an application or AI agent, visit API & Agents, then the product documentation and pricing. The public roadmap describes planned work; a roadmap item is not a live feature guarantee.",["intelligence","risk_indices","data_api","docs","roadmap"]);
 if(/\b(?:founder|founded|owner|team|employees?|funding|investors?|revenue|valuation|customers?|partners?)\b/i.test(q))
  return publicAnswer("I do not have a verified published statement for that company detail. Please check About & Trust or contact Geomacro for a public confirmation.",["about","contact"]);
 // Research questions that happen to mention the brand retain their normal
 // three-domain explanation/current-evidence path.
 if(/\b(?:inflation|gdp|interest rates?|currenc\w*|rare earths?|geopolitical risk|lithium|sanctions?|macro risk|critical minerals risk)\b/i.test(q))return null;
 if(!/^(?:(?:what is|what does|who is|tell me about|explain|about|describe|introduce)\s+)?geomacro(?:[?!.,: ]*(?:do|offer|work|overview|কি|কী))?[?!., ]*$/i.test(q))
  return publicAnswer("That detail is not covered by the approved public product information. I can help with Geomacro's purpose, products, published pricing, public data-use boundaries, documentation or contact details.",["about","docs","contact"]);
 return publicAnswer("Geomacro is a global intelligence platform for people, applications and AI agents. It explains what changed in Geopolitics, Macro Economics / FX and Critical Minerals / Rare Earths, why it matters and what to watch. You can read findings, inspect available Risk Indices, ask research questions, or explore structured data products. For details not covered here, use the published pages or contact Geomacro.",["about","intelligence","data_api"]);
}
