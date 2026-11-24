import test from "node:test";
import assert from "node:assert/strict";
import { verifyPredgePaidRiskGateLock } from "../ops/verify-predge-paid-risk-gate-lock.mjs";

test("Predge Paid Risk Gate end-to-end lock verifies all 7 pinned files", () => {
  const res = verifyPredgePaidRiskGateLock();
  assert.equal(res.ok, true);
  assert.equal(res.locked, true);
  assert.equal(res.verified_files, 7);
});
