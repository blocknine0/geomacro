import test from "node:test";
import assert from "node:assert/strict";
import {planGeomacroCommercialRightsIntake,privateRightsIntakePublicSummary} from "./geomacro-rights-intake-autopilot.mjs";
const H=n=>n.toString(16).padStart(64,"0");
const NOW=new Date("2026-10-21T12:00:00.000Z");
const base={
 source_id:"world_bank_indicators",
 originating_organization_id:"world-bank",
 original_url:"https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG",
 original_article_sha256:H(1),same_event_claim_sha256:H(13),
 category:"macro",country_iso3:"USA",
 original_published_at:"2026-10-21T11:00:00Z",
};
const other={...base,source_id:"usgs_mcs",
 originating_organization_id:"usgs",
 original_url:"https://www.usgs.gov/centers/national-minerals-information-center",
 original_article_sha256:H(2),category:"rare_earth",
 same_event_claim_sha256:H(19)};
const opts={now:NOW};
test("actual existing pinned catalogue attribution cannot be laundered into source-private commercial rights",()=>{
 const p=planGeomacroCommercialRightsIntake([base,other],opts);
 assert.equal(p.unique_originals,2);
 assert.equal(p.catalogue_source_count>=10,true);
 assert.equal(p.rights_dispositions.ATTRIBUTION_INCOMPATIBLE_WITH_PRIVATE_DELIVERY,1);
 assert.equal(p.rights_dispositions.PUBLIC_DOMAIN_AND_THIRD_PARTY_COMPONENTS_REVIEW_REQUIRED,1);
 assert.equal(p.items[1].source_reuse_decision,"PUBLIC_DOMAIN_ORIGINAL_SCOPE_REVIEW_REQUIRED");
 assert.equal(p.items[1].source_legal_permission_certified,false);
 assert.equal(p.issuer_facts_signatures_created,0);
 assert.equal(p.issuer_rights_signatures_created,0);
 assert.equal(p.gro_signatures_created,0);
 assert.equal(p.all_source_licenses_automatically_granted,false);
 assert.equal(p.paid_launch_ready,false);
 assert.equal(p.items[0].rights_request.permissions_created_by_geomacro,false);
});
test("unknown source generates an exact-article permission request, not an invented license",()=>{
 const x={...base,source_id:"an_official_unreviewed_source",original_article_sha256:H(3)};
 const p=planGeomacroCommercialRightsIntake([x],opts);
 assert.equal(p.items[0].disposition,"PUBLISHER_OR_DATASET_PERMISSION_REQUEST_REQUIRED");
 assert.equal(p.items[0].source_legal_permission_certified,false);
 assert.equal(p.items[0].rights_request.rights_holder_reply_received,false);
 assert.equal(p.real_source_legal_rights_created,0);
});
test("duplicates from same bytes or issuer syndicated claims do not count as independent originals",()=>{
 const fresh={...base,source_id:"an_unreviewed_source",original_article_sha256:H(10),
 originating_organization_id:"origin-A",original_url:"https://example.org/report/a"};
 const duplicateBytes={...fresh,source_id:"another_source",originating_organization_id:"origin-B",original_url:"https://example.net/report/b"};
 const duplicateClaim={...fresh,source_id:"another_source",original_article_sha256:H(11),original_url:"https://example.org/report/c"};
 const result=planGeomacroCommercialRightsIntake([fresh,duplicateBytes,duplicateClaim],opts);
 assert.equal(result.unique_originals,1);
 assert.equal(result.duplicates_removed,2);
 assert.equal(result.groups[0].independent_multiple_originals_candidate,false);
 assert.equal(result.groups[0].gro_signing_allowed,false);
});
test("two distinct originators of same event remain fact candidates, not commercial proof",()=>{
 const x={...base,source_id:"source_new_a",originating_organization_id:"origin-A",original_article_sha256:H(21)};
 const y={...x,source_id:"source_new_b",originating_organization_id:"origin-B",
  original_url:"https://example.net/news/21",original_article_sha256:H(22)};
 const p=planGeomacroCommercialRightsIntake([x,y],opts);
 assert.equal(p.unique_originals,2);
 assert.equal(p.groups[0].independent_multiple_originals_candidate,true);
 assert.equal(p.groups[0].source_private_rights_pending,true);
 assert.equal(p.groups[0].factual_semantic_review_pending,true);
 assert.equal(p.groups[0].gro_signing_allowed,false);
});
test("unreviewed unsigned user-submitted legal metadata cannot turn into publisher rights",()=>{
 const x={...base,source_id:"new_license",original_article_sha256:H(23)};
 const proof={source_id:x.source_id,original_article_sha256:H(23),
 permission_document_sha256:H(31),licensed_article_scope_sha256:H(32),
 commercial_derived_use_requested:true,no_attribution_claimed:true,
 third_party_components_excluded:true,raw_redistribution_requested:false,
 legal_basis:"ARTICLE_SPECIFIC_WRITTEN_PERMISSION",
 rights_document_reviewed_at:"2026-10-21T10:00:00Z",
 rights_document_expires_at:"2027-01-01T00:00:00Z"};
 const p=planGeomacroCommercialRightsIntake([x],{...opts,permissions:[proof]});
 assert.equal(p.items[0].permission_evidence_present,true);
 assert.equal(p.items[0].disposition,"PUBLISHER_OR_DATASET_PERMISSION_REQUEST_REQUIRED");
 assert.equal(p.items[0].rights_authority_signed,false);
 const f={...proof,rights_owner_signature:"UNVERIFIED"};
 assert.throws(()=>planGeomacroCommercialRightsIntake([x],{...opts,permissions:[f]}),/RIGHTS_INTAKE_NOT_VERIFIED/);
});
test("stale item cannot be signed as current even when source catalogue is approved",()=>{
 const x={...base,source_id:"world_bank_indicators",
  original_published_at:"2026-10-19T00:00:00Z"};
 const p=planGeomacroCommercialRightsIntake([x],opts);
 assert.equal(p.items[0].disposition,"ORIGINAL_TOO_OLD_FOR_CURRENT_GRO");
});
test("public report does not show private URLs/issuer names/source IDs or permission files",()=>{
 const p=planGeomacroCommercialRightsIntake([base],opts);
 const safe=privateRightsIntakePublicSummary(p);
 const serialized=JSON.stringify(safe);
 for(const value of [base.original_url,base.source_id,
   base.originating_organization_id,base.original_article_sha256])
  assert.equal(serialized.includes(value),false);
 assert.equal(safe.private_items_redacted,true);
});
test("reject future clock, invalid HTTPS, embedded secret, raw article bytes",()=>{
 assert.throws(()=>planGeomacroCommercialRightsIntake([{...base,original_published_at:"2027-11-01T00:00:00Z"}],opts));
 assert.throws(()=>planGeomacroCommercialRightsIntake([{...base,original_url:"http://example.org/a"}],opts));
 assert.throws(()=>planGeomacroCommercialRightsIntake([{...base,api_key:"abc"}],opts));
 assert.throws(()=>planGeomacroCommercialRightsIntake([{...base,raw_body:"copyright news"}],opts));
});
