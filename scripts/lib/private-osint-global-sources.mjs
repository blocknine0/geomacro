/** Private discovery only. Country of publisher is inventory metadata, never event attribution. */
import {readFileSync} from "node:fs";
import {registeredReusableNewsSources} from "./registered-reusable-news-source-collector.mjs";
import {CONTINENT_COUNTRIES_195} from "./continent-country-195-rotation.mjs";

export const PRIVATE_OSINT_CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
// These expressions detect provisional topics in native-language feed titles.
// They do not translate, corroborate, score, or grant publication authority.
export const PRIVATE_OSINT_TOPICS=Object.freeze({
 geopolitics:/(?:\b(?:wars?|conflicts?|sanctions?|ceasefire|treaty|military|security|diploma\w*|peace|refugees?|elections?|embargo|attacks?|missiles?|border|coup|guerra|conflit\w*|conflito|sanciones|sanções|cessez.le.feu|seguridad|sécurité|elecciones|eleições|militar\w*|diplomaci\w*|frontera|fronteira|paix|krieg|sicherheit|konflikt|angriff)\b|战争|冲突|制裁|停火|軍事|選挙|전쟁|분쟁|제재|حرب|عسكري|عقوبات|انتخابات|войн|конфликт|санкци|যুদ্ধ|নিরাপত্তা|নির্বাচন|संघर्ष|चुनाव|युद्ध|מלחמה|צבאי|סנקציות|הפסקת אש|בחירות|גושפנקה|جنگ|تحریم|воєн|війна|wojna|háború)/iu,
 macro:/(?:\b(?:inflation|monetary|central bank|interest rates?|fx|foreign exchange|gdp|currency|tariffs?|economic|economy|fiscal|unemployment|trade|inflación|inflação|inflazione|inflasi|banque centrale|banco central|banca centrale|taux|taxa de juros|tasas? de interés|econom[ií]a|économi\w*|econ[oô]mi\w*|comercio|comércio|desemprego|chômage|pib|devises|währung|zentralbank|zinsen|wirtschaft)\b|经济|通胀|央行|利率|汇率|経済|金融|금리|경제|تضخم|اقتصاد|فائدة|инфляц|эконом|ставк|অর্থনীতি|মূল্যস্ফীতি|সুদের|मुद्रास्फीति|अर्थव्यवस्था|ब्याज|אינפלציה|ריבית|בנק מרכזי|כלכל|שער חליפין|تورم|اقتصادی|بهره|інфляц|inflacja|inflace|infláció|bank centralny)/iu,
 rare_earth:/(?:\b(?:critical minerals?|critical raw materials?|rare[- ]earths?|mining|cobalt|lithium|nickel|graphite|copper|gallium|germanium|neodymium|dysprosium|terbium|tungsten|mineral supply|refinery|minerais? cr[ií]ticos?|minerales? cr[ií]ticos?|terras? raras?|tierras? raras?|terres? rares?|min[eé]raux critiques?|min[eé]raux strat[eé]giques?|minería|mineração|minier\w*|litio|l[ií]tio|cobalto|cobre|cuivre|gali[ou]m|germ[aâ]nio|seltene erden|bergbau|kupfer)\b|关键矿产|稀土|锂|钴|稀土類|希土類|鉱山|희토류|리튬|معادن|редкозем|литий|кобальт|খনিজ|लिथियम|खनिज|מינרלים|ליתיום|קובלט|נחושת|יסודות נדירים|معادن کمیاب|مواد معدنی|літій|рідкозем|górnictwo|bányászat)/iu,
});

export function privateOsintGlobalSources(){
 const manifest=JSON.parse(readFileSync(new URL("../../config/private-osint-working-sources.v1.json",import.meta.url),"utf8"));
 if(manifest.schema!=="geomacro.private-osint-working-sources.v1"||!Array.isArray(manifest.sources))
  throw Error("PRIVATE_OSINT_GLOBAL_MANIFEST_INVALID");
 const additions=JSON.parse(readFileSync(new URL("../../config/private-osint-official-feed-additions.v1.json",import.meta.url),"utf8"));
 if(additions.schema!=="geomacro.private-osint-official-feed-additions.v1"||
    additions.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    !Array.isArray(additions.sources)||additions.sources.length>24)
   throw Error("PRIVATE_OSINT_OFFICIAL_ADDITIONS_INVALID");
 const officialFeedCandidates=[];
 const candidateIds=new Set(),candidateUrls=new Set();
 for(const s of additions.sources){
   let url,discovery;
   try{url=new URL(s.url);discovery=new URL(s.discovery_url);}catch{throw Error("PRIVATE_OSINT_OFFICIAL_FEED_URL_INVALID")}
   // Exact PIB government RSS source entries from the uploaded national list.
   // Only PRIVATE, native-clock parsed intake; transport remains independently
   // observable as DENIED/UNAVAILABLE/MALFORMED until a real feed is read.
   const expected="https://www.pib.gov.in";
   if(!/^private_official_ind_pib_press_reg(?:1|3|5|6|17|20|22)$/u.test(s.id)||
      url.origin!==expected||url.pathname!=="/RssMain.aspx"||
      url.searchParams.get("ModId")!=="6"||
      url.searchParams.get("Lang")!=="1"||
      !["1","3","5","6","17","20","22"].includes(url.searchParams.get("Regid"))||
      [...url.searchParams.keys()].length!==3||
      discovery.origin!==expected||discovery.pathname!=="/ViewRss.aspx"||
      discovery.searchParams.get("lang")!=="1"||
      discovery.searchParams.get("reg")!==url.searchParams.get("Regid")||
      [...discovery.searchParams.keys()].length!==2||
      url.hash||url.username||url.password||discovery.hash||
      s.continent!=="asia"||s.publisher_country_iso3!=="IND"||
      s.type!=="rss"||!Array.isArray(s.categories)||
      s.categories.length!==3||new Set(s.categories).size!==3||
      s.categories.some(c=>!PRIVATE_OSINT_CATEGORIES.includes(c))||
      s.activation_state!=="RUNTIME_PROBE_REQUIRED"||
      s.provider_rights_verified!==false||s.commercial_eligible!==false||
      s.access_verified_in_production!==false||s.publicly_deliverable!==false||
      candidateIds.has(s.id)||candidateUrls.has(s.url))
     throw Error("PRIVATE_OSINT_OFFICIAL_FEED_CANDIDATE_UNSAFE");
   candidateIds.add(s.id);candidateUrls.add(s.url);
   officialFeedCandidates.push({...s,supported:true,transport_verified_at_registration:false});
 }
 const existing=new Map(registeredReusableNewsSources().map(s=>[s.url,s]));
 const map=new Map();
 for(const s of manifest.sources){
  const u=new URL(s.url);
  if(!/^private_[a-z0-9_]+$/u.test(s.id)||u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
    !["global",...Object.keys(CONTINENT_COUNTRIES_195)].includes(s.continent)||
    (s.publisher_country_iso3!==null&&!Object.values(CONTINENT_COUNTRIES_195).flat().includes(s.publisher_country_iso3))||
    !["rss","atom","rdf","xml","json"].includes(s.type)||
    !Array.isArray(s.categories)||!s.categories.length||s.categories.some(c=>!PRIVATE_OSINT_CATEGORIES.includes(c))||
    s.acceptance?.http_status!==200||s.acceptance?.feed_parsed!==true||s.acceptance?.native_publication_clock_present!==true)
   throw Error("PRIVATE_OSINT_GLOBAL_SOURCE_NOT_ACCEPTED");
  const old=map.get(s.url)??existing.get(s.url);
  map.set(s.url,old?{...old,categories:[...new Set([...old.categories,...s.categories])],
   continent:s.continent,publisher_country_iso3:s.publisher_country_iso3}:
   {...s,supported:true});
 }
 for(const candidate of officialFeedCandidates){
  if(map.has(candidate.url)||existing.has(candidate.url))
    throw Error("PRIVATE_OSINT_OFFICIAL_FEED_ALREADY_REGISTERED");
  map.set(candidate.url,candidate);
 }
 // Pinned release feeds discovered in the requested macro/minerals repositories.
 // They remain private candidates until each scheduled fetch proves native RSS
 // dates; OSINT evidence never inherits commercial publication rights.
 const macroMinerals=JSON.parse(readFileSync(new URL(
  "../../config/private-osint-macro-minerals-additions.v1.json",import.meta.url),"utf8"));
 const pinnedMacroMinerals=new Map([
  ["private_repo8_us_bea_release","https://www.bea.gov/rss/news_releases.xml"],
  ["private_repo8_us_bls_release","https://www.bls.gov/feed/news_release/rss.xml"],
  ["private_repo8_can_boc_release","https://www.bankofcanada.ca/feeds/media-releases/"],
  ["private_repo8_world_bank_release","https://www.worldbank.org/en/news/rss"],
  ["private_repo8_imf_release","https://www.imf.org/en/news/rss"],
  ["private_repo8_us_eia_energy","https://www.eia.gov/rss/todayinenergy.xml"],
  ["private_repo8_uk_lme_metals","https://www.lme.com/News/rss"],
 ]);
 if(macroMinerals?.schema!=="geomacro.private-osint-macro-minerals-additions.v1"||
    macroMinerals.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    !Array.isArray(macroMinerals.sources)||
    macroMinerals.sources.length!==pinnedMacroMinerals.size)
   throw Error("PRIVATE_MACRO_MINERALS_SOURCE_MANIFEST_INVALID");
 const seenMacroMineralsIds=new Set();
 for(const s of macroMinerals.sources){
   const expectedUrl=pinnedMacroMinerals.get(s.id);
   const u=new URL(s.url);
   const expectedCategory=s.id==="private_repo8_uk_lme_metals"?"rare_earth":"macro";
   const expectedContinent=s.id==="private_repo8_uk_lme_metals"?"europe":
     ["private_repo8_world_bank_release","private_repo8_imf_release"].includes(s.id)?"global":"north_america";
   const expectedCountry=s.id==="private_repo8_uk_lme_metals"?"GBR":
     s.id==="private_repo8_can_boc_release"?"CAN":
     expectedContinent==="global"?null:"USA";
   if(!expectedUrl||expectedUrl!==s.url||seenMacroMineralsIds.has(s.id)||
      u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
      s.type!=="rss"||s.continent!==expectedContinent||
      s.publisher_country_iso3!==expectedCountry||
      !Array.isArray(s.categories)||s.categories.length!==1||
      s.categories[0]!==expectedCategory||
      s.activation_state!=="RUNTIME_PROBE_REQUIRED"||
      s.provider_rights_verified!==false||s.commercial_eligible!==false||
      s.access_verified_in_production!==false||s.publicly_deliverable!==false||
      map.has(s.url)||existing.has(s.url))
     throw Error("PRIVATE_MACRO_MINERALS_SOURCE_SCOPE_UNSAFE_OR_DUPLICATE");
   seenMacroMineralsIds.add(s.id);
   map.set(s.url,{...s,supported:true,transport_verified_at_registration:false});
 }
 // Interleave continents so an individual slow regional desk cannot put
 // another continent at the back of a large sequential registry group.
 const buckets=["global",...Object.keys(CONTINENT_COUNTRIES_195)].map(c=>[...map.values()].filter(s=>s.continent===c));
 const result=[];
 for(let n=0;buckets.some(b=>n<b.length);n++)for(const b of buckets)if(b[n])result.push(b[n]);
 return result;
}

export function privateOsintContinentCoverage(sources,checks,items){
 const healthy=new Set(checks.filter(c=>["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"].includes(c.state)).map(c=>c.source_ref));
 // Source checks are hashed by the shared collector. Match all categories
 // of an endpoint; one healthy fetch covers those registered topic filters.
 const sourceHealthy=s=>s.categories.some(c=>healthy.has(sourceRef(s,c)));
 return Object.fromEntries(Object.entries(CONTINENT_COUNTRIES_195).map(([continent,countries])=>{
  const regional=sources.filter(s=>s.continent===continent),global=sources.filter(s=>s.continent==="global");
  const observed=new Set(items.filter(i=>countries.includes(i.country_iso3)).map(i=>i.country_iso3+":"+i.category));
  return [continent,{country_routes:countries.length,category_routes:countries.length*3,
   regional_endpoints:regional.length,working_regional_endpoints:regional.filter(sourceHealthy).length,
   working_global_fallback_endpoints:global.filter(sourceHealthy).length,
   observed_country_category_cells:observed.size,
   all_country_category_cells_observed:observed.size===countries.length*3}];
 }));
}
import {createHash} from "node:crypto";
const sourceRef=(s,c)=>createHash("sha256").update([s.id,s.url,c].join("\n")).digest("hex");
