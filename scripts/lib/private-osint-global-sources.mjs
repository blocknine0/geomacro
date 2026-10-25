/** Private discovery only. Country of publisher is inventory metadata, never event attribution. */
import {readFileSync} from "node:fs";
import {registeredReusableNewsSources} from "./registered-reusable-news-source-collector.mjs";
import {CONTINENT_COUNTRIES_195} from "./continent-country-195-rotation.mjs";

export const PRIVATE_OSINT_CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
// These expressions detect provisional topics in native-language feed titles.
// They do not translate, corroborate, score, or grant publication authority.
export const PRIVATE_OSINT_TOPICS=Object.freeze({
 geopolitics:/(?:\b(?:wars?|conflicts?|sanctions?|ceasefire|treaty|military|security|diploma\w*|peace|refugees?|elections?|embargo|attacks?|missiles?|border|coup|guerra|conflit\w*|conflito|sanciones|sanções|cessez.le.feu|seguridad|sécurité|elecciones|eleições|militar\w*|diplomaci\w*|frontera|fronteira|paix|krieg|sicherheit|konflikt|angriff)\b|战争|冲突|制裁|停火|軍事|選挙|전쟁|분쟁|제재|حرب|عسكري|عقوبات|انتخابات|войн|конфликт|санкци|যুদ্ধ|নিরাপত্তা|নির্বাচন|संघर्ष|चुनाव|युद्ध)/iu,
 macro:/(?:\b(?:inflation|monetary|central bank|interest rates?|fx|foreign exchange|gdp|currency|tariffs?|economic|economy|fiscal|unemployment|trade|inflación|inflação|inflazione|inflasi|banque centrale|banco central|banca centrale|taux|taxa de juros|tasas? de interés|econom[ií]a|économi\w*|econ[oô]mi\w*|comercio|comércio|desemprego|chômage|pib|devises|währung|zentralbank|zinsen|wirtschaft)\b|经济|通胀|央行|利率|汇率|経済|金融|금리|경제|تضخم|اقتصاد|فائدة|инфляц|эконом|ставк|অর্থনীতি|মূল্যস্ফীতি|সুদের|मुद्रास्फीति|अर्थव्यवस्था|ब्याज)/iu,
 rare_earth:/(?:\b(?:critical minerals?|critical raw materials?|rare[- ]earths?|mining|cobalt|lithium|nickel|graphite|copper|gallium|germanium|neodymium|dysprosium|terbium|tungsten|mineral supply|refinery|minerais? cr[ií]ticos?|minerales? cr[ií]ticos?|terras? raras?|tierras? raras?|terres? rares?|min[eé]raux critiques?|min[eé]raux strat[eé]giques?|minería|mineração|minier\w*|litio|l[ií]tio|cobalto|cobre|cuivre|gali[ou]m|germ[aâ]nio|seltene erden|bergbau|kupfer)\b|关键矿产|稀土|锂|钴|稀土類|希土類|鉱山|희토류|리튬|معادن|редкозем|литий|кобальт|খনিজ|लिथियम|खनिज)/iu,
});

export function privateOsintGlobalSources(){
 const manifest=JSON.parse(readFileSync(new URL("../../config/private-osint-working-sources.v1.json",import.meta.url),"utf8"));
 if(manifest.schema!=="geomacro.private-osint-working-sources.v1"||!Array.isArray(manifest.sources))
  throw Error("PRIVATE_OSINT_GLOBAL_MANIFEST_INVALID");
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
