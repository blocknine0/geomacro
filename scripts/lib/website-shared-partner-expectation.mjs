/**
 * Reuse an ALREADY read, exact canonical 72h D1 snapshot to certify the
 * Website archive cohort and compute the permitted attributed-research set.
 * This is pure offline logic: no D1 scan, HTTP request, PREDGE authentication,
 * payment, new quota, new storage, or commercial rights promotion.
 *
 * The returned expected projection is NOT authenticated PREDGE delivery proof.
 * The existing non-skipped protected-live-check is still required.
 */
import {buildDerivedNewsStructural} from "../../src/lib/derived-news-structural-bridge.ts";
import {isPermanentArchiveSignal} from "../ops/publish-permanent-derived-news-archive.mjs";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {verifyWebsiteNewsCatchupReadback} from "./website-news-canonical-reconciliation.mjs";

const CATEGORIES=["geopolitics","macro","rare_earth"];
const emptyCounts=()=>Object.fromEntries(CATEGORIES.map(c=>[c,0]));
const fail=code=>{throw Error("WEBSITE_SHARED_PARTNER_EXPECTATION_"+code)};

export function verifySharedArchivePartnerExpectation(archive,canonical,now){
 if(!Array.isArray(archive)||!Array.isArray(canonical)||
    archive.length>600||canonical.length>600||!Number.isFinite(now))
   fail("INPUT_INVALID");
 const admissible=s=>isPermanentArchiveSignal(s,now,{allowHistorical:false})&&
   verifyDerivedStory(s,now);
 const readback=verifyWebsiteNewsCatchupReadback(archive,canonical,now,admissible);
 const expected=buildDerivedNewsStructural(canonical,now,"attributed_research");
 const byId=new Map();
 for(const s of expected){
  if(!CATEGORIES.includes(s.category)||byId.has(s.id))fail("PARTNER_PROJECTION_DUPLICATE");
  byId.set(s.id,s);
 }
 const eligible=emptyCounts(),delivered=emptyCounts(),creditWithheld=emptyCounts();
 const seen=new Set();
 for(const s of archive){
  if(!admissible(s))continue;
  if(seen.has(s.id))fail("ARCHIVE_DUPLICATE");
  seen.add(s.id);
  eligible[s.category]++;
  const projection=byId.get(s.id);
  if(projection){
   if(projection.original_published_at!==s.published_at||
      projection.date_precision!==s.date_precision||
      !Array.isArray(s.sources_credited)||
      (s.sources_credited.length>0&&(
       projection.attribution_required!==true||
       JSON.stringify(projection.sources_credited)!==JSON.stringify(s.sources_credited)||
       !Array.isArray(projection.attribution_notices)||
       projection.attribution_notices.length!==s.sources_credited.length)))
    fail("ATTRIBUTION_OR_CLOCK_MISMATCH");
   delivered[s.category]++;
  }else{
   if(!Array.isArray(s.sources_credited)||s.sources_credited.length===0)
    fail("UNEXPLAINED_EXCLUSION");
   // A known-but-unknown-rights label stays off the partner feed. Never
   // mislabel it as a quota failure or silently grant source rights.
   creditWithheld[s.category]++;
  }
 }
 for(const category of CATEGORIES)
  if(eligible[category]!==delivered[category]+creditWithheld[category])
   fail("CATEGORY_SUM_UNVERIFIED");
 return Object.freeze({
  schema:"geomacro.website-shared-partner-expected-projection.v1",
  eligible_archive_ids:readback.eligible_archive_ids,
  canonical_exact_readback_verified:readback.exact_derived_payloads_and_source_clocks_verified,
  missing_canonical_ids:readback.missing_eligible_ids,
  category_archive_eligible:eligible,
  category_expected_attributed_partner_ids:delivered,
  category_rights_credit_withheld:creditWithheld,
  all_eligible_ids_accounted_for:true,
  same_existing_canonical_journal:true,
  expected_attributed_projection_only:true,
  authenticated_partner_live_delivery_verified:false,
  additional_d1_reads:0,additional_partner_gets:0,
  new_tables:0,payments:0,
 });
}
