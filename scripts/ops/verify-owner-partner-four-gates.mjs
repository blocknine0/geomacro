#!/usr/bin/env node
/**
 * GEOmacRO-OWNED evidence gate for the partner's four outstanding research
 * questions. Offline local-only evaluation. No API, PREDGE quota, DB, funds,
 * signer, or new rights. Do not send source snapshots to public Actions.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const CATS=["geopolitics","macro","rare_earth"];
const STATES=["MONITORED_SOURCE_REPORT_UNVERIFIED",
  "DATED_OFFICIAL_FEED_CANDIDATE_UNCLASSIFIED",
  "OFFICIAL_RELEASE_OBSERVED_UNSCORED"];
const W=72*3600_000;
const err=code=>{throw Error("OWNER_PARTNER_FOUR_GATES_"+code);};
const counts=rows=>Object.fromEntries(CATS.map(c=>[c,rows.filter(x=>x.category===c).length]));
const countBy=(rows,f)=>Object.fromEntries(CATS.map(c=>[c,rows.filter(x=>x.category===c&&f(x)).length]));
const digest=rows=>createHash("sha256").update(rows.map(x=>x.id).sort().join("\n")).digest("hex");
const epoch=x=>Date.parse(typeof x==="string"?x:"");
function verify(feed){
 if(feed?.ok!==true||feed.schema!=="geomacro.derived-news-structural-feed.v1"||
   !["source_neutral","attributed_research"].includes(feed.projection)||
   feed.journal_origin!=="SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE"||
   !Number.isFinite(epoch(feed.generated_at))||
   feed.retention_hours!==72||feed.raw_upstream_delivered!==false||
   feed.signed!==false||feed.chargeable!==false||
   feed.partner_resale_or_commercial_redistribution_authorized!==false||
   !Array.isArray(feed.items)||feed.items.length>600)err("SNAPSHOT_CONTRACT");
 const seen=new Set();
 for(const r of feed.items){
   if(!r||typeof r.id!=="string"||!r.id||r.id.length>256||
      seen.has(r.id)||!CATS.includes(r.category)||
      !STATES.includes(r.confidence_state)||
      !Number.isFinite(epoch(r.original_published_at))||
      r.signed_product_verified!==false||r.payable!==false||
      r.commercial_derived_rights_verified!==false||
      !Array.isArray(r.sources_credited??[])||
      (r.sources_credited?.length>0&&
       (r.attribution_required!==true||
        !Array.isArray(r.attribution_notices)||
        r.attribution_notices.length!==r.sources_credited.length)))
     err("SNAPSHOT_ITEM");
   if(r.sources_credited?.length&&feed.projection==="source_neutral")
     err("SOURCE_NEUTRAL_CREDIT");
   seen.add(r.id);
 }
 if(CATS.some(c=>feed.counts?.[c]!==counts(feed.items)[c]))
    err("COUNT_INCONSISTENCY");
 return feed;
}
export function reconcileHistoricalSnapshots(previous,current){
 if(previous===null||previous===undefined)return Object.freeze({
   status:"BASELINE_WITH_NATIVE_IDS_NOT_AVAILABLE",
   exact_historical_reconciliation_verified:false,
   partner_outage_inferred:false
 });
 const old=verify(previous),now=verify(current);
 if(old.projection!==now.projection)err("DIFFERENT_PROJECTIONS");
 const a=new Map(old.items.map(x=>[x.id,x]));
 const b=new Map(now.items.map(x=>[x.id,x]));
 const kept=[],entered=[],left=[],statusChanged=[];
 for(const row of now.items){
   if(!a.has(row.id))entered.push(row);
   else{
    const p=a.get(row.id);
    if(row.category!==p.category||
       row.original_published_at!==p.original_published_at)
      err("ID_NATIVE_IDENTITY_CHANGED");
    kept.push(row);
    if(row.confidence_state!==p.confidence_state)statusChanged.push(row);
   }
 }
 for(const row of old.items)if(!b.has(row.id))left.push(row);
 const t=epoch(now.generated_at),earlier=epoch(old.generated_at);
 if(t<earlier)err("REVERSED_COHORT_CLOCKS");
 const expiredCandidates=left.filter(x=>epoch(x.original_published_at)<t-W);
 return Object.freeze({
  status:t-earlier>W?"DIFFERENT_72H_WINDOWS_NO_DATA_LOSS_INFERENCE":
   "ID_DELTA_OBSERVED_NOT_CAUSAL_EXPLANATION",
  old_snapshot_utc:old.generated_at,new_snapshot_utc:now.generated_at,
  old_projection:old.projection,
  old_count:old.items.length,current_count:now.items.length,
  by_category:{old:counts(old.items),current:counts(now.items),
   kept:counts(kept),entered:counts(entered),left:counts(left),
   status_changed_without_independent_proof:counts(statusChanged),
   left_aged_out_candidates_not_verified_deletions:counts(expiredCandidates)},
  old_id_set_sha256:digest(old.items),new_id_set_sha256:digest(now.items),
  source_native_identity_preserved_for_retained_ids:true,
  exact_historical_id_set_difference_verified:true,
  publisher_cause_or_delivery_outage_verified:false,
  new_items_not_automatically_qualified:true,
 });
}
export function auditProvenanceAndPreview(feed){
 const f=verify(feed),rows=f.items;
 const byCategory=counts(rows);
 const credited=countBy(rows,x=>(x.sources_credited?.length??0)>0);
 const uncredited=countBy(rows,x=>!x.sources_credited?.length);
 const monitored=countBy(rows,x=>x.confidence_state===STATES[0]);
 const candidate=countBy(rows,x=>x.confidence_state===STATES[1]);
 const observed=countBy(rows,x=>x.confidence_state===STATES[2]);
 const invalidCert=countBy(rows,x=>x.event_detail_verified===true||
   x.independent_same_event_verified===true||x.numeric_impact_established===true);
 if(CATS.some(c=>invalidCert[c]>0))err("RESEARCH_ITEM_INCORRECTLY_CERTIFIED");
 const previewCapacity=Object.fromEntries(CATS.map(c=>[c,Math.min(50,byCategory[c])]));
 return Object.freeze({
  schema:"geomacro.owner-partner-four-gates.v1",
  snapshot_at:f.generated_at,
  projection:f.projection,
  category_counts:byCategory,
  source_credit_notice_present:credited,
  source_credit_absent_not_proven_defect:uncredited,
  monitored_osint_unverified:monitored,
  dated_official_candidates_not_classified:candidate,
  official_observed_unscored:observed,
  eligible_advisory_preview_per_category:previewCapacity,
  fifty_each_advisory_possible:CATS.every(c=>previewCapacity[c]===50),
  advisory_news_is_signed:false,
  signed_50_each_verified:false,
  signed_context_contract:"PENDING_BOTH_PARTIES_VERSIONED_VALIDATOR_AGREEMENT",
  current_risk_gate_schema_has_news_context:false,
  original_source_licensing_review_required:true,
  no_credit_does_not_imply_credit_violation:true,
  corroboration_and_article_rights_not_proven_by_research:true,
  production_gro_proof_verified:false,
  commercial_permission_verified:false,
  payment_authorized:false,
  exact_id_set_sha256:digest(rows),
 });
}
export function validateProposedNewsContext(proposal,feed){
 const f=verify(feed);
 if(proposal?.schema!=="geomacro.news-context.draft.v1"||
   proposal?.research_only!==true||proposal.signed_news!==false||
   proposal?.execution_authorized!==false||
   proposal?.retention_hours!==72||proposal?.partner_validator_approved!==false||
   proposal?.commercial_rights_verified!==false||
   !proposal?.categories||typeof proposal.categories!=="object"||
   Object.keys(proposal.categories).sort().join(",")!==[...CATS].sort().join(","))
   err("NEWS_CONTEXT_DRAFT_INVALID");
 const lookup=new Map(f.items.map(x=>[x.id,x]));
 for(const c of CATS){
  const selection=proposal.categories[c];
  if(!Array.isArray(selection)||selection.length>50||new Set(selection).size!==selection.length)
    err("NEWS_CONTEXT_CATEGORY_CAP");
  for(const id of selection){
   const item=lookup.get(id);
   if(!item||item.category!==c)err("NEWS_CONTEXT_ID_NOT_IN_CURRENT_FEED");
  }
 }
 return Object.freeze({
  schema:"geomacro.news-context-draft-check.v1",
  status:"VALID_OFFLINE_DRAFT_NOT_RISK_GATE_1_0_COMPATIBLE",
  selected_counts:Object.fromEntries(CATS.map(c=>[c,proposal.categories[c].length])),
  all_categories_have_50:CATS.every(c=>proposal.categories[c].length===50),
  source_native_ids_matched:true,
  signed_news_verified:false,verified_current_gro:false,
  consumer_validator_approved:false,commercial_rights_verified:false,
  execution_authorized:false,
 });
}
if(process.argv[1]?.endsWith("verify-owner-partner-four-gates.mjs")){
 try{
  if(process.argv.length<3||process.argv.length>4)err("USAGE");
  const local=path=>{
    const raw=readFileSync(path,"utf8");
    if(Buffer.byteLength(raw,"utf8")>3_000_000)err("FILE_TOO_LARGE");
    return JSON.parse(raw);
  };
  const current=local(process.argv[2]);
  const historical=process.argv[3]?local(process.argv[3]):null;
  console.log(JSON.stringify({
    provenance:auditProvenanceAndPreview(current),
    historical:reconcileHistoricalSnapshots(historical,current)
  }));
 }catch(e){
  const m=String(e?.message??"");
  console.error("::error::"+(/^OWNER_PARTNER_FOUR_GATES_[A-Z0-9_]+$/.test(m)?m:"OWNER_PARTNER_FOUR_GATES_UNVERIFIED"));
  process.exitCode=2;
 }
}
