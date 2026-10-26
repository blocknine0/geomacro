/** Private discovery only. Country of publisher is inventory metadata, never event attribution. */
import {readFileSync} from "node:fs";
import {registeredReusableNewsSources} from "./registered-reusable-news-source-collector.mjs";
import {CONTINENT_COUNTRIES_195} from "./continent-country-195-rotation.mjs";

export const PRIVATE_OSINT_CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
// RNZ's Pacific newsroom is an Oceania regional desk even though RNZ is
// published in New Zealand. Preserve NZL publisher provenance; do not treat
// an arbitrary national feed as a regional fallback.
const RNZ_PACIFIC_REGIONAL_URL="https://www.rnz.co.nz/rss/pacific.xml";
function isRegionalOsintFallback(source,continent){
 return source?.continent===continent&&(
   !source.publisher_country_iso3||
   continent==="oceania"&&source.id==="private_nz_rnz_pacific"&&
   source.publisher_country_iso3==="NZL"&&source.url===RNZ_PACIFIC_REGIONAL_URL
 );
}

// These expressions detect provisional topics in native-language feed titles.
// They do not translate, corroborate, score, or grant publication authority.
export const PRIVATE_OSINT_TOPICS=Object.freeze({
 geopolitics:/(?:\b(?:wars?|conflicts?|sanctions?|ceasefire|treaty|military|security|diploma\w*|peace|refugees?|elections?|embargo|attacks?|missiles?|border|coup|guerra|conflit\w*|conflito|sanciones|sanções|cessez.le.feu|seguridad|sécurité|elecciones|eleições|militar\w*|diplomaci\w*|frontera|fronteira|paix|krieg|sicherheit|konflikt|angriff)\b|战争|冲突|制裁|停火|軍事|選挙|전쟁|분쟁|제재|حرب|عسكري|عقوبات|انتخابات|войн|конфликт|санкци|যুদ্ধ|নিরাপত্তা|নির্বাচন|संघर्ष|चुनाव|युद्ध|מלחמה|צבאי|סנקציות|הפסקת אש|בחירות|גושפנקה|جنگ|تحریم|воєн|війна|wojna|háború)/iu,
 macro:/(?:\b(?:inflation|monetary|central bank|interest rates?|fx|foreign exchange|gdp|currency|tariffs?|economic|economy|fiscal|tax(?:ation)?|revenue|customs|duties?|unemployment|trade|shipping|freight|port congestion|canal transit|cargo|container terminal|cross-border transport|rail corridor|logistics|pipeline flows?|customs clearance|border crossings?|inflación|inflação|inflazione|inflasi|banque centrale|banco central|banca centrale|taux|taxa de juros|tasas? de interés|econom[ií]a|économi\w*|econ[oô]mi\w*|comercio|comércio|desemprego|chômage|pib|devises|währung|zentralbank|zinsen|wirtschaft)\b|经济|通胀|央行|利率|汇率|経済|金融|금리|경제|تضخم|اقتصاد|فائدة|инфляц|эконом|ставк|অর্থনীতি|মূল্যস্ফীতি|সুদের|मुद्रास्फीति|अर्थव्यवस्था|ब्याज|אינפלציה|ריבית|בנק מרכזי|כלכל|שער חליפין|تورم|اقتصادی|بهره|інфляц|inflacja|inflace|infláció|bank centralny)/iu,
 rare_earth:/(?:\b(?:critical minerals?|critical raw materials?|rare[- ]earths?|mining|mine closures?|mining royalties|mineral exports?|ore processing|smelting|refining|battery minerals?|spodumene|bauxite|manganese|vanadium|antimony|indium|scandium|tantalum|niobium|platinum group metals?|cobalt|lithium|nickel|graphite|copper|gallium|germanium|neodymium|dysprosium|terbium|tungsten|mineral supply|refinery|minerais? cr[ií]ticos?|minerales? cr[ií]ticos?|terras? raras?|tierras? raras?|terres? rares?|min[eé]raux critiques?|min[eé]raux strat[eé]giques?|minería|mineração|minier\w*|litio|l[ií]tio|cobalto|cobre|cuivre|gali[ou]m|germ[aâ]nio|seltene erden|bergbau|kupfer)\b|关键矿产|稀土|锂|钴|稀土類|希土類|鉱山|희토류|리튬|معادن|редкозем|литий|кобальт|খনিজ|लिथियम|खनिज|מינרלים|ליתיום|קובלט|נחושת|יסודות נדירים|معادن کمیاب|مواد معدنی|літій|рідкозем|górnictwo|bányászat)/iu,
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

 // Dedicated Macro/FX, Critical Minerals and transport-corridor additions.
 // The list contains candidates only: real HTTP/native-clock checks on each
 // tick decide if anything is observed. No rights or 15m guarantees inherited.
 const canonicalCorridors=JSON.parse(readFileSync(new URL(
  "../../config/operator-corridor-source-crosswalk.v1.json",import.meta.url),"utf8"));
 const corridorIds=new Set(canonicalCorridors.corridors.map(c=>c.id));
 const regional=JSON.parse(readFileSync(new URL(
  "../../config/private-osint-regional-corridor-additions.v1.json",import.meta.url),"utf8"));
 if(regional?.schema!=="geomacro.private-osint-regional-corridor-additions.v1"||
    regional.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    !Array.isArray(regional.sources)||regional.sources.length>48)
   throw Error("PRIVATE_OSINT_REGIONAL_EXPANSION_INVALID");
 const additionIds=new Set();
 for(const source of regional.sources){
  let u,discoveryUrl=null;try{u=new URL(source.url);if(source.discovery_reference_url!==undefined)discoveryUrl=new URL(source.discovery_reference_url)}catch{throw Error("PRIVATE_OSINT_REGIONAL_URL_INVALID")}
  const discoveryRefInvalid=source.discovery_reference_url!==undefined&&(!discoveryUrl||discoveryUrl.protocol!=="https:"||!discoveryUrl.hostname.includes(".")||discoveryUrl.username||discoveryUrl.password||discoveryUrl.port||discoveryUrl.hash);
  const violations=[];
  if(discoveryRefInvalid)violations.push("DISCOVERY_REFERENCE");
  if(!/^private_expansion_[a-z0-9_]+$/u.test(source.id))violations.push("ID");
  if(additionIds.has(source.id))violations.push("DUPLICATE_ID");
  if(u.protocol!=="https:"||!u.hostname.includes(".")||u.username||u.password||u.port||u.hash)violations.push("UNSAFE_FEED_URL");
  if(!["global",...Object.keys(CONTINENT_COUNTRIES_195)].includes(source.continent))violations.push("CONTINENT");
  if(source.publisher_country_iso3!==null&&!Object.values(CONTINENT_COUNTRIES_195).flat().includes(source.publisher_country_iso3))violations.push("PUBLISHER_COUNTRY");
  if(!["rss","atom","rdf"].includes(source.type))violations.push("FEED_TYPE");
  if(!Array.isArray(source.categories)||!source.categories.length||source.categories.length>PRIVATE_OSINT_CATEGORIES.length||new Set(source.categories).size!==source.categories.length||source.categories.some(category=>!PRIVATE_OSINT_CATEGORIES.includes(category)))violations.push("CATEGORIES");
  if(!Array.isArray(source.related_corridor_ids)||source.related_corridor_ids.some(id=>!corridorIds.has(id))||new Set(source.related_corridor_ids).size!==source.related_corridor_ids.length)violations.push("CORRIDOR_REFERENCES");
  if(source.activation_state!=="RUNTIME_PROBE_REQUIRED")violations.push("ACTIVATION_STATE");
  if(source.provider_rights_verified!==false)violations.push("RIGHTS_GUARD");
  if(source.commercial_eligible!==false)violations.push("COMMERCIAL_GUARD");
  if(source.access_verified_in_production!==false)violations.push("PRODUCTION_ACCESS_GUARD");
  if(source.publicly_deliverable!==false)violations.push("PUBLIC_DELIVERY_GUARD");
  if(violations.length)throw Error("PRIVATE_OSINT_REGIONAL_SOURCE_UNSAFE_OR_DUPLICATE:"+source.id+":"+violations.join(","));
  additionIds.add(source.id);
  // If a feed URL already exists under the canonical reusable-source registry,
  // merge its category/provenance metadata into that one fetch identity rather
  // than throwing away a useful lane or polling the same URL twice.
  const registered=map.get(source.url);
  const reusable=existing.get(source.url);
  if(registered){
   map.set(source.url,{...registered,...source,id:registered.id,
    categories:[...new Set([...registered.categories,...source.categories])],
    related_corridor_ids:[...new Set([...(registered.related_corridor_ids??[]),...source.related_corridor_ids])],
    supported:true,
    transport_verified_at_registration:registered.transport_verified_at_registration===true});
   continue;
  }
  if(reusable){
   map.set(source.url,{...reusable,...source,id:reusable.id,
    categories:[...new Set([...reusable.categories,...source.categories])],
    supported:true,transport_verified_at_registration:false});
   continue;
  }
  map.set(source.url,{...source,supported:true,transport_verified_at_registration:false});
 }
 // Extra country-local official publisher candidate paths are PRIVATE probes,
 // not pre-certified national feeds. Runtime HTTP/parser/native-date status is
 // the only authority to mark an endpoint healthy. Never assign an event
 // country from the source's publisher country.
 const local=JSON.parse(readFileSync(new URL(
  "../../config/private-osint-local-rss-candidates.v1.json",import.meta.url),"utf8"));
 if(local?.schema!=="geomacro.private-osint-local-rss-candidates.v1"||
    local.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    !Array.isArray(local.sources)||local.sources.length>28)
  throw Error("PRIVATE_OSINT_LOCAL_CANDIDATE_MANIFEST_INVALID");
 const localIds=new Set();
 for(const source of local.sources){
  let url,reference;
  try{url=new URL(source.url);reference=new URL(source.discovery_reference_url)}
  catch{throw Error("PRIVATE_OSINT_LOCAL_CANDIDATE_URL_INVALID")}
  const knownContinent=Object.entries(CONTINENT_COUNTRIES_195)
   .find(([,countries])=>countries.includes(source.publisher_country_iso3))?.[0];
  if(!/^private_local_candidate_[a-z0-9_]+$/u.test(source.id)||
     localIds.has(source.id)||map.has(source.url)||existing.has(source.url)||
     url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     !url.hostname.includes(".")||
     reference.protocol!=="https:"||reference.username||reference.password||
     reference.port||reference.hash||
     knownContinent!==source.continent||
     source.type!=="rss"||
     !Array.isArray(source.categories)||!source.categories.length||
     new Set(source.categories).size!==source.categories.length||
     source.categories.some(category=>!PRIVATE_OSINT_CATEGORIES.includes(category))||
     source.activation_state!=="RUNTIME_PROBE_REQUIRED"||
     source.source_kind!=="LOCAL_PUBLISHER_INDEX_CANDIDATE"||
     source.publisher_native_dates_required!==true||
     source.transport_verified_at_registration!==false||
     source.private_only!==true||
     source.provider_rights_verified!==false||
     source.commercial_eligible!==false||
     source.access_verified_in_production!==false||
     source.publicly_deliverable!==false)
   throw Error("PRIVATE_OSINT_LOCAL_CANDIDATE_UNSAFE_OR_DUPLICATE:"+source?.id);
  localIds.add(source.id);
  map.set(source.url,{...source,supported:true});
 }
 // Interleave continents so an individual slow regional desk cannot put
 // another continent at the back of a large sequential registry group.
 const buckets=["global",...Object.keys(CONTINENT_COUNTRIES_195)].map(c=>[...map.values()].filter(s=>s.continent===c));
 const result=[];
 for(let n=0;buckets.some(b=>n<b.length);n++)for(const b of buckets)if(b[n])result.push(b[n]);
 // Refuse a registry regression that silently drops a major OSINT lane.
 // This threshold validates source diversity, not event volume or live health.
 for(const category of PRIVATE_OSINT_CATEGORIES){
  const configured=result.filter(source=>source.categories.includes(category)).length;
  if(configured<12)throw Error("PRIVATE_OSINT_CATEGORY_SOURCE_DIVERSITY_TOO_LOW:"+category);
 }
 return result;
}

export function privateOsintContinentCoverage(sources,checks,items){
 const healthy=new Set(checks.filter(c=>["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"].includes(c.state)).map(c=>c.source_ref));
 // Source checks are hashed by the shared collector. Match all categories
 // of an endpoint; one healthy fetch covers those registered topic filters.
 const sourceHealthy=s=>s.categories.some(c=>healthy.has(sourceRef(s,c)));
 return Object.fromEntries(Object.entries(CONTINENT_COUNTRIES_195).map(([continent,countries])=>{
  const regional=sources.filter(s=>isRegionalOsintFallback(s,continent)),global=sources.filter(s=>s.continent==="global"&&!s.publisher_country_iso3);
  const observed=new Set(items.filter(i=>countries.includes(i.country_iso3)).map(i=>i.country_iso3+":"+i.category));
  return [continent,{country_routes:countries.length,category_routes:countries.length*3,
   regional_endpoints:regional.length,working_regional_endpoints:regional.filter(sourceHealthy).length,
   working_global_fallback_endpoints:global.filter(sourceHealthy).length,
   observed_country_category_cells:observed.size,
   all_country_category_cells_observed:observed.size===countries.length*3}];
 }));
}
import {createHash} from "node:crypto";
/**
 * Publisher-country registry coverage is an inventory metric, not event
 * attribution. A country code describes the source publishing authority;
 * it never means every event in that country is covered.
 */
export function privateOsintPublisherCountryCoverage(sources, checks, {includeDetails=false}={}) {
 if(!Array.isArray(sources)||!Array.isArray(checks)||typeof includeDetails!=="boolean")
  throw Error("PRIVATE_OSINT_PUBLISHER_COUNTRY_COVERAGE_INPUT_INVALID");
 const countries=Object.values(CONTINENT_COUNTRIES_195).flat();
 const known=new Set(countries);
 const healthyStates=new Set(["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"]);
 const stateByRef=new Map(checks.filter(c=>c&&typeof c.source_ref==="string").map(c=>[c.source_ref,c.state]));
 const rows=Object.fromEntries(countries.map(iso3=>[iso3,{
  registered_endpoints:0,working_endpoints:0,
  registered_categories:new Set(),working_categories:new Set(),
 }]));
 const registryCells=new Set(),workingCells=new Set();
 let countrySpecificEndpoints=0,workingCountrySpecificEndpoints=0,globalOrUnknownEndpoints=0;
 for(const source of sources){
  const iso3=source?.publisher_country_iso3;
  if(!iso3||!known.has(iso3)){globalOrUnknownEndpoints++;continue}
  countrySpecificEndpoints++;
  const row=rows[iso3];row.registered_endpoints++;
  let endpointWorking=false;
  for(const category of source.categories??[]){
   if(!PRIVATE_OSINT_CATEGORIES.includes(category))continue;
   row.registered_categories.add(category);
   registryCells.add(iso3+":"+category);
   if(healthyStates.has(stateByRef.get(sourceRef(source,category)))){
    endpointWorking=true;
    row.working_categories.add(category);
    workingCells.add(iso3+":"+category);
   }
  }
  if(endpointWorking){row.working_endpoints++;workingCountrySpecificEndpoints++}
 }
 const categoryCount=PRIVATE_OSINT_CATEGORIES.length;
 const byCountry=Object.fromEntries(Object.entries(rows).map(([iso3,row])=>[iso3,{
  registered_endpoints:row.registered_endpoints,
  working_endpoints:row.working_endpoints,
  registered_categories:[...row.registered_categories].sort(),
  working_categories:[...row.working_categories].sort(),
  missing_registered_categories:PRIVATE_OSINT_CATEGORIES.filter(c=>!row.registered_categories.has(c)),
  missing_working_categories:PRIVATE_OSINT_CATEGORIES.filter(c=>!row.working_categories.has(c)),
 }]));
 const byContinent=Object.fromEntries(Object.entries(CONTINENT_COUNTRIES_195).map(([continent,iso3s])=>{
  const countryRows=iso3s.map(iso3=>rows[iso3]);
  return [continent,{
   country_count:iso3s.length,
   countries_with_any_publisher_endpoint:countryRows.filter(x=>x.registered_endpoints>0).length,
   countries_with_all_three_category_feeds:countryRows.filter(x=>x.registered_categories.size===categoryCount).length,
   countries_with_no_publisher_endpoint:countryRows.filter(x=>x.registered_endpoints===0).length,
   registered_country_category_cells:countryRows.reduce((n,x)=>n+x.registered_categories.size,0),
   working_country_category_cells:countryRows.reduce((n,x)=>n+x.working_categories.size,0),
  }];
 }));
 const summary={
  schema:"geomacro.private-osint-publisher-country-coverage.v1",
  interpretation:"Publisher-country inventory only; not event-country coverage, truth verification, source rights, or proof every country/category has a working local source.",
  country_count:countries.length,
  category_count:categoryCount,
  country_category_slots:countries.length*categoryCount,
  publisher_country_specific_endpoints:countrySpecificEndpoints,
  working_publisher_country_specific_endpoints:workingCountrySpecificEndpoints,
  global_or_unknown_publisher_endpoints:globalOrUnknownEndpoints,
  countries_with_any_publisher_endpoint:Object.values(rows).filter(x=>x.registered_endpoints>0).length,
  countries_with_all_three_category_feeds:Object.values(rows).filter(x=>x.registered_categories.size===categoryCount).length,
  countries_with_no_publisher_endpoint:Object.values(rows).filter(x=>x.registered_endpoints===0).length,
  registered_country_category_cells:registryCells.size,
  missing_registered_country_category_cells:countries.length*categoryCount-registryCells.size,
  working_country_category_cells:workingCells.size,
  unverified_or_unavailable_country_category_cells:countries.length*categoryCount-workingCells.size,
  by_continent:byContinent,
 };
 if(includeDetails){
  summary.countries_without_publisher_specific_endpoint=countries.filter(iso3=>rows[iso3].registered_endpoints===0);
  summary.missing_registered_country_category_cells_detail=countries.flatMap(iso3=>
   PRIVATE_OSINT_CATEGORIES.filter(category=>!rows[iso3].registered_categories.has(category))
    .map(category=>({country_iso3:iso3,category})));
  summary.by_country=byCountry;
 }
 return summary;
}
const sourceRef=(s,c)=>createHash("sha256").update([s.id,s.url,c].join("\n")).digest("hex");

const HEALTHY_SOURCE_STATES=new Set(["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"]);
const KNOWN_SOURCE_STATES=new Set(["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW","UNAVAILABLE","UNSUPPORTED_FORMAT","DENIED","MALFORMED","NOT_DUE"]);
const COUNTRY_CONTINENT=Object.fromEntries(Object.entries(CONTINENT_COUNTRIES_195).flatMap(([continent,countries])=>countries.map(iso3=>[iso3,continent])));

/**
 * 195-country × 3-category acquisition matrix for the private source registry.
 * A local source means publisher-country metadata matches the country.
 * A regional fallback means the source is marked for the same continent and
 * has no asserted publisher country. Global sources are counted separately.
 * Health describes this collector tick only; it is not event verification,
 * proof every country has a local publisher, or commercial source rights.
 */
export function privateOsintCountryCategoryCoverage(sources,checks=[],items=[],{includeCells=false}={}){
 if(!Array.isArray(sources)||!Array.isArray(checks)||!Array.isArray(items)||typeof includeCells!=="boolean")
  throw Error("PRIVATE_OSINT_COUNTRY_CATEGORY_COVERAGE_INPUT_INVALID");
 const countries=Object.values(CONTINENT_COUNTRIES_195).flat();
 if(countries.length!==195||new Set(countries).size!==195)
  throw Error("PRIVATE_OSINT_COUNTRY_CATEGORY_COVERAGE_REGISTRY_INVALID");
 const stateByRef=new Map();
 for(const check of checks){
  if(!check||typeof check.source_ref!=="string"||!/^[a-f0-9]{64}$/u.test(check.source_ref)||
     !KNOWN_SOURCE_STATES.has(check.state))throw Error("PRIVATE_OSINT_COUNTRY_CATEGORY_CHECK_INVALID");
  stateByRef.set(check.source_ref,check.state);
 }
 const registryUrls=new Set();
 for(const source of sources){
  if(!source||typeof source.id!=="string"||typeof source.url!=="string"||!Array.isArray(source.categories))
   throw Error("PRIVATE_OSINT_COUNTRY_CATEGORY_SOURCE_INVALID");
  let u;try{u=new URL(source.url)}catch{throw Error("PRIVATE_OSINT_COUNTRY_CATEGORY_SOURCE_URL_INVALID")}
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||registryUrls.has(source.url)||
    !source.categories.length||source.categories.some(c=>!PRIVATE_OSINT_CATEGORIES.includes(c))||
    (source.publisher_country_iso3!==null&&source.publisher_country_iso3!==undefined&&!COUNTRY_CONTINENT[source.publisher_country_iso3])||
    (source.continent!==undefined&&source.continent!==null&&source.continent!=="global"&&!Object.hasOwn(CONTINENT_COUNTRIES_195,source.continent)))
   throw Error("PRIVATE_OSINT_COUNTRY_CATEGORY_SOURCE_SCOPE_INVALID");
  registryUrls.add(source.url);
 }
 const countTier=(registry,category)=>{
  const counts={registered:registry.length,checked:0,healthy:0,not_due:0,unavailable:0,unsupported_format:0,denied:0,malformed:0,unobserved_checks:0};
  for(const source of registry){
   const state=stateByRef.get(sourceRef(source,category));
   if(!state){counts.unobserved_checks++;continue}
   counts.checked++;
   if(HEALTHY_SOURCE_STATES.has(state))counts.healthy++;
   if(state==="NOT_DUE")counts.not_due++;
   if(state==="UNAVAILABLE")counts.unavailable++;
   if(state==="UNSUPPORTED_FORMAT")counts.unsupported_format++;
   if(state==="DENIED")counts.denied++;
   if(state==="MALFORMED")counts.malformed++;
  }
  return counts;
 };
 const cells=[];
 for(const iso3 of countries){
  const continent=COUNTRY_CONTINENT[iso3];
  for(const category of PRIVATE_OSINT_CATEGORIES){
   const local=sources.filter(s=>s.publisher_country_iso3===iso3&&s.categories.includes(category));
   const regional=sources.filter(s=>isRegionalOsintFallback(s,continent)&&s.categories.includes(category));
   const global=sources.filter(s=>s.continent==="global"&&!s.publisher_country_iso3&&s.categories.includes(category));
   const tiers={local:countTier(local,category),regional:countTier(regional,category),global:countTier(global,category)};
   const registered=tiers.local.registered+tiers.regional.registered+tiers.global.registered;
   const checked=tiers.local.checked+tiers.regional.checked+tiers.global.checked;
   const healthy=tiers.local.healthy+tiers.regional.healthy+tiers.global.healthy;
   const tier=tiers.local.healthy?"LOCAL_SOURCE_HEALTHY":
     tiers.regional.healthy?"REGIONAL_FALLBACK_HEALTHY":
     tiers.global.healthy?"GLOBAL_FALLBACK_HEALTHY":
     registered===0?"NO_SOURCE_CONFIGURED":
     checked===0?"CONFIGURED_NOT_YET_CHECKED":"NO_HEALTHY_SOURCE_IN_LAST_TICK";
   const observed=items.filter(item=>item&&item.country_iso3===iso3&&item.category===category).length;
   cells.push({country_iso3:iso3,continent,category,source_tier_status:tier,
    local:tiers.local,regional:tiers.regional,global:tiers.global,
    configured_source_slots:registered,checked_source_slots:checked,healthy_source_slots:healthy,
    observed_private_items_this_tick:observed,
    local_publisher_source_present:tiers.local.registered>0,
    regional_or_global_fallback_present:tiers.regional.registered+tiers.global.registered>0,
    event_country_verified:false,original_source_rights_verified:false,commercially_eligible:false});
  }
 }
 const aggregate=(subset)=>({
  cells:subset.length,
  cells_with_local_source:subset.filter(x=>x.local.registered>0).length,
  cells_with_local_source_healthy:subset.filter(x=>x.local.healthy>0).length,
  cells_with_regional_fallback:subset.filter(x=>x.regional.registered>0).length,
  cells_with_regional_fallback_healthy:subset.filter(x=>x.regional.healthy>0).length,
  cells_with_global_fallback:subset.filter(x=>x.global.registered>0).length,
  cells_with_global_fallback_healthy:subset.filter(x=>x.global.healthy>0).length,
  cells_with_any_configured_source:subset.filter(x=>x.configured_source_slots>0).length,
  cells_with_any_healthy_source:subset.filter(x=>x.healthy_source_slots>0).length,
  cells_without_configured_source:subset.filter(x=>x.configured_source_slots===0).length,
  cells_without_healthy_source:subset.filter(x=>x.healthy_source_slots===0).length,
  observed_country_category_cells_this_tick:subset.filter(x=>x.observed_private_items_this_tick>0).length,
  observed_private_items_this_tick:subset.reduce((n,x)=>n+x.observed_private_items_this_tick,0),
 });
 const byContinent=Object.fromEntries(Object.entries(CONTINENT_COUNTRIES_195).map(([continent,iso3s])=>[continent,aggregate(cells.filter(x=>iso3s.includes(x.country_iso3)))]));
 const byCategory=Object.fromEntries(PRIVATE_OSINT_CATEGORIES.map(category=>[category,aggregate(cells.filter(x=>x.category===category))]));
 const countryLocal=new Map(countries.map(iso3=>[iso3,sources.filter(s=>s.publisher_country_iso3===iso3)]));
 const countriesWithLocal=countries.filter(iso3=>countryLocal.get(iso3).length>0);
 const summary={
  schema:"geomacro.private-osint-country-category-source-coverage.v1",
  country_count:195,category_count:3,expected_country_category_cells:585,returned_country_category_cells:cells.length,
  scope:"PRIVATE_SOURCE_ACQUISITION_COVERAGE_NOT_PUBLIC_FIND_COVERAGE",
  source_tier_order:"LOCAL_THEN_REGIONAL_THEN_GLOBAL_FOR_REPORTING_ONLY",
  local_means_publisher_country_metadata_match:true,
  regional_means_same_continent_without_publisher_country:true,
  global_means_source_continent_is_global:true,
  a_healthy_feed_does_not_prove_a_recent_event:true,
  zero_observed_items_does_not_mean_no_news:true,
  publisher_country_is_not_event_country:true,
  country_specific_source_countries_registered:countriesWithLocal.length,
  countries_without_country_specific_publisher_source_count:countries.length-countriesWithLocal.length,
  coverage:aggregate(cells),by_continent:byContinent,by_category:byCategory,
 };
 if(includeCells){
  summary.cells=cells;
  summary.countries_without_country_specific_publisher_source=countries.filter(iso3=>countryLocal.get(iso3).length===0);
 }
 if(cells.length!==585)
  throw Error("PRIVATE_OSINT_COUNTRY_CATEGORY_COVERAGE_INCOMPLETE");
 return summary;
}

/**
 * Category-level live feed coverage: configured endpoints and current-tick
 * transport/feed health are deliberately separate from stories observed.
 * OBSERVED and EMPTY_OR_OUTSIDE_WINDOW mean a feed was readable/parsed;
 * only dated matching items count as observations, and neither is verified
 * intelligence, publication rights, or a promise of a story every poll.
 */
export function privateOsintCategoryLiveCoverage(sources,checks=[],items=[]){
 if(!Array.isArray(sources)||!Array.isArray(checks)||!Array.isArray(items))
  throw Error("PRIVATE_OSINT_CATEGORY_LIVE_COVERAGE_INPUT_INVALID");
 const statesByRef=new Map();
 for(const check of checks){
  if(!check||typeof check.source_ref!=="string"||!/^[a-f0-9]{64}$/u.test(check.source_ref)||
     !KNOWN_SOURCE_STATES.has(check.state))throw Error("PRIVATE_OSINT_CATEGORY_LIVE_COVERAGE_CHECK_INVALID");
  statesByRef.set(check.source_ref,check.state);
 }
 const categories=PRIVATE_OSINT_CATEGORIES.map(category=>{
  const endpoints=sources.filter(source=>source&&typeof source.id==="string"&&
   typeof source.url==="string"&&Array.isArray(source.categories)&&source.categories.includes(category));
  const health={registered:endpoints.length,checked:0,healthy:0,observed:0,empty:0,not_due:0,unavailable:0,unsupported_format:0,denied:0,malformed:0,unobserved_checks:0};
  const healthyIds=new Set();
  for(const source of endpoints){
   const state=statesByRef.get(sourceRef(source,category));
   if(!state){health.unobserved_checks++;continue}
   health.checked++;
   if(HEALTHY_SOURCE_STATES.has(state)){health.healthy++;healthyIds.add(source.url)}
   if(state==="OBSERVED"){health.observed++;}
   if(state==="EMPTY_OR_OUTSIDE_WINDOW"){health.empty++;}
   if(state==="NOT_DUE")health.not_due++;
   if(state==="UNAVAILABLE")health.unavailable++;
   if(state==="UNSUPPORTED_FORMAT")health.unsupported_format++;
   if(state==="DENIED")health.denied++;
   if(state==="MALFORMED")health.malformed++;
  }
  const itemCount=items.filter(item=>item&&item.category===category&&
   item.source&&typeof item.source.original_published_at==="string").length;
  const status=healthyIds.size>0&&itemCount>0?"LIVE_FEED_AND_DATED_ITEMS_THIS_TICK":
   healthyIds.size>0?"LIVE_FEED_HEALTHY_NO_MATCHING_DATED_ITEMS":
   endpoints.length===0?"NO_SOURCE_REGISTERED":"NO_HEALTHY_FEED_THIS_TICK";
  return {category,...health,healthy_distinct_feed_endpoints:healthyIds.size,
   native_dated_items_in_collector_batch:itemCount,status,
   a_healthy_feed_does_not_guarantee_a_new_story:true,
   event_country_verified:false,commercially_eligible:false};
 });
 const rowsByStatus=Object.fromEntries([
  "LIVE_FEED_AND_DATED_ITEMS_THIS_TICK",
  "LIVE_FEED_HEALTHY_NO_MATCHING_DATED_ITEMS",
  "NO_HEALTHY_FEED_THIS_TICK","NO_SOURCE_REGISTERED",
 ].map(status=>[status,categories.filter(row=>row.status===status).length]));
 return {
  schema:"geomacro.private-osint-category-live-source-coverage.v1",
  expected_categories:PRIVATE_OSINT_CATEGORIES.length,
  categories_with_registered_sources:categories.filter(row=>row.registered>0).length,
  categories_with_any_healthy_feed_this_tick:categories.filter(row=>row.healthy_distinct_feed_endpoints>0).length,
  all_categories_have_registered_sources:categories.every(row=>row.registered>0),
  all_categories_have_healthy_feed_this_tick:categories.every(row=>row.healthy_distinct_feed_endpoints>0),
  categories_with_native_dated_items_this_tick:categories.filter(row=>row.native_dated_items_in_collector_batch>0).length,
  all_categories_have_native_dated_items_this_tick:categories.every(row=>row.native_dated_items_in_collector_batch>0),
  observation_scope:"PRIVATE_OSINT_FEED_TRANSPORT_AND_NATIVE_DATED_ITEM_COUNTS_NOT_VERIFIED_EVENTS",
  source_states:{...rowsByStatus},
  no_healthy_feed_is_reported_as_a_gap_not_success:true,
  category_coverage:categories,
 };
}

/**
 * Route-level source acquisition coverage for the 58 canonical corridors.
 * Canonical monitor_refs and overlay links are reference metadata only;
 * private feed health is reported separately from those references.
 * None of these counts proves physical-flow coverage, route geometry, a
 * current disruption, source rights, or commercial risk eligibility.
 */
export function privateOsintCorridorSourceCoverage(sources,checks=[],{includeCells=false}={}){
 if(!Array.isArray(sources)||!Array.isArray(checks)||typeof includeCells!=="boolean")
  throw Error("PRIVATE_OSINT_CORRIDOR_SOURCE_COVERAGE_INPUT_INVALID");
 const canonical=JSON.parse(readFileSync(new URL("../../config/operator-corridor-source-crosswalk.v1.json",import.meta.url),"utf8"));
 const overlay=JSON.parse(readFileSync(new URL("../../config/private-osint-corridor-reference-overlay.v1.json",import.meta.url),"utf8"));
 privateOsintCorridorReferenceCoverage();
 if(canonical?.schema!=="geomacro.operator-corridor-source-crosswalk.v1"||
    !Array.isArray(canonical.corridors)||canonical.corridors.length!==58||
    !Array.isArray(canonical.source_registry)||
    !Array.isArray(overlay.sources))throw Error("PRIVATE_OSINT_CORRIDOR_SOURCE_REGISTRY_INVALID");
 const corridors=canonical.corridors,known=new Set(corridors.map(c=>c.id));
 if(known.size!==58)throw Error("PRIVATE_OSINT_CORRIDOR_SOURCE_IDS_INVALID");
 const stateByRef=new Map();
 for(const check of checks){
  if(!check||typeof check.source_ref!=="string"||!/^[a-f0-9]{64}$/u.test(check.source_ref)||
     !KNOWN_SOURCE_STATES.has(check.state))throw Error("PRIVATE_OSINT_CORRIDOR_CHECK_INVALID");
  stateByRef.set(check.source_ref,check.state);
 }
 const sourceIds=new Set(canonical.source_registry.map(s=>s.source_id));
 const cells=corridors.map(corridor=>{
  if(!corridor||typeof corridor.id!=="string"||typeof corridor.name!=="string")
   throw Error("PRIVATE_OSINT_CORRIDOR_ROW_INVALID");
  const monitorRefs=Array.isArray(corridor.monitor_refs)?corridor.monitor_refs:[];
  const knownMonitorRefs=monitorRefs.filter(ref=>ref&&typeof ref.source_id==="string"&&sourceIds.has(ref.source_id));
  const overlaySources=overlay.sources.filter(s=>(s.related_corridor_ids??[]).includes(corridor.id));
  const feedSources=sources.filter(s=>Array.isArray(s.related_corridor_ids)&&s.related_corridor_ids.includes(corridor.id));
  let checkedFeedSources=0,healthyFeedSources=0,notDueFeedSources=0,unavailableFeedSources=0,deniedFeedSources=0,malformedFeedSources=0,unsupportedFeedSources=0;
  const feedSourceStates=[];
  for(const source of feedSources){
   const states=(source.categories??[]).map(category=>stateByRef.get(sourceRef(source,category))).filter(Boolean);
   if(states.length)checkedFeedSources++;
   if(states.some(state=>HEALTHY_SOURCE_STATES.has(state)))healthyFeedSources++;
   if(states.includes("NOT_DUE"))notDueFeedSources++;
   if(states.includes("UNAVAILABLE"))unavailableFeedSources++;
   if(states.includes("DENIED"))deniedFeedSources++;
   if(states.includes("MALFORMED"))malformedFeedSources++;
   if(states.includes("UNSUPPORTED_FORMAT"))unsupportedFeedSources++;
   feedSourceStates.push({source_id:source.id,category_count:(source.categories??[]).length,checked_categories:states.length,healthy:states.some(state=>HEALTHY_SOURCE_STATES.has(state)),states:[...new Set(states)].sort()});
  }
  const status=healthyFeedSources>0?"PRIVATE_FEED_HEALTHY_THIS_TICK":
   checkedFeedSources>0?"PRIVATE_FEEDS_CHECKED_NONE_HEALTHY":
   feedSources.length>0?"PRIVATE_FEED_CANDIDATE_NOT_CHECKED_THIS_TICK":
   monitorRefs.length>0||overlaySources.length>0?"REFERENCE_ONLY_NOT_LIVE":"NO_LINKED_SOURCE_REFERENCE";
  return {
   corridor_id:corridor.id,corridor_name:corridor.name,corridor_type:corridor.type??"unknown",
   canonical_monitor_reference_count:monitorRefs.length,
   canonical_monitor_refs_matched_to_source_registry:knownMonitorRefs.length,
   overlay_reference_surface_count:overlaySources.length,
   private_osint_feed_candidate_count:feedSources.length,
   private_osint_feed_sources_checked_this_tick:checkedFeedSources,
   private_osint_feed_sources_healthy_this_tick:healthyFeedSources,
   private_osint_feed_sources_not_due:notDueFeedSources,
   private_osint_feed_sources_unavailable:unavailableFeedSources,
   private_osint_feed_sources_denied:deniedFeedSources,
   private_osint_feed_sources_malformed:malformedFeedSources,
   private_osint_feed_sources_unsupported:unsupportedFeedSources,
   acquisition_status:status,
   route_geometry_certified:false,physical_flow_verified:false,current_disruption_verified:false,
   source_rights_verified:false,commercially_eligible:false,
   ...(includeCells?{monitor_refs:monitorRefs.map(ref=>({source_id:ref.source_id,link_state:ref.link_state??null})),overlay_reference_ids:overlaySources.map(s=>s.id),private_feed_sources:feedSourceStates}:{}),
  };
 });
 const aggregate=rows=>({
  corridors:rows.length,
  with_canonical_monitor_reference:rows.filter(c=>c.canonical_monitor_reference_count>0).length,
  with_monitor_reference_matched_to_registry:rows.filter(c=>c.canonical_monitor_refs_matched_to_source_registry>0).length,
  with_overlay_reference_surface:rows.filter(c=>c.overlay_reference_surface_count>0).length,
  with_private_feed_candidate:rows.filter(c=>c.private_osint_feed_candidate_count>0).length,
  with_private_feed_checked_this_tick:rows.filter(c=>c.private_osint_feed_sources_checked_this_tick>0).length,
  with_private_feed_healthy_this_tick:rows.filter(c=>c.private_osint_feed_sources_healthy_this_tick>0).length,
  with_no_private_feed_candidate:rows.filter(c=>c.private_osint_feed_candidate_count===0).length,
  with_no_source_reference:rows.filter(c=>c.canonical_monitor_reference_count===0&&c.overlay_reference_surface_count===0&&c.private_osint_feed_candidate_count===0).length,
 });
 const summary={
  schema:"geomacro.private-osint-corridor-source-coverage.v1",
  corridor_count:58,returned_corridors:cells.length,
  scope:"CANONICAL_MONITOR_REFERENCES_AND_PRIVATE_FEED_CANDIDATES_NOT_PHYSICAL_FLOW_VERIFICATION",
  overlay_reference_scope:"DISCOVERY_ONLY_NO_AUTO_SCRAPING",
  health_scope:"CURRENT_PRIVATE_COLLECTOR_TICK_ONLY",
  physical_flow_verified:false,route_geometry_certified:false,current_disruption_verified:false,source_rights_verified:false,commercial_delivery_enabled:false,
  coverage:aggregate(cells),
 };
 if(includeCells)summary.cells=cells;
 if(cells.length!==58)
  throw Error("PRIVATE_OSINT_CORRIDOR_SOURCE_COVERAGE_INCOMPLETE");
 return summary;
}

/** Registration coverage only; official HTML/API discovery references are NOT auto-scraped. */
export function privateOsintCorridorReferenceCoverage(){
 const canonical=JSON.parse(readFileSync(new URL(
  "../../config/operator-corridor-source-crosswalk.v1.json",import.meta.url),"utf8"));
 const overlay=JSON.parse(readFileSync(new URL(
  "../../config/private-osint-corridor-reference-overlay.v1.json",import.meta.url),"utf8"));
 if(canonical.schema!=="geomacro.operator-corridor-source-crosswalk.v1"||
    overlay.schema!=="geomacro.private-osint-corridor-reference-overlay.v1"||
    overlay.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    overlay.no_automatic_scraping!==true||
    !Array.isArray(overlay.sources)||overlay.sources.length>64)
   throw Error("PRIVATE_OSINT_CORRIDOR_OVERLAY_INVALID");
 const known=new Set(canonical.corridors.map(x=>x.id));
 const monitored=new Set(),identities=new Set(),urls=new Set();
 const byCategory={macro:0,rare_earth:0};
 for(const source of overlay.sources){
  let url;try{url=new URL(source.url)}catch{throw Error("PRIVATE_OSINT_CORRIDOR_REFERENCE_URL_INVALID")}
  if(!/^corridor_reference_[a-z0-9_]+$/u.test(source.id)||
     identities.has(source.id)||urls.has(source.url)||
     url.protocol!=="https:"||!url.hostname.includes(".")||
     url.username||url.password||url.port||url.hash||
     !["global",...Object.keys(CONTINENT_COUNTRIES_195)].includes(source.continent)||
     !["macro","rare_earth"].includes(source.category)||
     !Array.isArray(source.related_corridor_ids)||
     source.related_corridor_ids.some(id=>!known.has(id))||
     new Set(source.related_corridor_ids).size!==source.related_corridor_ids.length||
     source.transport_tested!==false||source.source_rights_verified!==false||
     source.commercial_eligible!==false||source.auto_ingest_enabled!==false)
   throw Error("PRIVATE_OSINT_CORRIDOR_REFERENCE_UNSAFE");
  identities.add(source.id);urls.add(source.url);
  byCategory[source.category]++;
  for(const id of source.related_corridor_ids)monitored.add(id);
 }
 return Object.freeze({
  total_canonical_corridors:known.size,
  referenced_corridors:monitored.size,
  unreferenced_corridors:known.size-monitored.size,
  newly_registered_reference_surfaces:overlay.sources.length,
  reference_surfaces_by_category:byCategory,
  automatic_scraping_enabled:false,
  transport_tested:false,
  commercial_delivery_enabled:false,
  route_geometry_certified:false,
 });
}
