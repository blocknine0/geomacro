import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {resolvePredgeResearchBearer,derivePredgeResearchBearer}
 from "../../scripts/ops/predge-sealed-token-handoff.mjs";

describe("19 October emailed Predge research token revocation",()=>{
 it("will never reinstate predictable HMAC fallback at Worker deployment",()=>{
  const deploy=readFileSync(".github/workflows/deploy-control-plane-d1.yml","utf8");
  expect(deploy).toContain("PREDGE_RESEARCH_GRANT_MODE=REVOKED_PENDING_OWNER_ROTATION");
  expect(deploy).toContain('PREDGE_RESEARCH_NEWS_TOKEN="REVOKED_ROTATION_REQUIRED"');
  expect(deploy).toContain("PREDGE_RESEARCH_PRIVILEGED_CREDENTIAL_REUSE_FORBIDDEN");
  expect(deploy).toContain('PREDGE_REVOKED_OLD_TOKEN');
  expect(deploy).not.toContain("PREDGE_RESEARCH_GRANT_MODE=EXISTING_SEPARATE_HMAC_TOKEN");
  expect(deploy).toContain("secret put PREDGE_RESEARCH_NEWS_TOKEN");
  expect(deploy).toContain("verify-predge-auth-research-delivery.mjs");
 });
 it("rejects missing override, old emailed token and privileged root/admin grants",()=>{
  const root="k".repeat(48);
  const old=derivePredgeResearchBearer(root);
  expect(()=>resolvePredgeResearchBearer({root,override:""})).toThrow("PREDGE_RESEARCH_ROTATION_REQUIRED");
  expect(()=>resolvePredgeResearchBearer({root,override:old})).toThrow("PREDGE_HANDOFF_PRIVILEGED_TOKEN_REUSE_FORBIDDEN");
  expect(resolvePredgeResearchBearer({root,override:"a".repeat(64)})).toBe("a".repeat(64));
 });
 it("requires real live old-credential rejection before partner encrypted handoff",()=>{
  const verifier=readFileSync("scripts/ops/verify-predge-auth-research-delivery.mjs","utf8");
  expect(verifier).toContain("OLD_RESEARCH_TOKEN_NOT_REVOKED");
  expect(verifier).toContain("legacyAttempt.status!==401");
  expect(verifier).toContain("legacyAttempt.status!==503");
  const handoff=readFileSync("scripts/ops/predge-sealed-token-handoff.mjs","utf8");
  expect(handoff).toContain('error("PREDGE_RESEARCH_ROTATION_REQUIRED")');
 });
});
