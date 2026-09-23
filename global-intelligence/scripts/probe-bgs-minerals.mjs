import { normalizeBgsWorldMineralsFeature, fetchBgsWorldMinerals } from "../adapters/bgs-world-minerals.mjs";

const sample = normalizeBgsWorldMineralsFeature({
  id: "sample-1",
  properties: {
    year: 2022,
    country: "Guyana",
    commodity: "Gold",
    "statistic type": "Production",
    quantity: 100,
    unit: "tonnes"
  }
});

if (sample.evidence_type !== "PRODUCTION" || sample.year !== 2022 || sample.value !== 100) {
  throw new Error("BGS parser self-test failed");
}

if (process.env.RUN_BGS_REMOTE_PROBE === "1") {
  const result = await fetchBgsWorldMinerals({ limit: 1 });
  if (!Array.isArray(result.rows)) throw new Error("BGS remote probe returned invalid rows");
  console.log(JSON.stringify({ status: "PASS", count: result.count, endpoint: result.endpoint }));
} else {
  console.log(JSON.stringify({
    status: "SELF_TEST_PASS",
    remote_probe: "SKIPPED",
    next: "Set RUN_BGS_REMOTE_PROBE=1 after reviewing BGS terms/rate limits."
  }));
}
