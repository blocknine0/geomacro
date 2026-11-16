import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflows = [
  {
    path: ".github/workflows/hot50-direct-original-news-20m.yml",
    job: "collect-direct-20m",
  },
  {
    path: ".github/workflows/private-global-osint-15m.yml",
    job: "collect-source-intake-only",
  },
];

function jobBlock(source, name) {
  const start = source.indexOf("  " + name + ":\n");
  assert.notEqual(start, -1, "missing job " + name);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/^  [A-Za-z0-9_-]+:\s*$/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

test("Risk Stream collector emitters resolve credentials from production environment", () => {
  for (const workflow of workflows) {
    const source = readFileSync(workflow.path, "utf8");
    const job = jobBlock(source, workflow.job);
    assert.match(job, /^    environment:\s*production\s*$/m, workflow.job);
    assert.match(job, /CONTROL_PLANE_TOKEN:\s*\$\{\{\s*secrets\.CONTROL_PLANE_TOKEN\s*\|\|\s*secrets\.GEOMACRO_COMMERCE_LEDGER_TOKEN\s*\}\}/);
    assert.match(job, /RISK_STREAM_MACHINE_FACTS_SPKI_B64:\s*\$\{\{\s*secrets\.RISK_STREAM_MACHINE_FACTS_SPKI_B64\s*\}\}/);
    assert.match(job, /RISK_STREAM_MACHINE_RIGHTS_SPKI_B64:\s*\$\{\{\s*secrets\.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64\s*\}\}/);
    assert.match(job, /vars\.RISK_STREAM_ACTIVE == '1'/);
    assert.match(job, /vars\.STREAM_INGESTION_ENABLED == 'true'/);
    assert.match(job, /run: node scripts\/ops\/emit-risk-stream-collector-sidecar\.mjs/);
  }
});
