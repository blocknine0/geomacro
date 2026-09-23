import { fetchHistoricalMacro, fetchHistoricalGeopolitics, fetchHistoricalRareEarths } from "../adapters/historical-data.mjs";

const results = {};
for (const [name, fn] of [
  ["macro", fetchHistoricalMacro],
  ["geopolitics", fetchHistoricalGeopolitics],
  ["rare_earths", fetchHistoricalRareEarths]
]) {
  try {
    const result = await fn({limit: 1});
    results[name] = {status: "PASS", count: result.count, table: result.source_table};
  } catch (error) {
    results[name] = {status: "FAIL", error: String(error?.message ?? error)};
  }
}
console.log(JSON.stringify(results, null, 2));
