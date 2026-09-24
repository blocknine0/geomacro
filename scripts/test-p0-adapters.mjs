#!/usr/bin/env node
import { parseUkSanctionsXml } from "../global-intelligence/adapters/uk-sanctions-list.mjs";
import { normalizeCommodityRow } from "../global-intelligence/adapters/world-bank-commodity-prices.mjs";
import { normalizeEuSanctionsRecord } from "../global-intelligence/adapters/eu-sanctions.mjs";
import { normalizeUnctadStatObservation } from "../global-intelligence/adapters/unctadstat.mjs";
import { normalizeMofcomExportControl } from "../global-intelligence/adapters/china-mofcom.mjs";
import { normalizeAustraliaCriticalMineral } from "../global-intelligence/adapters/australia-critical-minerals.mjs";
import { normalizeCochilcoObservation } from "../global-intelligence/adapters/cochilco-minerals.mjs";

const fixture = "<Designations><Designation><UniqueID>UK001</UniqueID><PrimaryName>Example Entity</PrimaryName><RegimeName>Example Regime</RegimeName><LastUpdated>2026-09-20</LastUpdated></Designation></Designations>";
const uk = parseUkSanctionsXml(fixture);
if (uk.length !== 1 || uk[0].source_record_id !== "UKSL:UK001") throw new Error("UK sanctions adapter fixture failed");

const wb = normalizeCommodityRow({commodity:"Copper",period:"2026-08",value:"123.45",unit:"USD/mt"});
if (wb.value_numeric !== 123.45 || wb.category !== "MACRO") throw new Error("World Bank commodity normalization failed");

const eu = normalizeEuSanctionsRecord({id:"EU001",name:"Example Entity",regime:"Example Regime",designationDate:"2026-09-20"});
if (eu.source_record_id !== "EUFS:EU001" || eu.category !== "GEOPOLITICS") throw new Error("EU sanctions normalization failed");

const unctad = normalizeUnctadStatObservation({dataset:"trade",series:"Exports",period:"2026-08",value:"42.5",unit:"USD million",countryIso3:"CHN"});
if (unctad.value_numeric !== 42.5 || unctad.country_iso3 !== "CHN" || unctad.category !== "MACRO") throw new Error("UNCTADstat normalization failed");

const mofcom = normalizeMofcomExportControl({id:"18-2025",title:"Rare earth export control",issuedAt:"2025-04-04",commodity:"Rare earths"});
if (mofcom.country_iso3 !== "CHN" || mofcom.category !== "CRITICAL_MINERALS") throw new Error("MOFCOM normalization failed");

const aus = normalizeAustraliaCriticalMineral({mineral:"Lithium",geologicalPotential:"High",production:"75 kt"});
if (aus.country_iso3 !== "AUS" || aus.commodity !== "Lithium") throw new Error("Australia critical minerals normalization failed");

const coch = normalizeCochilcoObservation({series:"Mine copper production",period:"2026-07",value:"400.3",unit:"kt",commodity:"Copper"});
if (coch.country_iso3 !== "CHL" || coch.value_numeric !== 400.3) throw new Error("COCHILCO normalization failed");

console.log(JSON.stringify({status:"PASS",tests:["uk","world_bank","eu","unctadstat","mofcom","australia_critical_minerals","cochilco"]}));
