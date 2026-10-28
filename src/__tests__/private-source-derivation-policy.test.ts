import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const p=JSON.parse(readFileSync("config/private-source-derivation-policy.v1.json","utf8"));
describe("founder private OSINT and news derivation policy",()=>{
 it("does not require commercial preclearance merely to ingest research candidates",()=>{
   expect(p.schema_version).toBe("geomacro.private-source-derivation-policy.v1");
   expect(p.ingestion.allow_any_source_as_private_research_candidate).toBe(true);
   expect(p.ingestion.commercial_license_preclearance_required_to_collect).toBe(false);
   expect(p.ingestion.preservation).toBe("OWNER_PRIVATE_ONLY");
 });
 it("keeps buyer payload uniquely derived and no-raw, but no implied paid reuse permission",()=>{
   expect(p.transformation.style).toBe("ORIGINAL_DERIVED_STRUCTURED_ANALYSIS");
   expect(p.transformation.upstream_raw_article_redistribution).toBe(false);
   expect(p.transformation.private_original_urls_or_source_identifiers_to_customer).toBe(false);
   expect(p.paid_publication.do_not_sell_explicitly_restricted_derived_reuse).toBe(true);
   expect(p.paid_publication.signed_risk_object_requires_real_cryptographic_signature).toBe(true);
   expect(p.paid_publication.payment_requires_existing_verified_x402_settlement).toBe(true);
   expect(p.partner_lock.predge_code_workflows_auth_quotas_contracts_untouched).toBe(true);
 });
});
