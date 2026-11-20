import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateKeyPairSync,sign} from "node:crypto";
import {deflateRawSync} from "node:zlib";
import {collectRiskStreamFeedExtensions,CRITICAL_MINERAL_SUPPLY_TERMS,HOT50,matchHot50Countries,SOURCE_COUNTRY,standardEntries} from "../ops/collect-risk-stream-feed-extensions.mjs";
import {redactedRightsRadar} from "../lib/rights-redacted-speed-radar.mjs";
import {emitRiskStreamCandidates} from "../ops/emit-risk-stream-candidates.mjs";
import {riskStreamOriginalClaims} from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
import {normalizeRiskStreamInternalCorroboration} from "../../workers/control-plane/src/risk-stream-internal-corroboration.mjs";
import {prepareRiskStreamCandidate} from "../lib/risk-stream-candidate-builder.mjs";
import {validateRiskStreamItemLicense} from "../../workers/control-plane/src/risk-stream-item-license-guard.mjs";

const manifest=JSON.parse(readFileSync("config/risk-stream-source-rights-reviewed.v1.json","utf8"));
const feedManifest=JSON.parse(readFileSync("config/unified-rss-feed-registry.v1.json","utf8"));
const source=manifest.entries.find(row=>row.source_id==="uk_fcdo_ogl_official_atom");
const now=Date.parse("2026-11-15T10:00:00.000Z");
const sourceRegistry=manifest.entries.filter(row=>row.status==="APPROVED")
 .map(row=>({...row,enabled:1,commercial_rights_approved:1}));
const original={category:"GEOPOLITICS",country_iso3:"GBR",feed_origin:"RSS",
 source_id:source.source_id,source_role:source.source_role,
 publisher_root_domain:source.publisher_root_domain,parent_media_entity:source.parent_media_entity,
 source_url:"https://www.gov.uk/government/news/official-measure",
 published_at:"2026-11-15T09:30:00.000Z",
 event_identity:{country_iso3:"GBR",event_type:"sanctions_policy",actor_id:"uk_foreign_office",
  target_id:"sanctions_subject",location_id:"london",occurred_at:"2026-11-15T09:00:00.000Z"},
 raw_payload:`First-party factual item. Open Government Licence v3 ${source.rights_evidence.licence_url}`,
 item_license_evidence:{license_id:"UK_OGL_V3",license_url:source.rights_evidence.licence_url,
  terms_url:source.rights_evidence.terms_url,item_url:"https://www.gov.uk/government/news/official-measure",
  item_license_marker:"Open Government Licence v3",publisher_owned_content_only:true,
  third_party_exceptions:false,non_commercial:false,restricted_material:false,
  factual_record_only:true,original_text_republished:false},
 reporting_position:"confirms",
 derived:{what:"A government measure changes external access.",
  why:"The change affects a defined policy exposure.",
  market:"Affected counterparties may face new constraints.",
  watch:"Track implementation and any formal revisions."}};
const candidateXml=`<feed xmlns:gm="https://geomacro.live/ns/risk-stream/1"><entry><gm:geomacro_risk_stream_candidate>${JSON.stringify(original).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</gm:geomacro_risk_stream_candidate></entry></feed>`;
const feed=(name=source.source_id)=>({name,url:"https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom",
 source_type:"official",risk_category:"conflict",risk_stream_item_licensed:true,
 risk_stream_standard_item_license_candidate:true});
const fetchFixture=async(_url,options)=>({ok:true,text:async()=>{
 assert.equal(options.redirect,"error");return candidateXml;
}});

test("all nine reviewed Lane A sources are wired to matching opt-in feed entries",()=>{
 const ids=["global_voices_original_cc_by_3","gdelt_v2_factual_events","un_reliefweb_api_ccby",
  "worldbank_commodity_prices_cc_by_4","ecb_fx_reference_rates","us_fed_h10_public_domain",
  "usgs_minerals_public_domain","geoscience_australia_ccby","eu_jrc_rmis_ccby"];
 for(const id of ids){
  const rights=manifest.entries.find(row=>row.source_id===id);
  const entry=feedManifest.sources.find(row=>row.name===id);
  assert.ok(rights,`${id} must exist in the reviewed rights manifest`);
  assert.ok(entry,`${id} must exist in the feed registry`);
  assert.equal(entry.risk_stream_item_licensed,true);
  assert.equal(entry.risk_stream_standard_item_license_candidate,true);
  const url=new URL(entry.url);
  assert.equal(url.protocol,"https:");
  assert.ok(url.hostname===rights.publisher_root_domain||
   url.hostname.endsWith(`.${rights.publisher_root_domain}`),`${id} endpoint must match its reviewed root`);
 }
 assert.equal(feedManifest.sources.find(row=>row.name==="gdelt_v2_factual_events").url,
  "https://data.gdeltproject.org/gdeltv2/lastupdate.txt");
 assert.match(feedManifest.sources.find(row=>row.name==="ecb_fx_reference_rates").url,
  /^https:\/\/www\.ecb\.europa\.eu\/stats\/eurofxref\/eurofxref-daily\.xml$/u);
 assert.match(feedManifest.sources.find(row=>row.name==="us_fed_h10_public_domain").url,
  /^https:\/\/www\.federalreserve\.gov\/feeds\/data\/H10_H10\.XML$/u);
 assert.match(feedManifest.sources.find(row=>row.name==="geoscience_australia_ccby").url,
  /^https:\/\/services\.ga\.gov\.au\/gis\/rest\/services\/.+f=geojson$/u);
 assert.equal(feedManifest.feed_count,feedManifest.sources.length);
});

test("GDELT GeoJSON features map country properties to Hot 50 codes",()=>{
 const body=JSON.stringify({type:"FeatureCollection",features:[
  {type:"Feature",id:"gdelt-feature-1",properties:{id:"gdelt-feature-1",country_name:"China",
   date:"2026-11-15T09:30:00Z",title:"Conflict escalation in China",
   url:"https://api.gdeltproject.org/api/v2/geo/geo?feature=1"},geometry:{type:"Point",coordinates:[116.4,39.9]}},
  {type:"Feature",id:"gdelt-feature-2",properties:{id:"gdelt-feature-2",countries:["CHN","IND","RUS","USA"],
   date:"2026-11-15T09:31:00Z",title:"Sanctions update"},geometry:{type:"Point",coordinates:[0,0]}},
  {type:"Feature",id:"gdelt-feature-3",properties:{id:"gdelt-feature-3",country:"CN",
   date:"2026-11-15T09:32:00Z",title:"Conflict escalation"},geometry:{type:"Point",coordinates:[0,0]}}
 ]});
 const entries=standardEntries(body);
 assert.equal(entries.length,3);
 assert.equal(entries[0].country_iso3,"CHN");
 assert.deepEqual(matchHot50Countries(entries[0],entries[0].title),["CHN"]);
 assert.deepEqual(matchHot50Countries(entries[1],entries[1].title),["CHN","IND","RUS"]);
 assert.equal(entries[2].country_iso3,"CHN");
});

test("RSS 1.0/RDF items read dc:date for ECB and Federal Reserve feeds",()=>{
 const rdf=(publisher,title,url,date)=>`<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${publisher}</title></channel><item rdf:about="${url}"><title>${title}</title><link>${url}</link><description>Daily exchange rate information.</description><dc:date>${date}</dc:date></item></rdf:RDF>`;
 const ecb=standardEntries(rdf("ECB","1.0992 USD = 1 EUR 2026-11-19 ECB Reference rate",
  "http://www.ecb.europa.eu/stats/exchange/eurofxref/html/eurofxref-graph-usd.en.html?date=2026-11-19",
  "2026-11-19T14:15:00+01:00"));
 const fed=standardEntries(rdf("Federal Reserve","US: H10 foreign exchange rates for India",
  "http://www.federalreserve.gov/releases/H10#1","2026-11-16T16:15:00-05:00"));
 assert.equal(ecb[0].updated,"2026-11-19T14:15:00+01:00");
 assert.equal(ecb[0].id,"http://www.ecb.europa.eu/stats/exchange/eurofxref/html/eurofxref-graph-usd.en.html?date=2026-11-19");
 assert.match(fed[0].updated,/2026-11-16/u);
 assert.equal(fed[0].link,"http://www.federalreserve.gov/releases/H10#1");
});

test("ECB daily XML emits multi-currency Hot 50 candidates that validate",async()=>{
 const rights=manifest.entries.find(row=>row.source_id==="ecb_fx_reference_rates");
 const endpoint="https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
 const currencies={USD:"USA",GBP:"GBR",JPY:"JPN",CNY:"CHN",INR:"IND",KRW:"KOR",AUD:"AUS",
  CAD:"CAN",CHF:"CHE",BRL:"BRA",MXN:"MEX",PLN:"POL",SEK:"SWE",NOK:"NOR",TRY:"TUR",
  ZAR:"ZAF",SGD:"SGP",MYR:"MYS",THB:"THA",IDR:"IDN",PHP:"PHL"};
 const cubes=Object.keys(currencies).map((currency,index)=>
  `<Cube currency="${currency}" rate="${(1.1+index/1000).toFixed(4)}"/>`).join("");
 const xml=`<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><gesmes:Cube><Cube time="2026-11-20">${cubes}</Cube></gesmes:Cube></gesmes:Envelope>`;
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now:Date.parse("2026-11-20T12:00:00Z"),
  fetchImpl:async(url)=>({ok:true,text:async()=>{assert.equal(url,endpoint);return xml;},headers:{get:()=>"application/xml"}}),
  rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[{
   ...feed(rights.source_id),url:endpoint,risk_category:"macro_economics"}]},sourceRegistry});
 assert.equal(result.originals.length,21);
 assert.deepEqual(Object.fromEntries(result.originals.map(row=>[row.raw_payload.match(/"counter_currency":"([A-Z]{3})"/u)[1],row.country_iso3])),currencies);
 for(const candidate of result.originals){
  assert.equal(candidate.category,"MACRO_FX");
  assert.doesNotThrow(()=>prepareRiskStreamCandidate(candidate,sourceRegistry,
   Date.parse("2026-11-20T12:00:00Z"),{rightsManifest:manifest}));
  assert.doesNotThrow(()=>validateRiskStreamItemLicense(candidate.item_license_evidence,rights,
   {sourceUrl:candidate.source_url,sourceDomain:rights.publisher_root_domain,rawPayload:candidate.raw_payload}));
 }
});

function crc32(buffer){
 let crc=0xffffffff;
 for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
 return (crc^0xffffffff)>>>0;
}
function zipOneCsv(name,text){
 const filename=Buffer.from(name),plain=Buffer.from(text),compressed=deflateRawSync(plain),crc=crc32(plain);
 const local=Buffer.alloc(30+filename.length);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
 local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);
 local.writeUInt32LE(plain.length,22);local.writeUInt16LE(filename.length,26);filename.copy(local,30);
 const central=Buffer.alloc(46+filename.length);central.writeUInt32LE(0x02014b50,0);
 central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);
 central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);
 central.writeUInt32LE(plain.length,24);central.writeUInt16LE(filename.length,28);filename.copy(central,46);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);
 end.writeUInt16LE(1,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(local.length+compressed.length,16);
 return Buffer.concat([local,compressed,central,end]);
}
function gdeltCsvRow({id,date,country,event="145",quad="4"}){
 const columns=Array(61).fill("");columns[0]=String(id);columns[1]=date;columns[5]="GOV";
 columns[7]="";columns[15]="";columns[17]="";columns[26]=event;columns[29]=quad;
 columns[30]="-2.5";columns[53]=country;columns[60]="https://example.invalid/article?prose=must-not-enter-payload";
 return columns.map(value=>/[",\r\n]/u.test(value)?`"${value.replaceAll('"','""')}"`:value).join(",");
}

test("GDELT lastupdate ZIP emits up to 500 distinct factual candidates across Hot 50 countries",async()=>{
 const rights=manifest.entries.find(row=>row.source_id==="gdelt_v2_factual_events");
 const now=Date.parse("2026-11-20T12:00:00Z"),feedUrl="https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
 const archiveUrl="https://data.gdeltproject.org/gdeltv2/20261120103000.export.CSV.zip";
 const countryCodes=["US","CN","IN","RU","GB","DE","FR","JP","KR","BE","CA","AU","BR","MX",
  "IT","ES","NL","SZ","NO","SE","PL","UA","TR","SA","AE","IR","IL","EG","QA","OM","IQ",
  "SF","NG","CG","ZM","CL","PE","AR","BO","ID","VN","TH","MY","SG","PH","PK","BD","KZ","MN","MM"];
 const csv=Array.from({length:510},(_,index)=>gdeltCsvRow({id:1000000000+index,date:"20261120",
  country:countryCodes[index%countryCodes.length]})).join("\n");
 const archive=zipOneCsv("20261120103000.export.CSV",csv);
 const fetchImpl=async(url)=>{
  if(url===feedUrl)return {ok:true,text:async()=>"20261120103000.export.CSV.zip 12345\n",headers:{get:()=>"text/plain"}};
  assert.equal(url,archiveUrl);
  return {ok:true,arrayBuffer:async()=>archive.buffer.slice(archive.byteOffset,archive.byteOffset+archive.byteLength),
   headers:{get:(name)=>name==="content-length"?String(archive.length):"application/zip"}};
 };
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl,rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[{
   ...feed(rights.source_id),url:feedUrl,risk_category:"conflict"}]},sourceRegistry});
 assert.equal(result.originals.length,500);
 assert.equal(new Set(result.originals.map(row=>row.country_iso3)).size,50);
 assert.equal(new Set(result.originals.map(row=>JSON.parse(row.raw_payload).global_event_id)).size,500);
 for(const candidate of result.originals){
  assert.equal(candidate.category,"GEOPOLITICS");
  const payload=JSON.parse(candidate.raw_payload);
  assert.equal(payload.schema,"geomacro.gdelt.factual-event.v1");
  assert.equal(payload.country_iso3,candidate.country_iso3);
  assert.equal(payload.event_code,"145");
  assert.equal(payload.quad_class,undefined);
  assert.doesNotMatch(candidate.raw_payload,/must-not-enter-payload|example\.invalid/u);
  assert.doesNotThrow(()=>prepareRiskStreamCandidate(candidate,sourceRegistry,now,{rightsManifest:manifest}));
  assert.doesNotThrow(()=>validateRiskStreamItemLicense(candidate.item_license_evidence,rights,
   {sourceUrl:candidate.source_url,sourceDomain:rights.publisher_root_domain,rawPayload:candidate.raw_payload}));
 }
});

test("approved non-UK macro and minerals sources have country fallbacks",()=>{
 assert.deepEqual({
  ecb_fx_reference_rates:matchHot50Countries({},"","ecb_fx_reference_rates")[0],
  us_fed_h10_public_domain:matchHot50Countries({},"","us_fed_h10_public_domain")[0],
  usgs_minerals_public_domain:matchHot50Countries({},"","usgs_minerals_public_domain")[0],
  geoscience_australia_ccby:matchHot50Countries({},"","geoscience_australia_ccby")[0],
  eu_jrc_rmis_ccby:matchHot50Countries({},"","eu_jrc_rmis_ccby")[0]
 },{ecb_fx_reference_rates:"DEU",us_fed_h10_public_domain:"USA",
  usgs_minerals_public_domain:"USA",geoscience_australia_ccby:"AUS",eu_jrc_rmis_ccby:"BEL"});
 assert.equal(SOURCE_COUNTRY.ecb_fx_reference_rates,"DEU");
 assert.equal(SOURCE_COUNTRY.us_fed_h10_public_domain,"USA");
});

test("country mention terms cover all 50 Hot 50 countries",()=>{
 const names={USA:"United States",CHN:"China",IND:"India",RUS:"Russia",GBR:"United Kingdom",
  DEU:"Germany",FRA:"France",JPN:"Japan",KOR:"South Korea",BEL:"Belgium",CAN:"Canada",
  AUS:"Australia",BRA:"Brazil",MEX:"Mexico",ITA:"Italy",ESP:"Spain",NLD:"Netherlands",
  CHE:"Switzerland",NOR:"Norway",SWE:"Sweden",POL:"Poland",UKR:"Ukraine",TUR:"Türkiye",
  SAU:"Saudi Arabia",ARE:"United Arab Emirates",IRN:"Iran",ISR:"Israel",EGY:"Egypt",QAT:"Qatar",
  OMN:"Oman",IRQ:"Iraq",ZAF:"South Africa",NGA:"Nigeria",COD:"Democratic Republic of the Congo",
  ZMB:"Zambia",CHL:"Chile",PER:"Peru",ARG:"Argentina",BOL:"Bolivia",IDN:"Indonesia",
  VNM:"Vietnam",THA:"Thailand",MYS:"Malaysia",SGP:"Singapore",PHL:"Philippines",PAK:"Pakistan",
  BGD:"Bangladesh",KAZ:"Kazakhstan",MNG:"Mongolia",MMR:"Myanmar"};
 assert.equal(HOT50.size,50);
 assert.deepEqual(Object.keys(names).sort(),[...HOT50].sort());
 for(const [iso3,name] of Object.entries(names))
  assert.deepEqual(matchHot50Countries({},name),[iso3],`${name} should map to ${iso3}`);
});

test("critical-minerals matching includes standard material and supply-chain vocabulary",()=>{
 const terms=["nickel","manganese","titanium","tungsten","gallium","germanium","uranium",
  "silicon","zinc","aluminum","aluminium","bauxite","platinum","palladium","antimony",
  "vanadium","mining","mine","smelter","refining","refinery","ore","metal","battery",
  "supply chain","export control","critical raw"];
 for(const term of terms)assert.equal(CRITICAL_MINERAL_SUPPLY_TERMS.test(term),true,term);
});

for(const collector of ["direct","private"]){
 test(`${collector} scheduled collector writes an item-licensed candidate accepted by the handoff`,async()=>{
  const result=await collectRiskStreamFeedExtensions({collector,now,fetchImpl:fetchFixture,
   rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
  assert.equal(result.status,"ITEM_LICENSE_VERIFIED_CANDIDATES_READY");
  assert.equal(result.originals.length,1);
  const admission=await emitRiskStreamCandidates({originals:result.originals,sourceRegistry,
   rightsManifest:manifest,now,dryRun:true});
  assert.equal(admission.status,"DRY_RUN");
  assert.equal(admission.candidate_count,1);
  assert.equal(admission.item_license_skipped,0);
 });
}


test("a redacted Lane B cell prioritizes only approved matching Lane A feeds on the same scheduled poll",async()=>{
 const approved=manifest.entries.find(row=>row.source_id==="uk_fcdo_ogl_official_atom");
 const macro=manifest.entries.find(row=>row.source_id==="uk_hmt_ogl_official_atom");
 const feeds=[
  {...feed(macro.source_id),url:"https://www.gov.uk/government/organisations/hm-treasury.atom",
   risk_category:"macro_economics"},
  {...feed(approved.source_id),risk_category:"conflict"},
  {...feed("unapproved-watch"),name:"unapproved-watch",risk_category:"conflict",
   risk_stream_item_licensed:true,risk_stream_standard_item_license_candidate:true},
 ];
 const calls=[];
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,
  fetchImpl:async(url)=>{calls.push(url);return {ok:true,text:async()=>"<feed></feed>",
   headers:{get:()=>null}};},
  rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:feeds},
  sourceRegistry,
  radarSignals:[redactedRightsRadar({category:"geopolitics",country_iso3:"USA",
   same_event_claim_sha256:"c".repeat(64),original_published_at:"2026-11-15T09:30:00Z",
   severity_delta:0,corroboration_count:1})]});
 assert.deepEqual(calls.slice(0,2),[
  "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom",
  "https://www.gov.uk/government/organisations/hm-treasury.atom"
 ]);
 assert.equal(result.lane_b_redacted_signals,1);
 assert.equal(result.lane_a_priority_sources,1);
 assert.deepEqual(result.lane_a_priority_source_ids,["uk_fcdo_ogl_official_atom"]);
 assert.equal(calls.includes("https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom"),true);
 assert.doesNotMatch(JSON.stringify(result),/secret|publisher.*title/iu);
});


test("collector normalizes the Antarctica code to the sovereign Australia route before attestation",async()=>{
 const antarctica={...original,country_iso3:"ATA",
  event_identity:{...original.event_identity,country_iso3:"ATA"}};
 const xml='<feed xmlns:gm="https://geomacro.live/ns/risk-stream/1"><entry><gm:geomacro_risk_stream_candidate>'+JSON.stringify(antarctica).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")+'</gm:geomacro_risk_stream_candidate></entry></feed>';
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,
  fetchImpl:async()=>({ok:true,text:async()=>xml}),rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(result.originals.length,1);
 assert.equal(result.originals[0].country_iso3,"AUS");
 assert.equal(result.originals[0].event_identity.country_iso3,"AUS");
});

test("metadata-only or non-opted-in feeds cannot produce a Risk Stream sidecar",async()=>{
 const noExtension=await collectRiskStreamFeedExtensions({collector:"direct",now,
  fetchImpl:async()=>({ok:true,text:async()=>"<feed><entry><title>ordinary headline</title></entry></feed>"}),
  rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(noExtension.status,"NO_ITEM_LICENSE_VERIFIED_CANDIDATES");
 assert.equal(noExtension.originals.length,0);
 const notOptedIn=await collectRiskStreamFeedExtensions({collector:"private",now,
  fetchImpl:async()=>{throw Error("must not fetch unapproved feed")},rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[{...feed(),risk_stream_item_licensed:false}]},sourceRegistry});
 assert.equal(notOptedIn.originals.length,0);
});

test("ordinary Atom entries derive guarded sidecars from entry fields and the linked page license",async()=>{
 const ordinary=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:gov.uk,2026:news/123</id>
  <title>UK announces new sanctions policy for Russia</title><updated>2026-11-15T09:30:00Z</updated>
  <link rel="alternate" href="https://www.gov.uk/government/news/sanctions-policy-russia"/>
  <summary>New sanctions policy announcement relating to Russia.</summary></entry></feed>`;
 const page=`<html><footer><a href="${source.rights_evidence.licence_url}" rel="license">Open Government Licence v3.0</a>
  <a href="${source.rights_evidence.terms_url}">Terms</a></footer></html>`;
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url,options)=>{
  assert.equal(options.redirect,"error");
  return {ok:true,text:async()=>url.endsWith(".atom")?ordinary:page,
   headers:{get:()=>null}};
 },rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(result.originals.length,1);
 assert.equal(result.counts.standard_entries_seen,1);
 assert.equal(result.counts.standard_candidates_built,1);
 assert.equal(result.originals[0].country_iso3,"RUS");
 assert.equal(result.originals[0].category,"GEOPOLITICS");
 assert.equal(result.originals[0].source_id,source.source_id);
 assert.match(result.originals[0].raw_payload,/Open Government Licence v3\.0/u);
 const admitted=await emitRiskStreamCandidates({originals:result.originals,sourceRegistry,
  rightsManifest:manifest,now,dryRun:true});
 assert.equal(admitted.item_license_skipped,0);
});

test("standard Atom items with item-level restrictions or no license evidence are rejected",async()=>{
 const ordinary=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:x,1</id>
  <title>Sanctions policy for Russia</title><updated>2026-11-15T09:30:00Z</updated>
  <link href="https://www.gov.uk/government/news/sanctions-policy-russia"/></entry></feed>`;
 for(const page of ["<html>Non-commercial item</html>","<html>No license marker</html>",
  `<html><a href="${source.rights_evidence.licence_url}" rel="license">Open Government Licence v3.0</a> all rights reserved</html>`]){
  const result=await collectRiskStreamFeedExtensions({collector:"private",now,fetchImpl:async(url)=>({ok:true,
   text:async()=>url.endsWith(".atom")?ordinary:page,headers:{get:()=>null}}),rightsManifest:manifest,
   feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
  assert.equal(result.originals.length,0);
 }
});

test("standard JSON Feed items use published link and timestamp fields without an upstream extension",async()=>{
 const jsonFeed=JSON.stringify({version:"https://jsonfeed.org/version/1.1",items:[{
  id:"policy-record-77",url:"https://www.gov.uk/government/news/sanctions-russia",
  title:"UK sanctions policy for Russia",date_published:"2026-11-15T09:30:00Z",
  summary:"Sanctions policy update relating to Russia."}]});
 const page=`<a rel="license" href="${source.rights_evidence.licence_url}">Open Government Licence v3.0</a>`;
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url)=>({ok:true,
  text:async()=>url.endsWith(".atom")?jsonFeed:page,headers:{get:()=>null}}),rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(result.originals.length,1);
 assert.equal(result.originals[0].country_iso3,"RUS");
 assert.equal(result.originals[0].source_id,source.source_id);
 assert.equal(result.originals[0].feed_origin,"OFFICIAL_API");
 const restricted=JSON.stringify({items:[{id:"policy-record-78",url:"https://www.gov.uk/government/news/sanctions-russia",
  title:"UK sanctions policy for Russia",date_published:"2026-11-15T09:30:00Z",license:"CC BY-NC"}]});
 const skipped=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url)=>({ok:true,
  text:async()=>url.endsWith(".atom")?restricted:page,headers:{get:()=>null}}),rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(skipped.originals.length,0);
});

test("standard feed scan admits up to 25 separately item-licensed entries per feed",async()=>{
 const entries=Array.from({length:26},(_,index)=>`<entry><id>tag:gov.uk,2026:news/${index}</id>
  <title>UK sanctions policy for Russia</title><updated>2026-11-15T09:30:00Z</updated>
  <link rel="alternate" href="https://www.gov.uk/government/news/sanctions-policy-russia-${index}"/>
  <summary>Sanctions policy update relating to Russia.</summary></entry>`).join("");
 const xml=`<feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`;
 const page=`<a rel="license" href="${source.rights_evidence.licence_url}">Open Government Licence v3.0</a>`;
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url)=>({ok:true,
  text:async()=>url.endsWith(".atom")?xml:page,headers:{get:()=>null}}),rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(result.counts.standard_entries_seen,25);
 assert.equal(result.counts.standard_candidates_built,25);
 assert.equal(result.originals.length,25);
});

test("structured JSON feeds scan up to 500 entries but fetch at most 25 item pages",async()=>{
 const rights=manifest.entries.find(row=>row.source_id==="un_reliefweb_api_ccby");
 const endpoint="https://api.reliefweb.int/v2/reports?appname=geomacro.live&limit=500";
 const items=Array.from({length:40},(_,index)=>({id:`report-${index}`,url:
  `https://reliefweb.int/report/2026/report-${index}`,date_published:"2026-11-15T09:30:00Z",
  title:"Sanctions policy update for India",license:rights.rights_evidence.licence_url}));
 const htmlFetches=[];
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url)=>{
  if(url===endpoint)return {ok:true,text:async()=>JSON.stringify({items}),
   headers:{get:()=>"application/json"}};
  htmlFetches.push(url);
  return {ok:true,text:async()=>`<a rel="license" href="${rights.rights_evidence.licence_url}">CC BY 4.0</a>`,
   headers:{get:()=>"text/html"}};
 },rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[{
  ...feed(rights.source_id),url:endpoint,risk_category:"conflict"}]},sourceRegistry});
 assert.equal(result.counts.standard_entries_seen,40);
 assert.equal(htmlFetches.length,25);
 assert.equal(result.originals.length,25);
 assert.ok(result.originals.every(candidate=>candidate.source_id===rights.source_id));
});

test("non-UK CC BY and public-domain items pass candidate preparation and item-license validation",()=>{
 const cases=[
  {sourceId:"geoscience_australia_ccby",licenseId:"CC_BY_4.0",country:"AUS",
   marker:"Creative Commons Attribution 4.0 International",publisherOwned:false,
   sourceUrl:"https://www.ga.gov.au/data/minerals-record"},
  {sourceId:"usgs_minerals_public_domain",licenseId:"US_GOV_PUBLIC_DOMAIN",country:"USA",
   marker:"USGS-authored factual mineral data, public domain",publisherOwned:true,
   sourceUrl:"https://www.usgs.gov/data/mineral-record"},
 ];
 for(const row of cases){
  const rights=manifest.entries.find(entry=>entry.source_id===row.sourceId);
  const raw_payload=JSON.stringify({record_id:"item-1",license_marker:row.marker,
   license_url:rights.rights_evidence.licence_url,terms_url:rights.rights_evidence.terms_url,
   factual_value:42});
  const original={category:rights.categories[0],country_iso3:row.country,feed_origin:"OFFICIAL_API",
   source_id:rights.source_id,source_role:rights.source_role,
   publisher_root_domain:rights.publisher_root_domain,parent_media_entity:rights.parent_media_entity,
   source_url:row.sourceUrl,published_at:"2026-11-15T09:30:00.000Z",
   event_identity:{country_iso3:row.country,event_type:"critical_mineral_supply",
    actor_id:rights.parent_media_entity,target_id:"mineral_supply",location_id:"national_scope",
    occurred_at:"2026-11-15T09:00:00.000Z"},raw_payload,
   item_license_evidence:{license_id:row.licenseId,license_url:rights.rights_evidence.licence_url,
    terms_url:rights.rights_evidence.terms_url,item_url:row.sourceUrl,item_license_marker:row.marker,
    publisher_owned_content_only:row.publisherOwned,third_party_exceptions:false,
    non_commercial:false,restricted_material:false,factual_record_only:true,original_text_republished:false},
   reporting_position:"confirms",derived:{what:"Material availability receives a verified update.",
    why:"The observed record changes a supply-side assessment.",
    market:"Availability and processing conditions may affect regional supply.",
    watch:"Track follow-up data and any changes to the recorded supply position."}};
  assert.doesNotThrow(()=>validateRiskStreamItemLicense(original.item_license_evidence,rights,
   {sourceUrl:row.sourceUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw_payload}));
  assert.doesNotThrow(()=>prepareRiskStreamCandidate(original,sourceRegistry,now,{rightsManifest:manifest}));
 }
});

test("JSON API data[] records emit up to three matched Hot 50 country candidates",async()=>{
 const rights=manifest.entries.find(row=>row.source_id==="global_voices_original_cc_by_3");
 const entry={id:"gv-json-1",url:"https://globalvoices.org/2026/11/15/sample/",
  date_published:"2026-11-15T09:30:00.000Z",title:"Conflict escalation affects China, India and Russia",
  summary:"A dated conflict escalation report concerning three Hot 50 countries.",
  country:[{iso3:"CHN"},{iso3:"IND"},{iso3:"RUS"},{iso3:"USA"}]};
 const body=JSON.stringify({data:[{id:entry.id,fields:entry}]});
 const page=`<a rel="license" href="${rights.rights_evidence.licence_url}">Creative Commons Attribution 3.0</a>`;
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url)=>({ok:true,
  text:async()=>url.endsWith("/feed/")?body:page,headers:{get:()=>url.endsWith("/feed/")?"application/json":"text/html"}}),
  rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[{
   ...feed(rights.source_id),url:"https://globalvoices.org/feed/",risk_category:"conflict"}]},sourceRegistry});
 assert.deepEqual(result.originals.map(row=>row.country_iso3),["CHN","IND","RUS"]);
 assert.ok(result.originals.every(row=>row.source_id===rights.source_id&&row.category==="GEOPOLITICS"));
 assert.equal(result.counts.standard_candidates_built,3);
});

test("GeoJSON feature properties are normalized without losing country and license evidence",async()=>{
 const rights=manifest.entries.find(row=>row.source_id==="geoscience_australia_ccby");
 const endpoint="https://ecat.ga.gov.au/geonetwork/srv/api/records?from=1&to=25&q=critical%20minerals";
 const body=JSON.stringify({features:[{id:"ga-record-9",properties:{
  id:"ga-record-9",url:"https://www.ga.gov.au/data/ga-record-9",
  date_modified:"2026-11-15T09:30:00Z",title:"Critical mineral supply data for Australia",
  description:"A fresh critical mineral supply record.",country_iso3:"AUS",
  license:"CC BY 4.0"}}]});
 const page=`<a rel="license" href="${rights.rights_evidence.licence_url}">CC BY 4.0</a>`;
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url)=>({ok:true,
  text:async()=>url===endpoint?body:page,headers:{get:()=>url===endpoint?"application/geo+json":"text/html"}}),
  rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[{
   ...feed(rights.source_id),url:endpoint,risk_category:"commodities"}]},sourceRegistry});
 assert.equal(result.originals.length,1);
 assert.equal(result.originals[0].country_iso3,"AUS");
 assert.equal(result.originals[0].category,"CRITICAL_MINERALS");
 assert.equal(result.originals[0].source_id,rights.source_id);
});

test("JSON API stale and future entries are filtered before item pages are fetched",async()=>{
 const rights=manifest.entries.find(row=>row.source_id==="global_voices_original_cc_by_3");
 const pageUrls=[];
 const body=JSON.stringify({data:[
  {id:"stale",fields:{id:"stale",url:"https://globalvoices.org/stale",date_published:"2026-11-10T09:00:00Z",
   title:"Conflict escalation in China",country:[{iso3:"CHN"}]}},
  {id:"future",fields:{id:"future",url:"https://globalvoices.org/future",date_published:"2026-11-16T11:00:00Z",
   title:"Conflict escalation in India",country:[{iso3:"IND"}]}}
 ]});
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url)=>{
  pageUrls.push(url);return {ok:true,text:async()=>body,headers:{get:()=>"application/json"}};
 },rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[{
  ...feed(rights.source_id),url:"https://globalvoices.org/feed/",risk_category:"conflict"}]},sourceRegistry});
 assert.equal(result.originals.length,0);
 assert.equal(result.counts.stale_entries_skipped,1);
 assert.equal(result.counts.future_entries_skipped,1);
 assert.deepEqual(pageUrls,["https://globalvoices.org/feed/"]);
});

test("private collector adds only redacted corroboration features at dual attestation",async()=>{
 const result=await collectRiskStreamFeedExtensions({collector:"private",now,fetchImpl:fetchFixture,
  rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 const context=normalizeRiskStreamInternalCorroboration({source_kind:"TELEGRAM_WATCH",country_iso3:"GBR",
  category:"GEOPOLITICS",text:"Sanctions watch secret channel quote https://t.me/private/1",
  severity_weight:30,corroboration_weight:.15,corridors:["GBR>USA"]});
 const posted=[];
 const output=await emitRiskStreamCandidates({originals:result.originals,sourceRegistry,
  rightsManifest:manifest,now,dryRun:false,controlPlaneUrl:"https://control.example",
  controlPlaneToken:"c".repeat(48),factsPublicB64:facts.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  rightsPublicB64:rights.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  sleepImpl:async()=>{},fetchImpl:async(url,options)=>{
   if(new URL(url).pathname.endsWith("/runtime"))return {ok:true,status:200,json:async()=>({
    schema:"geomacro.risk-stream-runtime-status.v1",ready:true,deployed_source_sha:null,
    research_flags:{active:true,ingestion_enabled:true,production_mode:true,hot50_research_enabled:true},
    queue_binding_present:true,d1_binding_present:true,auth_configured:true})};
   if(new URL(url).pathname.endsWith("/attest")){
    const draft={...JSON.parse(options.body).draft,risk_context:context};
    const claims=riskStreamOriginalClaims(draft);
    return {ok:true,status:200,json:async()=>({risk_context:context,proof:{
     facts_signature_b64:sign(null,Buffer.from("geomacro.machine-original-facts.v1\n"+claims),facts.privateKey).toString("base64"),
     rights_signature_b64:sign(null,Buffer.from("geomacro.machine-commercial-rights.v1\n"+claims),rights.privateKey).toString("base64")}})};
   }
   if(new URL(url).pathname.endsWith("/readback")){
    const observation_ids=JSON.parse(options.body).observation_ids;
    return {ok:true,status:200,json:async()=>({ok:true,
     schema:"geomacro.risk-stream-readback-receipt.v1",requested:observation_ids.length,
     readback_count:observation_ids.length,readback_verified:true,observation_ids})};
   }
   posted.push(JSON.parse(options.body));
   return {ok:true,status:202,json:async()=>({ok:true,accepted:1,commercial_delivery:false})};
  }});
 assert.equal(output.status,"POSTED");
 assert.equal(posted[0].items[0].risk_context.raw_source_redacted,true);
 assert.doesNotMatch(JSON.stringify(posted),/secret channel|t\.me\/private|https:\/\/t\.me/iu);
});

test("collector workflows run the sidecar builder immediately before the shared dual-attester emitter",()=>{
 for(const path of [".github/workflows/hot50-direct-original-news-20m.yml",
  ".github/workflows/private-global-osint-15m.yml"]){
  const workflow=readFileSync(path,"utf8");
  assert.match(workflow,/collect-risk-stream-feed-extensions\.mjs --collector/u);
  assert.match(workflow,/emit-risk-stream-collector-sidecar\.mjs/u);
  assert.match(workflow,/RISK_STREAM_MACHINE_FACTS_SPKI_B64/u);
  assert.match(workflow,/RISK_STREAM_MACHINE_RIGHTS_SPKI_B64/u);
  assert.match(workflow,/GEOMACRO_RISK_STREAM_RADAR_FILE/u);
  assert.ok(workflow.includes('--radar-file "$GEOMACRO_RISK_STREAM_RADAR_FILE"'));
 }
});
