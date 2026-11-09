import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// The protected workflow must never infer a successful manual recovery
// from an earlier push's read-only probe or from an unrelated quota grant.
const read = name => readFileSync(
  new URL("../../.github/workflows/"+name,import.meta.url),"utf8");
const between = (body,start,end) => {
  const a=body.indexOf(start);
  const b=body.indexOf(end,a+start.length);
  assert.ok(a>=0 && b>a, "workflow anchors must remain explicit");
  return body.slice(a,b);
};

test("manual Shadow DDL requires fresh, real provider preflight from the SAME dispatch",()=>{
  const y=read("step3-shadow-prerequisite-bootstrap.yml");
  const pre=between(y,"  shadow-readonly-preflight:","  protected-shadow-bootstrap:");
  const apply=y.slice(y.indexOf("  protected-shadow-bootstrap:"));
  assert.match(pre,/github\.event_name == 'workflow_dispatch'/);
  assert.match(pre,/inputs\.apply == true/);
  assert.match(pre,/inputs\.approval == 'BOOTSTRAP_SHADOW_ONLY_AFTER_SIGNED_R2_RECOVERY'/);
  assert.match(pre,/node scripts\/ops\/bootstrap-step3-shadow-baseline\.mjs --preflight/);
  assert.match(pre,/node scripts\/ops\/inspect-step3-shadow-recovery-readonly\.mjs/);
  assert.match(apply,/needs: \[offline-prerequisite-sql, shadow-readonly-preflight\]/);
  assert.match(apply,/inputs\.apply == true/);
  assert.match(apply,/inputs\.approval == 'BOOTSTRAP_SHADOW_ONLY_AFTER_SIGNED_R2_RECOVERY'/);
  assert.match(apply,/test -f config\/d1-hotspot-v2-canary\.hold/);
  assert.match(apply,/node scripts\/ops\/bootstrap-step3-shadow-baseline\.mjs --apply/);
});

test("Paid CRITICAL_ONLY and failed source admission always preserve encrypted observations, not D1 writes",()=>{
  const y=read("private-osint-d1-quota-held-spool.yml");
  const held=between(y,"  encrypted-holding:","  restore-one-encrypted-private-r2-object-to-canonical-d1:");
  assert.match(held,/always\(\)/);
  assert.match(held,/needs\.verify\.result == 'success'/);
  assert.match(held,/needs\.quota-admission\.result == 'failure'/);
  assert.match(held,/needs\.quota-admission\.result == 'skipped'/);
  assert.match(held,/needs\.quota-admission\.outputs\.source_intake != 'true'/);
  assert.doesNotMatch(held,/needs\.quota-admission\.outputs\.state == 'HELD'/);
  assert.doesNotMatch(held,/needs\.quota-admission\.outputs\.critical != 'true'/);
  assert.match(held,/GEOMACRO_OSINT_SPOOL_ADMISSION: "HELD"/);
  assert.match(held,/bun scripts\/ops\/private-osint-stage-held\.ts/);
  assert.match(held,/geomacro-encrypted-private-osint-held/);
  assert.doesNotMatch(held,/run-protected-d1-repair|run-automatic-gro-signing/);
});
