import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
describe("commercial rights intake automation cannot fabricate upstream permission",()=>{
 const plan=readFileSync("scripts/lib/geomacro-rights-intake-autopilot.mjs","utf8");
 const cli=readFileSync("scripts/ops/run-geomacro-rights-intake.mjs","utf8");
 const workflow=readFileSync(".github/workflows/source-rights-intake-observer.yml","utf8");
 it("deduplicates native sources and exact event IDs without manufacturing signatures",()=>{
   for(const token of ["REPEATED_ARTICLE_BYTES","SAME_ISSUER_URL","SAME_ISSUER_CLAIM",
    "ARTICLE_SCOPE_PROOF_FOR_INDEPENDENT_RIGHTS_REVIEW",
    "PUBLISHER_OR_DATASET_PERMISSION_REQUEST_REQUIRED",
    "PUBLIC_DOMAIN_AND_THIRD_PARTY_COMPONENTS_REVIEW_REQUIRED",
    "ATTRIBUTION_INCOMPATIBLE_WITH_PRIVATE_DELIVERY",
    "rights_authority_signed:false","facts_authority_signed:false",
    "production_gro_signed:false",
    "paid_launch_ready:false"]){
     expect(plan).toContain(token);
   }
 });
 it("must restrict private original queue and keep upstream rights unapproved",()=>{
   expect(cli).toContain("constants.O_NOFOLLOW");
   expect(cli).toContain("constants.O_EXCL");
   expect(cli).toContain("0o600");
   expect(cli).toContain("privateRightsIntakePublicSummary");
   expect(plan).toContain("real_source_legal_rights_created:0");
   expect(plan).toContain("all_source_licenses_automatically_granted:false");
   expect(plan).toContain("customer_source_identities_disclosed:false");
 });
 it("no weekly paid workflow, private keys, archived originals or hidden signed GRO",()=>{
   expect(workflow).toContain('cron: "43 6 * * 3"');
   expect(workflow).toContain('permissions:');
   expect(workflow).toContain('contents: read');
   expect(workflow).toContain('RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64: ""');
   expect(workflow).toContain('B2_APPLICATION_KEY: ""');
   expect(workflow).toContain("SOURCE_RIGHTS_QUEUE_ONLY_NO_PERMISSION_GENERATED_NO_FUNDS");
   expect(workflow).not.toContain("workflow_dispatch:\n    inputs:");
 });
});
