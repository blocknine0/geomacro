import { probeHistoricalConnection } from "../adapters/historical-data.mjs";

const results = {};
for (const name of ["macro", "geopolitics", "rare_earths"]) {
  try {
    const result = await probeHistoricalConnection(name);
    results[name] = {status: "PASS", count: result.count, table: result.source_table};
  } catch (error) {
    results[name] = {status: "FAIL", error: String(error?.message ?? error)};
  }
}
console.log(JSON.stringify(results, null, 2));
