#!/usr/bin/env node
import { parseUkSanctionsXml } from "../global-intelligence/adapters/uk-sanctions-list.mjs";
import { normalizeCommodityRow } from "../global-intelligence/adapters/world-bank-commodity-prices.mjs";
import { normalizeEuSanctionsRecord } from "../global-intelligence/adapters/eu-sanctions.mjs";
import { normalizeUnctadStatObservation } from "../global-intelligence/adapters/unctadstat.mjs";

const fixture = "<Designations><Designation><UniqueID>UK001</UniqueID><PrimaryName>Example Entity</PrimaryName><RegimeName>Example Regime</RegimeName><LastUpdated>2026-09-20</LastUpdated></Designation></Designations>";
const uk = parseUkSanctionsXml(fixture);
if (uk.length !== 1 || uk[0].source_record_id !== "UKSL:UK001") throw new Error("UK sanctions adapter fixture failed");

const wb = normalizeCommodityRow({commodity:"Copper",period:"2026-08",value:"123.45",unit:"USD/mt"});
if (wb.value_numeric !== 123.45 || wb.category !== "MACRO") throw new Error("World Bank commodity normalization failed");

const eu = normalizeEuSanctionsRecord({id:"EU001",name:"Example Entity",regime:"Example Regime",designationDate:"2026-09-20"});
if (eu.source_record_id !== "EUFS:EU001" || eu.category !== "GEOPOLITICS") throw new Error("EU sanctions normalization failed");

const unctad = normalizeUnctadStatObservation({dataset:"trade",series:"Exports",period:"2026-08",value:"42.5",unit:"USD million",countryIso3:"CHN"});
if (unctad.value_numeric !== 42.5 || unctad.country_iso3 !== "CHN" || unctad.category !== "MACRO") throw new Error("UNCTADstat normalization failed");

console.log(JSON.stringify({status:"PASS",tests:["uk_sanctions_xml_normalization","world_bank_commodity_normalization","eu_sanctions_normalization","unctadstat_normalization"]}));
