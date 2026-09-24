#!/usr/bin/env node
import { parseUkSanctionsXml } from "../global-intelligence/adapters/uk-sanctions-list.mjs";
import { normalizeCommodityRow } from "../global-intelligence/adapters/world-bank-commodity-prices.mjs";
import { normalizeEuSanctionsRecord } from "../global-intelligence/adapters/eu-sanctions.mjs";
import { normalizeUnctadStatObservation } from "../global-intelligence/adapters/unctadstat.mjs";
import { normalizeMofcomExportControl, parseMofcomExportControlHtml } from "../global-intelligence/adapters/china-mofcom.mjs";
import { normalizeAustraliaCriticalMineral, parseAustraliaCriticalMineralsHtml } from "../global-intelligence/adapters/australia-critical-minerals.mjs";
import { normalizeCochilcoObservation, parseCochilcoAnuarioHtml } from "../global-intelligence/adapters/cochilco-minerals.mjs";
import { normalizeOpcwNews, parseOpcwNewsHtml } from "../global-intelligence/adapters/opcw-news.mjs";
import { normalizeIcjCase, parseIcjCasesHtml } from "../global-intelligence/adapters/icj-cases.mjs";
import { normalizeIccNews, parseIccNewsHtml } from "../global-intelligence/adapters/icc-news.mjs";

const fixture = "<Designations><Designation><UniqueID>UK001</UniqueID><PrimaryName>Example Entity</PrimaryName><RegimeName>Example Regime</RegimeName><LastUpdated>2026-09-20</LastUpdated></Designation></Designations>";
const uk = parseUkSanctionsXml(fixture);
if (uk.length !== 1 || uk[0].source_record_id !== "UKSL:UK001") throw new Error("UK sanctions adapter fixture failed");

const wb = normalizeCommodityRow({commodity:"Copper",period:"2026-08",value:"123.45",unit:"USD/mt"});
if (wb.value_numeric !== 123.45 || wb.category !== "MACRO") throw new Error("World Bank commodity normalization failed");

const eu = normalizeEuSanctionsRecord({id:"EU001",name:"Example Entity &amp; Co",regime:"Example Regime",designationDate:"2026-09-20",raw:"<entity><id>EU001</id><name>Example Entity &amp; Co</name></entity>"});
if (eu.source_record_id !== "EUFS:EU001" || eu.title !== "EU financial sanctions designation: Example Entity & Co" || eu.category !== "GEOPOLITICS") throw new Error("EU sanctions normalization failed");

const unctad = normalizeUnctadStatObservation({dataset:"trade",series:"Exports",period:"2026-08",value:"42.5",unit:"USD million",countryIso3:"CHN"});
if (unctad.value_numeric !== 42.5 || unctad.country_iso3 !== "CHN" || unctad.category !== "MACRO") throw new Error("UNCTADstat normalization failed");

const mofcomHtml = '<html><body>exportcontrol.mofcom.gov.cn <a href="/notice/18-2025">Rare earth export control</a> 2025-04-04</body></html>';
const mofcomParsed = parseMofcomExportControlHtml(mofcomHtml);
if (mofcomParsed.length !== 1 || mofcomParsed[0].source_id !== "china_mofcom_trade_controls") throw new Error("MOFCOM live parser fixture failed");
const mofcom = normalizeMofcomExportControl({id:"18-2025",title:"Rare earth export control",issuedAt:"2025-04-04",commodity:"Rare earths"});
if (mofcom.country_iso3 !== "CHN" || mofcom.category !== "CRITICAL_MINERALS") throw new Error("MOFCOM normalization failed");

const ausHtml = '<html><body><h1>Critical Minerals List</h1><h2>Strategic Materials List</h2><table><tr><th>Mineral</th><th>Potential</th><th>Production</th></tr><tr><td>Lithium</td><td>High</td><td>75 kt</td></tr></table><p>Australia’s strategic materials are:</p><ul><li>aluminium</li><li>copper</li><li>phosphorus</li><li>tin</li><li>zinc</li></ul></body></html>';
const ausParsed = parseAustraliaCriticalMineralsHtml(ausHtml);
if (ausParsed.length !== 6 || !ausParsed.some((record) => record.commodity === "Lithium") || !ausParsed.some((record) => record.commodity === "copper" && record.value_text === "Strategic Materials List")) throw new Error("Australia live parser fixture failed");
const aus = normalizeAustraliaCriticalMineral({mineral:"Lithium",geologicalPotential:"High",production:"75 kt"});
if (aus.country_iso3 !== "AUS" || aus.commodity !== "Lithium") throw new Error("Australia critical minerals normalization failed");

const cochHtml = '<html><body><h1>Anuario de Estadísticas del Cobre y Otros Minerales</h1><a href="/web/download/db.xlsx">Base de Datos Anuario de Estadísticas Cochilco 2025</a></body></html>';
const cochDiscovery = parseCochilcoAnuarioHtml(cochHtml);
if (cochDiscovery.value_numeric !== 1 || !cochDiscovery.provenance.links[0].url.endsWith("db.xlsx")) throw new Error("COCHILCO live parser fixture failed");
const coch = normalizeCochilcoObservation({series:"Mine copper production",period:"2026-07",value:"400.3",unit:"kt",commodity:"Copper"});

const opcwHtml = '<html><body><h1>News</h1><div>OPCW</div><a href="/media-centre/news/2026/09/example-event">Example OPCW event</a><time>11 September 2026</time></body></html>';
const opcwParsed = parseOpcwNewsHtml(opcwHtml, {retrievedAt:"2026-09-24T00:00:00.000Z"});
if (opcwParsed.length !== 1 || opcwParsed[0].source_record_id !== "OPCW:%2Fmedia-centre%2Fnews%2F2026%2F09%2Fexample-event") throw new Error("OPCW live parser fixture failed");
if (normalizeOpcwNews({id:"OPCW001",title:"Example OPCW event"}).source_record_id !== "OPCW:OPCW001") throw new Error("OPCW normalization failed");

const icjHtml = '<html><body><h1>Cases</h1><div>International Court of Justice</div><a href="/cases/123">Example ICJ case</a><time>20 September 2026</time></body></html>';
const icjParsed = parseIcjCasesHtml(icjHtml, {retrievedAt:"2026-09-24T00:00:00.000Z"});
if (icjParsed.length !== 1 || icjParsed[0].source_record_id !== "ICJ:123") throw new Error("ICJ live parser fixture failed");
if (normalizeIcjCase({id:"ICJ001",title:"Example ICJ case",status:"Pending"}).source_record_id !== "ICJ:ICJ001") throw new Error("ICJ normalization failed");

const iccHtml = '<html><body><h1>News</h1><div>International Criminal Court</div><a href="/news/example-event">Example ICC event</a><time>20 September 2026</time></body></html>';
const iccParsed = parseIccNewsHtml(iccHtml, {retrievedAt:"2026-09-24T00:00:00.000Z"});
if (iccParsed.length !== 1 || iccParsed[0].source_record_id !== "ICC:example-event") throw new Error("ICC live parser fixture failed");
if (normalizeIccNews({id:"ICC001",title:"Example ICC event"}).source_record_id !== "ICC:ICC001") throw new Error("ICC normalization failed");

if (coch.country_iso3 !== "CHL" || coch.value_numeric !== 400.3) throw new Error("COCHILCO normalization failed");

console.log(JSON.stringify({
  status:"PASS",
  tests:["uk","world_bank","eu","unctadstat","mofcom","australia_critical_minerals","cochilco","opcw","icj","icc"]
}));
