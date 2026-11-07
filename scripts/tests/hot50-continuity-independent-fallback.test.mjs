import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../../.github/workflows/",import.meta.url);
const hot=readFileSync(new URL("hot50-direct-original-news-20m.yml",root),"utf8");
const privateWf=readFileSync(new URL("private-osint-d1-quota-held-spool.yml",root),"utf8");
const section=(src,jobName)=>{
 const key="  "+jobName+":\n",i=src.indexOf(key);
 assert.ok(i>=0,"registered protected job "+jobName);
 const rest=src.slice(i+key.length);
 const next=/\n  [a-z][a-z0-9-]*:\n/u.exec(rest);
 return next?src.slice(i,i+key.length+next.index):src.slice(i);
};
test("Hot50 20-minute direct poll survives both quota HELD and failed D1 writer via no-D1 encrypted path",()=>{
 assert.match(hot,/cron: "6,26,46 \* \* \* \*"/);
 const held=section(hot,"encrypted-held-three-domain-20m");
 assert.ok(held.includes("always()"));
 assert.ok(held.includes("needs: [source-contract, quota-admission, collect-direct-20m]"));
 assert.ok(held.includes("needs.quota-admission.result == 'failure'"));
 assert.ok(held.includes("needs.quota-admission.outputs.source_intake != 'true'"));
 assert.ok(held.includes("needs.quota-admission.outputs.source_intake == 'true'"));
 assert.ok(held.includes("needs.collect-direct-20m.result != 'success'"));
 assert.ok(held.includes("needs.quota-admission.result == 'skipped'"));
 assert.ok(held.includes('GEOMACRO_OSINT_SPOOL_ADMISSION: "HELD"'));
 assert.ok(held.includes("bun scripts/ops/private-osint-stage-held.ts"));
 assert.ok(!held.includes("d1 migrations apply"));
 assert.ok(!held.includes("wrangler d1 execute"));
 assert.ok(!held.includes("GEOMACRO_PREDGE"));
});
test("failed optional R2 mirror cannot prevent private encrypted GitHub fallback",()=>{
 const held=section(hot,"encrypted-held-three-domain-20m");
 const mirror=held.indexOf("id: held_r2_mirror");
 const optional=held.indexOf("continue-on-error: true",mirror);
 const warn=held.indexOf("steps.held_r2_mirror.outcome == 'failure'");
 const artifact=held.indexOf("name: geomacro-encrypted-private-osint-held",warn);
 assert.ok(mirror>=0&&optional>mirror&&warn>optional&&artifact>warn);
 assert.ok(held.slice(artifact).includes("retention-days: 3"));
 assert.ok(held.slice(warn,artifact).includes("GitHub"));
 assert.ok(held.slice(warn,artifact).includes("R2_DURABLE_ESCROW_FAILED"));
 assert.ok(held.slice(warn).includes("if: always()"));
 assert.ok(!held.includes("source_rights_granted: true"));
});
test("hourly 506-source private OSINT collection survives provider-admission runner failure without writing D1",()=>{
 const holding=section(privateWf,"encrypted-holding");
 assert.ok(holding.includes("always()"));
 assert.ok(holding.includes("needs.verify.result == 'success'"));
 assert.ok(holding.includes("needs.quota-admission.result == 'failure'"));
 assert.ok(holding.includes("needs.quota-admission.outputs.state == 'HELD'"));
 assert.ok(holding.includes("needs.quota-admission.outputs.critical != 'true'"));
 assert.ok(holding.includes('GEOMACRO_OSINT_SPOOL_ADMISSION: "HELD"'));
 assert.ok(holding.includes("bun scripts/ops/private-osint-stage-held.ts"));
 assert.ok(holding.includes("continue-on-error: true"));
 const artifact=holding.indexOf("name: geomacro-encrypted-private-osint-held");
 assert.ok(artifact>0);
 assert.ok(holding.slice(artifact).includes("retention-days: 3"));
 assert.ok(holding.includes("if: always() && steps.reuse.outputs.collect == 'true'"));
});
test("no migration, canary release, paid verdict, or protected quota bypass in source-only continuity workflows",()=>{
 for(const w of [hot,privateWf]){
  assert.ok(!w.includes("d1 time-travel restore"));
  assert.ok(!w.includes("versions deploy"));
  assert.ok(!w.includes("RISK_GATE_PAYMENT_ENABLED=true"));
 }
 assert.ok(hot.includes("needs.quota-admission.outputs.source_intake == 'true'"));
 assert.ok(privateWf.includes("GEOMACRO_OSINT_SPOOL_ADMISSION"));
});
