import {fetchWorldBank, fetchWorldBankIndicatorCatalog} from "../adapters/world-bank.mjs";

const countries = ["IND", "USA", "CHN"];
const indicators = [
  "NY.GDP.MKTP.CD",
  "NY.GDP.MKTP.KD.ZG",
  "FP.CPI.TOTL.ZG",
  "SL.UEM.TOTL.ZS"
];

let failures = 0;

for (const country of countries) {
  try {
    const rows = await fetchWorldBank(country, {indicators, mrv: 5});
    const found = new Set(rows.map(r => {
      try { return JSON.parse(r.summary).indicator; } catch { return null; }
    }).filter(Boolean));

    if (!rows.length) {
      failures++;
      console.log(`FAIL ${country}: no observations`);
    } else {
      console.log(`PASS ${country}: ${rows.length} observations, ${found.size} indicators`);
    }
  } catch (error) {
    failures++;
    console.log(`FAIL ${country}: ${error.message}`);
  }
}

try {
  const catalog = await fetchWorldBankIndicatorCatalog({page: 1, perPage: 10});
  if (!catalog.total || !catalog.indicators.length) {
    failures++;
    console.log("FAIL indicator catalog: empty");
  } else {
    console.log(`PASS indicator catalog: ${catalog.total} indicators reported`);
  }
} catch (error) {
  failures++;
  console.log(`FAIL indicator catalog: ${error.message}`);
}

if (failures) process.exit(1);
