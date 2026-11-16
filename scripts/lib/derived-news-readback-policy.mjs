/**
 * Shared privacy/scope contract for source-neutral derived-news readback.
 *
 * An "osint_feed_observed_unverified" card may carry one monitored-feed
 * hostname as provenance. That domain-only label is NOT an article URL or
 * permission to redistribute the source. The upstream reader separately pins
 * source URLs; this boundary validates only the public provenance shape. URLs, paths and upstream content
 * remain forbidden in public prose and in all other provenance records.
 */
export const DERIVED_NEWS_TOPIC_POLICY_REVISION = 5;

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const PROSE_URL_OR_DOMAIN_PATH = /(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+[a-z]{2,63}\/)/iu;
const AGGREGATOR_SUFFIX = " (aggregator; original publisher not verified)";
const OSINT_TOPICS = Object.freeze({
  geopolitics: new Set(["security and diplomacy", "sanctions and trade restrictions", "geopolitical security", "maritime corridor security", "trade and border measures", "Sanctions & Trade Restrictions", "Security & Diplomatic Developments", "Trade Policy & Market Access", "Maritime Transit & Freight"]),
  macro: new Set(["monetary policy", "inflation and prices", "FX and external balances", "official economic statistics", "sovereign financing", "trade and economic conditions", "Monetary Policy & FX Liquidity", "Inflation & Consumer Prices", "Currency & External Balances"]),
  rare_earth: new Set(["critical-mineral inputs", "rare-earth supply", "mineral processing", "mineral trade controls", "Copper Supply & Processing", "Lithium & Battery-Grade Supply", "Nickel Supply & Processing", "Cobalt & Battery-Grade Supply", "Graphite & Anode Supply", "Rare-Earth Supply & Processing", "Critical-Mineral Supply & Processing", "Mining & Mineral Processing"]),
});
const OSINT_LABELS = Object.freeze({ geopolitics:"Geopolitics", macro:"Macro/FX", rare_earth:"Critical Minerals" });
const COUNTRY_NAMES = Object.freeze(Object.fromEntries(`AFG|AF|Afghanistan
AGO|AO|Angola
ALB|AL|Albania
AND|AD|Andorra
ARE|AE|United Arab Emirates
ARG|AR|Argentina
ARM|AM|Armenia
ATG|AG|Antigua and Barbuda
AUS|AU|Australia
AUT|AT|Austria
AZE|AZ|Azerbaijan
BDI|BI|Burundi
BEL|BE|Belgium
BEN|BJ|Benin
BFA|BF|Burkina Faso
BGD|BD|Bangladesh
BGR|BG|Bulgaria
BHR|BH|Bahrain
BHS|BS|Bahamas
BIH|BA|Bosnia and Herzegovina
BLR|BY|Belarus
BLZ|BZ|Belize
BOL|BO|Bolivia
BRA|BR|Brazil
BRB|BB|Barbados
BRN|BN|Brunei Darussalam
BTN|BT|Bhutan
BWA|BW|Botswana
CAF|CF|Central African Republic
CAN|CA|Canada
CHE|CH|Switzerland
CHL|CL|Chile
CHN|CN|China
CIV|CI|Côte d'Ivoire
CMR|CM|Cameroon
COD|CD|Democratic Republic of the Congo
COG|CG|Republic of the Congo
COL|CO|Colombia
COM|KM|Comoros
CPV|CV|Cabo Verde
CRI|CR|Costa Rica
CUB|CU|Cuba
CYP|CY|Cyprus
CZE|CZ|Czechia
DEU|DE|Germany
DJI|DJ|Djibouti
DMA|DM|Dominica
DNK|DK|Denmark
DOM|DO|Dominican Republic
DZA|DZ|Algeria
ECU|EC|Ecuador
EGY|EG|Egypt
ERI|ER|Eritrea
ESP|ES|Spain
EST|EE|Estonia
ETH|ET|Ethiopia
FIN|FI|Finland
FJI|FJ|Fiji
FRA|FR|France
FSM|FM|Federated States of Micronesia
GAB|GA|Gabon
GBR|GB|United Kingdom
GEO|GE|Georgia
GHA|GH|Ghana
GIN|GN|Guinea
GMB|GM|Gambia
GNB|GW|Guinea-Bissau
GNQ|GQ|Equatorial Guinea
GRC|GR|Greece
GRD|GD|Grenada
GTM|GT|Guatemala
GUY|GY|Guyana
HND|HN|Honduras
HRV|HR|Croatia
HTI|HT|Haiti
HUN|HU|Hungary
IDN|ID|Indonesia
IND|IN|India
IRL|IE|Ireland
IRN|IR|Iran
IRQ|IQ|Iraq
ISL|IS|Iceland
ISR|IL|Israel
ITA|IT|Italy
JAM|JM|Jamaica
JOR|JO|Jordan
JPN|JP|Japan
KAZ|KZ|Kazakhstan
KEN|KE|Kenya
KGZ|KG|Kyrgyzstan
KHM|KH|Cambodia
KIR|KI|Kiribati
KNA|KN|Saint Kitts and Nevis
KOR|KR|South Korea
KWT|KW|Kuwait
LAO|LA|Laos
LBN|LB|Lebanon
LBR|LR|Liberia
LBY|LY|Libya
LCA|LC|Saint Lucia
LIE|LI|Liechtenstein
LKA|LK|Sri Lanka
LSO|LS|Lesotho
LTU|LT|Lithuania
LUX|LU|Luxembourg
LVA|LV|Latvia
MAR|MA|Morocco
MCO|MC|Monaco
MDA|MD|Moldova
MDG|MG|Madagascar
MDV|MV|Maldives
MEX|MX|Mexico
MHL|MH|Marshall Islands
MKD|MK|North Macedonia
MLI|ML|Mali
MLT|MT|Malta
MMR|MM|Myanmar
MNE|ME|Montenegro
MNG|MN|Mongolia
MOZ|MZ|Mozambique
MRT|MR|Mauritania
MUS|MU|Mauritius
MWI|MW|Malawi
MYS|MY|Malaysia
NAM|NA|Namibia
NER|NE|Niger
NGA|NG|Nigeria
NIC|NI|Nicaragua
NLD|NL|Netherlands
NOR|NO|Norway
NPL|NP|Nepal
NRU|NR|Nauru
NZL|NZ|New Zealand
OMN|OM|Oman
PAK|PK|Pakistan
PAN|PA|Panama
PER|PE|Peru
PHL|PH|Philippines
PLW|PW|Palau
PNG|PG|Papua New Guinea
POL|PL|Poland
PRK|KP|North Korea
PRT|PT|Portugal
PRY|PY|Paraguay
PSE|PS|State of Palestine
QAT|QA|Qatar
ROU|RO|Romania
RUS|RU|Russia
RWA|RW|Rwanda
SAU|SA|Saudi Arabia
SDN|SD|Sudan
SEN|SN|Senegal
SGP|SG|Singapore
SLB|SB|Solomon Islands
SLE|SL|Sierra Leone
SLV|SV|El Salvador
SMR|SM|San Marino
SOM|SO|Somalia
SRB|RS|Serbia
SSD|SS|South Sudan
STP|ST|São Tomé and Príncipe
SUR|SR|Suriname
SVK|SK|Slovakia
SVN|SI|Slovenia
SWE|SE|Sweden
SWZ|SZ|Eswatini
SYC|SC|Seychelles
SYR|SY|Syria
TCD|TD|Chad
TGO|TG|Togo
THA|TH|Thailand
TJK|TJ|Tajikistan
TKM|TM|Turkmenistan
TLS|TL|Timor-Leste
TON|TO|Tonga
TTO|TT|Trinidad and Tobago
TUN|TN|Tunisia
TUR|TR|Türkiye
TUV|TV|Tuvalu
TZA|TZ|Tanzania
UGA|UG|Uganda
UKR|UA|Ukraine
URY|UY|Uruguay
USA|US|United States
UZB|UZ|Uzbekistan
VAT|VA|Holy See
VCT|VC|Saint Vincent and the Grenadines
VEN|VE|Venezuela
VNM|VN|Vietnam
VUT|VU|Vanuatu
WSM|WS|Samoa
YEM|YE|Yemen
ZAF|ZA|South Africa
ZMB|ZM|Zambia
ZWE|ZW|Zimbabwe`.split(String.fromCharCode(10)).map(row=>{const [iso,,name]=row.split("|");return [iso,name]})));
export function derivedCountryName(iso3){return typeof iso3==="string"?COUNTRY_NAMES[iso3]??null:null}
const TOPIC_MATCHES = Object.freeze({
 geopolitics:[[/sanction|embargo|asset freeze|export control|trade restriction/iu,"sanctions and trade restrictions"],[/red sea|bab el.?mandeb|hormuz|suez|shipping|tanker|maritime|strait|corridor|port/iu,"maritime corridor security"],[/border|tariff|customs|trade/iu,"trade and border measures"],[/ceasefire|conflict|military|missile|attack|security|diplomacy/iu,"geopolitical security"]],
 macro:[[/monetary|interest rate|central bank|bank rate/iu,"monetary policy"],[/inflation|consumer prices|cpi|price index/iu,"inflation and prices"],[/currency|exchange rate|foreign exchange|\bfx\b|liquidity/iu,"FX and external balances"],[/debt|sovereign|bond|yield|budget|fiscal/iu,"sovereign financing"],[/trade|tariff|customs|gdp|employment|statistics/iu,"trade and economic conditions"]],
 rare_earth:[[/export ban|export control|export restriction|licen[cs]e|quota/iu,"mineral trade controls"],[/refin|process|smelt|separation|magnet|recycl/iu,"mineral processing"],[/rare earth|lithium|cobalt|nickel|graphite|copper|gallium|germanium|mineral|mine/iu,"critical-mineral inputs"]]
});
const CATEGORY_CHANNEL=Object.freeze({
 geopolitics:"regional freight and war-risk insurance rates",
 macro:"the local currency versus USD and sovereign spreads",
 rare_earth:"the relevant mineral benchmark and regional concentrate premiums"
});
const COUNTRY_CURRENCY=Object.freeze({USA:"USD",CAN:"CAD",MEX:"MXN",CHL:"CLP",PER:"PEN",BRA:"BRL",ARG:"ARS",GBR:"GBP",JPN:"JPY",CHN:"CNY",IND:"INR",KOR:"KRW",AUS:"AUD",IDN:"IDR",ZAF:"ZAR",TUR:"TRY",SAU:"SAR",ARE:"AED",THA:"THB",MYS:"MYR",SGP:"SGD",PHL:"PHP",PAK:"PKR",BGD:"BDT",KAZ:"KZT",NOR:"NOK",SWE:"SEK",CHE:"CHF",POL:"PLN",DEU:"EUR",FRA:"EUR",ITA:"EUR",ESP:"EUR",NLD:"EUR",BEL:"EUR"});
const OSINT_PUBLIC_FIELDS = new Set(["id","category","title","what_changed","why_it_matters",
  "topic","geography","development_type","published_at","date_precision",
  "country_iso3","corridor","event_direction","event_action","observed_release_count","sources_credited","status","same_event_corrob_verified","severity"]);

function osintTopic(signal) {
  const category = signal?.category;
  const allowed = OSINT_TOPICS[category];
  return allowed?.has(signal?.topic) ? signal.topic : null;
}

function safeDimension(value,max=72) { return typeof value==="string"&&value.length>0&&value.length<=max&&/^[\p{L}\p{N}][\p{L}\p{N} .,'’()/&-]*$/u.test(value)&&!PROSE_URL_OR_DOMAIN_PATH.test(value)?value.trim():null; }
function directionFor(signal) {
 const explicit=safeDimension(signal.event_direction,32);
 if(explicit&&["tightening","easing","rising","falling","disrupted","restored","expanded","contracted","uncertain"].includes(explicit.toLowerCase()))return explicit.toLowerCase();
 const action=signal.event_action;
 if(action==="Reported Exposure to Supply Constraints"||action==="Policy Warning or Appeal"||action==="Proposal Under Review")return "tightening";
 if(action==="Reported Supply or Operations Disruption")return "disrupted";
 if(action==="Reported Reduction")return "falling";
 if(action==="Approval or Authorization")return "easing";
 if(action==="Reported Increase")return "rising";
 const source=`${signal.what_changed??""}`;
 const match=source.match(/direction is (tightening|easing|rising|falling|disrupted|restored|expanded|contracted|uncertain)/iu);
 if(match)return match[1].toLowerCase();
 return "uncertain";
}

/** Project a private legacy observation into a source-neutral public watch signal. */
export function projectSourceNeutralOsintSignal(signal) {
  if (!signal || signal.status !== "osint_feed_observed_unverified" ||
      signal.development_type !== "unverified OSINT feed observation" ||
      signal.date_precision !== "exact" ||
      !Array.isArray(signal.sources_credited) ||
      !(signal.sources_credited.length === 0 ||
        signal.sources_credited.length === 1 && isSafeMonitoredFeedCredit(signal.sources_credited[0])))
    return null;
  const topic = osintTopic(signal);
  const label = OSINT_LABELS[signal.category];
  const iso=typeof signal.country_iso3==="string"&&/^[A-Z]{3}$/u.test(signal.country_iso3)?signal.country_iso3:null;
  const country=safeDimension(signal.geography,70)??(iso?COUNTRY_NAMES[iso]??iso:null);
  const corridor=safeDimension(signal.corridor,72);
  const direction=directionFor(signal);
  const validActions=new Set(["Reported Exposure to Supply Constraints","Policy Warning or Appeal",
    "Approval or Authorization","Reported Reduction","Reported Increase","Proposal Under Review",
    "Reported Policy or Operating Action","Reported Review or Discussion",
    "Reported Supply or Operations Disruption","Reported Indicator Update"]);
  const action=validActions.has(signal.event_action)?signal.event_action:"Reported Update";
  if (!topic || !label || !country || !direction) return null;
  const focus=corridor?`${country} / ${corridor}`:country;
  const posture=direction==="tightening"?"REDUCE_LIMIT":direction==="uncertain"?"REQUIRE_APPROVAL":"CONTINUE";
  const currency=iso?COUNTRY_CURRENCY[iso]:null;
  const commodity=/copper/iu.test(topic)?"LME copper benchmark":/lithium|battery/iu.test(topic)?"battery-grade lithium benchmark":/rare earth/iu.test(topic)?"rare-earth oxide benchmark":"critical-mineral benchmark";
  const market=signal.category==="macro"&&currency&&currency!=="USD"?`${currency}/USD and ${country} sovereign spreads`:
    signal.category==="rare_earth"?`${commodity} and regional concentrate premiums`:
    corridor?`${corridor} freight rates and war-risk insurance premiums`:CATEGORY_CHANNEL[signal.category];
  const actor=signal.category==="geopolitics"?"public authorities and security actors":
    signal.category==="macro"?(/monetary|FX|sovereign/iu.test(topic)?"central-bank, treasury or currency-policy actors":"national statistical and fiscal authorities"):
    /processing/iu.test(topic)?"mineral processors and refining operators":"mineral regulators and supply-chain operators";
  const development=direction==="tightening"?"tightening or disruption pressure":direction==="easing"?"easing or restoration pressure":"a watchpoint with direction not yet established";
  const topicPhrase=topic.replace(/\b[a-z]/gu,c=>c.toUpperCase());
  return {
    id: signal.id,
    category: signal.category,
    title: `GeoMacro ${label} Brief · ${topicPhrase} — ${focus}${iso?` (${iso})`:""}`,
    what_changed: `WHAT CHANGED: GeoMacro's dated observation records a ${action.toLocaleLowerCase()} by ${actor}, affecting ${topic} in ${country}${corridor?` along the ${corridor} corridor`:""}; direction is ${direction} (${development}).`,
    why_it_matters: `WHY IT MATTERS — Risk: ${direction} ${topic} pressure in ${country}${corridor?` / ${corridor}`:""} → Downstream effect: ${signal.category==="geopolitics"?"routing, transit continuity and insurance costs may shift":signal.category==="macro"?"local funding, settlement and import costs may shift":"processor access, conversion capacity and industrial input availability may shift"} → Price impact channel: ${market}. Action Posture: ${posture}.`,
    topic,
    geography: country,
    country_iso3:iso,
    corridor,
    event_direction:direction,
    event_action:action,
    development_type: "unverified OSINT feed observation",
    published_at: signal.published_at,
    date_precision: "exact",
    observed_release_count: 1,
    sources_credited: [],
    status: "osint_feed_observed_unverified",
    same_event_corrob_verified: false,
    severity: null,
  };
}

export function isSourceNeutralOsintSignal(signal) {
  if (!signal || signal.status !== "osint_feed_observed_unverified" ||
      Object.keys(signal).length!==OSINT_PUBLIC_FIELDS.size ||
      Object.keys(signal).some(key=>!OSINT_PUBLIC_FIELDS.has(key)) ||
      !["geopolitics", "macro", "rare_earth"].includes(signal.category) ||
      signal.date_precision !== "exact" ||
      signal.development_type !== "unverified OSINT feed observation" ||
      signal.observed_release_count !== 1 || signal.same_event_corrob_verified !== false ||
      signal.severity !== null || !Array.isArray(signal.sources_credited) ||
      signal.sources_credited.length !== 0) return false;
  const projected = projectSourceNeutralOsintSignal({...signal, sources_credited:[]});
  return Boolean(projected && signal.title === projected.title &&
    signal.what_changed === projected.what_changed &&
    signal.why_it_matters === projected.why_it_matters && signal.topic === projected.topic &&
    signal.geography === projected.geography && signal.country_iso3 === projected.country_iso3 &&
    signal.corridor === projected.corridor && signal.event_direction === projected.event_direction &&
    signal.event_action === projected.event_action);
}

export function isSafeMonitoredFeedCredit(value) {
  if (typeof value !== "string" || value.length > 230 ||
      !value.startsWith("Monitored feed: ")) return false;
  let host = value.slice("Monitored feed: ".length);
  const aggregator = host.endsWith(AGGREGATOR_SUFFIX);
  if (aggregator) {
    host = host.slice(0, -AGGREGATOR_SUFFIX.length);
    if (host !== "news.google.com") return false;
  }
  if (!host || host.length > 120 || host !== host.toLowerCase() ||
      host.startsWith(".") || host.endsWith(".") || host.includes("..")) return false;
  const labels = host.split(".");
  if (labels.length < 2 || labels.some(label => label.length > 63 || !DOMAIN_LABEL.test(label)) ||
      !/^[a-z]{2,63}$/u.test(labels.at(-1))) return false;
  return true;
}

export function isSafeDerivedNewsReadbackSignal(signal) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) return false;
  for (const field of ["title", "what_changed", "why_it_matters", "topic", "development_type"]) {
    if (typeof signal[field] !== "string" || /[<>]/u.test(signal[field]) ||
        PROSE_URL_OR_DOMAIN_PATH.test(signal[field])) return false;
  }
  if (signal.geography !== null &&
      (typeof signal.geography !== "string" || /[<>]/u.test(signal.geography) ||
       PROSE_URL_OR_DOMAIN_PATH.test(signal.geography))) return false;
  if (!Array.isArray(signal.sources_credited) || signal.sources_credited.length > 2 ||
      signal.sources_credited.some(value =>
        typeof value !== "string" || value.length > 230 || /[<>]/u.test(value))) return false;

  if (signal.status === "osint_feed_observed_unverified") {
    const credits=signal.sources_credited.length===0||
      signal.sources_credited.length===1&&isSafeMonitoredFeedCredit(signal.sources_credited[0]);
    if(!credits)return false;
    const projected=projectSourceNeutralOsintSignal({...signal,sources_credited:[]});
    return Boolean(projected&&Object.keys(projected).length===Object.keys(signal).length&&
      Object.entries(projected).filter(([key])=>key!=="sources_credited").every(([key,value])=>
        signal[key]===value||JSON.stringify(signal[key])===JSON.stringify(value)));
  }

  // Only the explicit unverified-OSINT shape may contain a monitored-feed
  // provenance label. Official credits are source names/licence text, not URLs.
  return signal.sources_credited.every(value =>
    !value.startsWith("Monitored feed: ") && !PROSE_URL_OR_DOMAIN_PATH.test(value));
}

/**
 * Wait for the deployed D1 Worker to attest the exact derived-news policy
 * revision before any collector source read or journal write. This protects
 * against the repository push/deployment race. The revision is changed only
 * when the Worker validator/topic allowlist changes incompatibly.
 */
export async function requireDerivedNewsWorkerPolicy({
  fetchImpl = fetch, url, expectedRevision = DERIVED_NEWS_TOPIC_POLICY_REVISION,
} = {}) {
  let target;
  try { target = new URL(url); }
  catch { throw Error("DERIVED_NEWS_WORKER_POLICY_CONFIGURATION_INVALID"); }
  if (target.protocol !== "https:" ||
      target.hostname !== "geomacro-control-plane.daspallab202391.workers.dev" ||
      target.pathname !== "/health" || target.username || target.password ||
      target.port || target.search || target.hash ||
      !Number.isInteger(expectedRevision) || expectedRevision < 1)
    throw Error("DERIVED_NEWS_WORKER_POLICY_CONFIGURATION_INVALID");
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw Error("DERIVED_NEWS_WORKER_POLICY_HEALTH_UNAVAILABLE");
  }
  if (!response || response.status !== 200 || response.redirected ||
      Number(response.headers?.get("content-length") ?? 0) > 16_384)
    throw Error("DERIVED_NEWS_WORKER_POLICY_HEALTH_UNAVAILABLE");
  let text;
  try { text = await response.text(); }
  catch { throw Error("DERIVED_NEWS_WORKER_POLICY_HEALTH_UNAVAILABLE"); }
  if (text.length > 16_384) throw Error("DERIVED_NEWS_WORKER_POLICY_RESPONSE_OVERSIZE");
  let doc;
  try { doc = JSON.parse(text); }
  catch { throw Error("DERIVED_NEWS_WORKER_POLICY_RESPONSE_INVALID"); }
  if (doc?.ok !== true || doc.store !== "d1" ||
      !Number.isSafeInteger(doc.schema_version) || doc.schema_version < 3 ||
      doc.derived_news_topic_policy_revision !== expectedRevision ||
      !/^[a-f0-9]{40}$/u.test(String(doc.deployed_source_sha ?? "")))
    throw Error("DERIVED_NEWS_WORKER_TOPIC_POLICY_NOT_CURRENT");
  return Object.freeze({
    schema: "geomacro.derived-news-worker-policy-preflight.v1",
    worker_policy_revision: doc.derived_news_topic_policy_revision,
    d1_schema_version: doc.schema_version,
    deployed_source_sha_present: true,
    raw_health_body_logged: false,
    source_reads_started: false,
    payments: 0,
  });
}
