import { geomacroPublicAnswer } from "./geomacro-public-knowledge";
import { COUNTRIES_195 } from "./canonical-country-registry-195";
import type { HybridAskAnswer } from "./hybrid-ask-intelligence.server";

export type AskDomain = "geopolitics" | "macro" | "rare_earth";
/** Shared category vocabulary for free-form Ask and bounded research discovery.
 * These are ROUTING hints only, never proof of a current observation. */
const DOMAIN_RULES: readonly [AskDomain, RegExp][] = [
  ["geopolitics", /\b(?:geopolitic\w*|sanctions?|embargo(?:es)?|diplomac\w*|conflicts?|wars?|ceasefires?|tariffs?|trade|elections?|security|shipping|straits?|sovereignty|nato|defen[cs]e|export controls?|militar\w*|border\w*|tensions?|treat(?:y|ies)|foreign polic(?:y|ies)|ofac|unsc|red sea|south china sea|taiwan|peace talks?)\b/i],
  ["macro", /\b(?:macro\w*|gri|risk indices|risk index|econom\w*|inflation|deflation|disinflation|cpi|pmi|gdp|recession|interest rates?|central banks?|monetary|fiscal|currenc(?:y|ies)|forex|fx|exchange rates?|bonds?|yields?|debt|employment|unemployment|gold|silver|oil|dollar|fed|ecb|bank of|growth|opec\+?|imf|world bank|wto|oecd|rate cuts?|rate hikes?|quantitative easing|commodity prices?|trade deficit|current account)\b/i],
  ["rare_earth", /\b(?:rare[- ]earths?|critical[- ]minerals?|critical raw materials?|strategic minerals?|minerals?|lithium|cobalt|nickel|graphite|copper|gallium|germanium|neodymium|dysprosium|terbium|praseodymium|tungsten|antimony|manganese|vanadium|scandium|tantalum|niobium|yttrium|magnets?|mining|refining|supply chains?|battery materials?|mineral processing|separation capacity)\b/i],
];
export function askDomains(question: string): AskDomain[] {
  return DOMAIN_RULES.filter(([, rule]) => rule.test(question)).map(([domain]) => domain);
}

type Guide = { match: RegExp; title: string; explanation: string; mechanism: string; watch: string };
// Timeless editorial explainers. These never assert a current event, price or score.
const GUIDES: readonly Guide[] = [
  {match:/\b(?:inflation|disinflation|deflation)\b/i,title:"Inflation",explanation:"Inflation is the rate at which the general price level rises. Disinflation means prices are rising more slowly; deflation means the general price level is falling.",mechanism:"Demand, production costs, supply disruptions and expectations can affect inflation. A higher policy rate can restrain demand, but it cannot directly repair a disrupted supply chain.",watch:"Compare headline and core inflation, the reporting period, wages and inflation expectations. A lower inflation rate does not mean prices have returned to their previous level."},
  {match:/\b(?:interest rates?|monetary|central banks?|fed|ecb)\b/i,title:"Interest rates",explanation:"A central bank's policy rate influences borrowing costs and financial conditions. Commercial lending rates also depend on credit risk, funding costs and competition.",mechanism:"Higher rates usually restrain borrowing and demand and can support a currency relative to lower-yielding alternatives. The result depends on expected future policy, inflation and risk appetite.",watch:"Separate the announced rate, its effective date and market expectations. A rate decision alone does not establish the next currency or bond-price move."},
  {match:/\b(?:gdp|economic growth)\b/i,title:"GDP",explanation:"Gross domestic product measures the value of final goods and services produced within an economy over a stated period. Real GDP adjusts for price changes; nominal GDP does not.",mechanism:"Consumption, investment, government spending and net exports contribute to expenditure-based GDP. A strong headline can mask weak household demand or a temporary inventory change.",watch:"Check real versus nominal, annual versus quarterly growth, seasonal adjustment and revisions. GDP is not a direct measure of household welfare."},
  {match:/\brecession\b/i,title:"Recession",explanation:"A recession is a broad decline in economic activity. Definitions and official dating methods differ by country; two quarters of falling real GDP is a common shorthand, not a universal official rule.",mechanism:"Weak demand can reduce production, employment and investment. Tight credit, policy shocks or supply disruptions can deepen the slowdown.",watch:"Read output alongside employment, income, spending and credit conditions. One weak indicator is not enough to establish a recession."},
  {match:/\b(?:forex|fx|foreign exchange|exchange rates?|currenc(?:y|ies)|dollar)\b/i,title:"Foreign exchange",explanation:"An exchange rate is the price of one currency in another. Appreciation means a currency buys more of its counterpart; depreciation means it buys less.",mechanism:"Relative interest-rate expectations, inflation, trade flows, capital flows and confidence influence exchange rates. In some economies, central-bank intervention or a peg changes the transmission.",watch:"State the currency pair and quote direction. A higher USD-per-local-currency quote has the opposite interpretation to a higher local-currency-per-USD quote."},
  {match:/\b(?:sovereign debt|government debt|bonds?|yields?|fiscal)\b/i,title:"Sovereign financing",explanation:"Governments finance deficits by borrowing. A bond yield is the return implied by its price and cash flows; for a conventional fixed-rate bond, price and yield move in opposite directions.",mechanism:"Debt sustainability depends on interest costs, growth, fiscal balances, maturity and currency denomination. Foreign-currency debt adds exchange-rate exposure.",watch:"Compare the debt path, refinancing schedule, interest-to-revenue ratio and currency composition. A high debt ratio alone does not determine default risk."},
  {match:/\b(?:gold|silver)\b/i,title:"Gold and silver",explanation:"Gold and silver are precious metals with monetary, investment and industrial uses. Silver generally has greater industrial exposure than gold.",mechanism:"Real interest rates, the dollar, investor positioning and industrial demand can influence prices. Geopolitical stress can raise safe-haven demand, but does not guarantee a price increase.",watch:"Separate spot and futures quotes, units and timestamps. A causal explanation is not a verified live price or a trading recommendation."},
  {match:/\b(?:sanctions?|export controls?)\b/i,title:"Sanctions and export controls",explanation:"Sanctions restrict specified transactions, entities or activities. Export controls restrict the transfer of particular goods, software or technology and can include licensing requirements.",mechanism:"Restrictions can change payment access, shipping, insurance, technology availability and supply-chain costs. Their effect depends on legal scope, exemptions and enforcement.",watch:"Check the issuing authority, covered parties and products, effective date and exemptions. A proposed measure is different from a restriction already in force."},
  {match:/\btariffs?\b/i,title:"Tariffs",explanation:"A tariff is a tax on an imported product. The importer normally pays the charge to customs; who ultimately bears the cost depends on prices, substitution and bargaining power.",mechanism:"Tariffs can raise input costs, redirect trade and invite retaliation. Exchange rates and suppliers' margins can absorb part of the change.",watch:"Check product coverage, rate, country of origin, exemptions and implementation date. An announcement alone does not prove a measured inflation or output effect."},
  {match:/\b(?:geopolitic\w*|diplomac\w*|conflicts?|wars?|ceasefire|security|nato|sovereignty)\b/i,title:"Geopolitical risk",explanation:"Geopolitical risk concerns how conflict, diplomacy and government decisions can disrupt economic activity, trade, security or investment.",mechanism:"Transmission can run through energy and food costs, shipping, sanctions, capital flows and confidence. Exposure varies by geography, sector and the duration of disruption.",watch:"Separate confirmed actions from proposals and statements. Assess the actor, action, location, original date and direct exposure before inferring a wider economic effect."},
  {match:/\b(?:rare[- ]earths?|neodymium|dysprosium|terbium|magnets?)\b/i,title:"Rare earths",explanation:"Rare earths are a group of 17 elements used in applications such as magnets, catalysts and electronics. Not every critical mineral is a rare-earth element.",mechanism:"Supply risk can arise in separation, refining and magnet manufacturing as well as mining. A mine announcement does not immediately create qualified downstream production.",watch:"Distinguish ore, separated oxides, metals and finished magnets. Check capacity versus actual output, processing location, permitting and qualification timelines."},
  {match:/\b(?:critical[- ]minerals?|lithium|cobalt|nickel|graphite|copper|gallium|germanium|mining|refining|supply chains?|minerals?)\b/i,title:"Critical minerals",explanation:"Critical minerals are materials judged economically or strategically important and vulnerable to supply disruption. The official list varies by jurisdiction and changes over time.",mechanism:"Mining concentration, processing bottlenecks, export restrictions, substitution and recycling affect supply resilience. Geological availability is different from commercially qualified supply.",watch:"Track the specific mineral and supply-chain stage, actual output, inventories, trade restrictions and customer qualification. A resource estimate is not operating production."},
  {match:/\b(?:shipping|strait|trade)\b/i,title:"Trade and shipping exposure",explanation:"Trade and shipping risks arise when routes, market access or cross-border payments are disrupted. A shipping chokepoint concentrates traffic through a narrow route.",mechanism:"Rerouting can increase voyage times, insurance, fuel use and working capital. Effects on final prices depend on inventories, alternatives and the duration of disruption.",watch:"Check actual closures, transit volumes and freight rates. A threat or isolated incident does not establish a sustained global supply interruption."},
];

function response(summary: string, extra: Partial<HybridAskAnswer> = {}): HybridAskAnswer {
  return {summary,what_changed:"",why_it_matters:"",geomacro_view:"",evidence:[],
    insufficient_evidence:false,mean_relevance:null,low_confidence:false,gri:null,
    generatedAt:new Date().toISOString(),data_mode:"permanent",cache_status:"bypassed",
    source_identity_exposed:false,durable_live_storage_write:false,
    answer_kind:"guidance",...extra};
}

/** Timeless cross-sector mechanics, not an answer about a named event or live score. */
function crossDomainGuideAnswer(question: string, domains: readonly AskDomain[]): HybridAskAnswer {
  const parts: string[] = [];
  if (domains.includes("geopolitics") && domains.includes("macro"))
    parts.push("Policy restrictions, conflict and shipping disruption can transmit into trade costs, inflation expectations, capital flows and exchange rates.");
  if (domains.includes("geopolitics") && domains.includes("rare_earth"))
    parts.push("Export controls, sanctions and transport restrictions can constrain access to mineral inputs; exposure depends on mining, refining and downstream manufacturing locations.");
  if (domains.includes("macro") && domains.includes("rare_earth"))
    parts.push("Interest rates, currency moves and industrial demand affect mineral project financing and input costs, while physical output depends on processing capacity and qualification.");
  // Reflect an explicitly named mineral instead of silently answering a
  // copper/lithium/cobalt question with generic "mineral inputs" wording.
  // This is a timeless risk mechanism, not a sourced current shortage claim.
  const requestedMineral = /\b(?:copper|lithium|cobalt|nickel|graphite|gallium|germanium|neodymium|dysprosium|terbium|praseodymium|tungsten|antimony|manganese|vanadium|scandium|tantalum|niobium|yttrium)\b/iu.exec(question)?.[0];
  if (requestedMineral && domains.includes("rare_earth")) {
    parts.push("For " + requestedMineral.toLowerCase() +
      " specifically, the potential effect depends on the affected ore, refining and shipping stages and available substitutes; a policy announcement alone does not establish a physical shortage.");
  }
  return response(parts.join(" "), {
    answer_kind:"explainer",
    why_it_matters:"The link is conditional: the size and direction of any real-world effect depend on specific actors, products, timing and measurable exposure.",
    geomacro_view:"For a current-country assessment, specify the location, mineral and time window. This explanation is not a current event confirmation, numerical forecast or signed risk score.",
    real_time_message:"General cross-category mechanism only; no live observation or signed risk assessment.",
  });
}

export function domainGuideAnswer(question: string): HybridAskAnswer | null {
  const q = question.trim();
  const publicInfo = geomacroPublicAnswer(q);
  if (publicInfo) return publicInfo;
  if (/^(?:hi|hello|hey|help|what can you do|who are you|thanks|thank you)[!?.]*$/i.test(q))
    return response("I'm Geomacro. Ask me about Geopolitics, Macro Economics or Critical Minerals / Rare Earths. I can explain concepts, check available news and data, and explore follow-up questions.");
  if (/\b(?:football|cricket|sports?|recipes?|cake|poems?|songs?|javascript|python|diagnos(?:e|is)|symptoms?|horoscope)\b/i.test(q))
    return response("I cover Geopolitics, Macro Economics and Critical Minerals / Rare Earths. Please ask a research question within these three categories.");
  const domains = askDomains(q);
  const generic = /^(?:what (?:has )?changed today|what (?:is|'s) new today|what happened today|what(?: is|'s) happening today|latest (?:news|developments)|(?:give me )?(?:the )?(?:news|updates) today|what is (?:happening|driving risk)(?: today)?)\??$/i.test(q);
  // Country names and common abbreviated mentions are in scope even when
  // the user does not spell out "geopolitics" or "macroeconomics".
  const countrySpecific = COUNTRIES_195.some(country =>
    [...new Set([country.name, ...country.aliases])].some(name => {
      if (!name || name.length < 2) return false;
      const expression = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", name.length <= 3 ? "" : "i");
      return expression.test(q);
    }) ||
    (country.iso3 === "USA" && /\b(?:US|U\.S\.)\b/.test(q)) ||
    (country.iso3 === "GBR" && /\b(?:UK|U\.K\.)\b/.test(q))
  );
  if (!domains.length && !generic && !countrySpecific)
    return response("Ask Geomacro covers Geopolitics, Macro Economics and Critical Minerals / Rare Earths. Please ask a question in one of these three areas—for example, how interest rates affect currencies or how export controls affect mineral supply.");
  // Explicit unrelated tasks must not be laundered through an in-scope keyword.
  if (/\b(?:write|generate|create|debug)\b.{0,40}\b(?:code|script|poem|recipe|song|website)\b/i.test(q))
    return response("I can help explain or research Geopolitics, Macro Economics and Critical Minerals / Rare Earths. Please ask a research question in one of those categories.");
  // Time-sensitive, numeric, country-specific and predictive requests always
  // use governed retrieval. Editorial knowledge never fills a current-data gap.
  if (countrySpecific || /\b(?:today|latest|current|now|yesterday|this (?:week|month|year)|in 20\d\d|forecast|predict|price|how much|how many|what.{0,12}rate)\b/i.test(q) || /\b(?:news|updates?|announced|happened|changed)\b/i.test(q)) return null;
  if (!/^(?:what (?:is|are|does)|how (?:do|does|can)|why (?:do|does|can)|explain|summarize|define|compare|difference|tell me about)\b/i.test(q)) return null;
  // Never answer a 2–3-domain causal question using a one-topic canned guide.
  // Mixed current, numeric, country or predictive questions took the governed path above.
  if (domains.length > 1) return crossDomainGuideAnswer(q, domains);
  const guide = GUIDES.find(item => item.match.test(q));
  if (!guide) return null;
  return response(guide.explanation, {why_it_matters:guide.mechanism,geomacro_view:guide.watch,
    answer_kind:"explainer",real_time_message:"General explanation; no live observation or signed risk assessment."});
}
