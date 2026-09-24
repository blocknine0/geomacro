#!/usr/bin/env node
import { parseUkSanctionsXml } from "../global-intelligence/adapters/uk-sanctions-list.mjs";
import { normalizeCommodityRow } from "../global-intelligence/adapters/world-bank-commodity-prices.mjs";

const fixture = "<Designations><Designation><UniqueID>UK001</UniqueID><PrimaryName>Example Entity</PrimaryName><RegimeName>Example Regime</RegimeName><LastUpdated>2026-09-20</LastUpdated></Designation></Designations>";
const uk = parseUkSanctionsXml(fixture);
if (uk.length !== 1 || uk[0].source_record_id !== "UKSL:UK001") throw new Error("UK sanctions adapter fixture failed");

const wb = normalizeCommodityRow({commodity:"Copper",period:"2026-08",value:"123.45",unit:"USD/mt"});
if (wb.value_numeric !== 123.45 || wb.category !== "MACRO") throw new Error("World Bank commodity normalization failed");

console.log(JSON.stringify({status:"PASS",tests:["uk_sanctions_xml_normalization","world_bank_commodity_normalization"]}));
