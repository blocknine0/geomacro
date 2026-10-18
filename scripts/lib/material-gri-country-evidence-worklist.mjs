import {createHash} from "node:crypto";

const THREE_DOMAINS=Object.freeze(["geopolitics","macro","rare_earth"]);
const KINDS=new Set([
 "armed_security_change","sanctions_or_export_restriction","cross_border_policy_change",
 "diplomatic_agreement","official_security_alert","central_bank_policy_decision",
 "official_inflation_or_price_release","trade_or_tariff_policy",
 "external_trade_restriction","financial_stability_warning",
 "critical_mineral_production_milestone","mineral_export_control",
 "mine_or_processing_approval","strategic_mineral_financing",
 "mineral_offtake_or_supply_agreement","mineral_trade_policy",
]);
const ID=/^(geopolitics|macro|rare_earth)-[a-z0-9-]{4,100}$/u;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const CAL_DAY=/^\d{4}-\d\d-\d\d$/u;
const normalize=x=>x.trim().normalize("NFKC").replace(/[’ʼʻ]/gu,"\x27").replace(/\s+/gu," ").toLowerCase();

/**
 * Derive an offline 195-country EXACT lookup from the repository's audited
 * single canonical registry. Never guess from substrings like "IndiaMart",
 * regional clusters, a multi-country string or an arbitrary three-letter code.
 */
export function canonicalMaterialGriCountryLookup(countryRegistrySource){
  if(typeof countryRegistrySource!=="string"||countryRegistrySource.length>30_000)
    throw Error("MATERIAL_GRI_COUNTRY_REGISTRY_REQUIRED");
  const m=countryRegistrySource.match(/const COUNTRY_ROWS=\x60([\s\S]{1000,13000}?)\x60;/u);
  if(!m)throw Error("MATERIAL_GRI_COUNTRY_REGISTRY_REQUIRED");
  const rows=m[1].trim().split(/\r?\n/u);
  if(rows.length!==195)throw Error("MATERIAL_GRI_COUNTRY_DENOMINATOR_DRIFT");
  const lookup=new Map(),iso3=new Set(),iso2=new Set();
  for(const row of rows){
    const fields=row.split("|");
    if(fields.length!==3||!/^[A-Z]{3}$/u.test(fields[0])||
       !/^[A-Z]{2}$/u.test(fields[1])||fields[2].length<3||
       iso3.has(fields[0])||iso2.has(fields[1]))
      throw Error("MATERIAL_GRI_COUNTRY_REGISTRY_INVALID");
    iso3.add(fields[0]);iso2.add(fields[1]);
    for(const key of [fields[0],fields[1],fields[2]]){
      const label=normalize(key),existing=lookup.get(label);
      if(existing&&existing!==fields[0])
        throw Error("MATERIAL_GRI_COUNTRY_ALIAS_COLLISION");
      lookup.set(label,fields[0]);
    }
  }
  // Consume the canonical registry's explicitly reviewed EXACT_ALIASES
  // rather than silently discarding them when producing the GRI worklist.
  // Only parse static JSON string arrays bound to known ISO3 rows; never
  // evaluate TS source or infer fuzzy/substring matches.
  const block=countryRegistrySource.match(
    /const EXACT_ALIASES[^\n]{0,200}Object\.freeze\(\{([\s\S]{100,3500}?)\}\);/u
  );
  if(!block)throw Error("MATERIAL_GRI_COUNTRY_ALIASES_REQUIRED");
  const aliasPattern=/([A-Z]{3}):(\[[^\]]{1,900}\])/gu;
  const matches=[...block[1].matchAll(aliasPattern)];
  if(matches.length<20||matches.length>70||
     block[1].replace(aliasPattern,"").replace(/[\s,]/gu,"")!=="")
    throw Error("MATERIAL_GRI_COUNTRY_ALIASES_INVALID");
  const keys=new Set();
  for(const entry of matches){
    const key=entry[1];
    if(keys.has(key)||!iso3.has(key))
      throw Error("MATERIAL_GRI_COUNTRY_ALIASES_INVALID");
    keys.add(key);
    let aliases;
    try{aliases=JSON.parse(entry[2]);}
    catch{throw Error("MATERIAL_GRI_COUNTRY_ALIASES_INVALID");}
    if(!Array.isArray(aliases)||aliases.length<1||aliases.length>12)
      throw Error("MATERIAL_GRI_COUNTRY_ALIASES_INVALID");
    for(const word of aliases){
      if(typeof word!=="string"||word.length<2||word.length>70||
         !/^[\p{L}\p{M}][\p{L}\p{M}\p{N} .,'’()\-]{1,69}$/u.test(word))
        throw Error("MATERIAL_GRI_COUNTRY_ALIASES_INVALID");
      const name=normalize(word),existing=lookup.get(name);
      if(existing&&existing!==key)
        throw Error("MATERIAL_GRI_COUNTRY_ALIAS_COLLISION");
      lookup.set(name,key);
    }
  }
  if(!keys.has("USA")||!keys.has("GBR")||!keys.has("CIV")||
     !keys.has("TUR")||!keys.has("PSE")||!keys.has("VAT"))
    throw Error("MATERIAL_GRI_COUNTRY_ALIASES_INCOMPLETE");
  if(!iso3.has("IND")||!iso3.has("USA")||!iso3.has("PSE")||
     !iso3.has("VAT")||iso3.has("TWN"))
    throw Error("MATERIAL_GRI_COUNTRY_DENOMINATOR_INVALID");
  return Object.freeze({count:195,resolve(geography){
    if(typeof geography!=="string"||geography.length>70||
       /[<>{}[\]\n\r]/u.test(geography))return null;
    return lookup.get(normalize(geography))??null;
  }});
}
const fail=()=>{throw Error("MATERIAL_GRI_UNSCORED_REVIEW_QUEUE_REQUIRED")};
export function buildMaterialGriCountryEvidenceWorklist(queue,registrySource,now=Date.now()){
  if(!Number.isFinite(now)||
     queue?.schema!=="geomacro.material-original-gri-review-queue.v1"||
     queue.retention_hours!==72||queue.destination!=="PRIVATE_GRI_EVIDENCE_REVIEW_ONLY"||
     queue.any_scored_risk!==false||queue.writes_to_gri!==0||
     queue.customer_chargeable!==false||queue.payments!==0||
     !Array.isArray(queue.categories)||queue.categories.length!==3||
     queue.categories.some((row,i)=>row?.category!==THREE_DOMAINS[i]||
       !Array.isArray(row.candidates)||row.candidates.length>25||
       row.candidates_count!==row.candidates.length)||queue.gri_promotion_status!==
       "BLOCKED_PENDING_INDEPENDENT_EVIDENCE_RIGHTS_AND_SIGNED_CERTIFICATION")
    fail();
  const generated=Date.parse(queue.generated_at);
  if(!Number.isFinite(generated)||generated>now+60_000||now-generated>15*60_000)fail();
  const country=canonicalMaterialGriCountryLookup(registrySource);
  const ids=new Set();
  const categories=queue.categories.map(row=>{
    const worklist=row.candidates.map(candidate=>{
      if(candidate?.schema!=="geomacro.material-gri-original-review-candidate.v1"||
         candidate.category!==row.category||
         !ID.test(candidate.derived_event_id)||ids.has(candidate.derived_event_id)||
         !KINDS.has(candidate.event_kind)||candidate.evidence_class!==
         "SINGLE_OFFICIAL_RELEASE_OBSERVED_UNSCORED"||
         candidate.independent_originals_verified!==false||
         candidate.article_use_rights_verified!==false||
         candidate.materiality_or_impact_verified!==false||
         candidate.gri_risk_score!==null||
         candidate.gri_scoring_authorized!==false||
         candidate.risk_indices_update_authorized!==false||
         candidate.customer_delivery_authorized!==false)
        fail();
      const at=candidate.original_published_at;
      const exact=candidate.original_date_precision==="exact"&&UTC.test(at);
      const day=candidate.original_date_precision==="day"&&CAL_DAY.test(at);
      const published=Date.parse(at);
      if((!exact&&!day)||!Number.isFinite(published)||
         published>now||now-published>72*3600_000)fail();
      ids.add(candidate.derived_event_id);
      const iso=country.resolve(candidate.geography);
      // A 6-hour factual candidate is only a CHECK target, never evidence
      // of commercial rights, independent originals or current score.
      const elapsed=now-published;
      const mayCheckOriginal=exact&&elapsed<=6*3600_000&&
        elapsed>=15*60_000;
      // The canonical signed GRI reviewed-current acceptance only admits a
      // NEW native original no older than 90 minutes after the 15m embargo.
      // A source can remain an eligible private original recheck for six hours
      // while already being too old to independently trigger a GRI rescore.
      const inNewGriWindow=mayCheckOriginal&&elapsed<=90*60_000;
      const priority=inNewGriWindow?
        (iso?"IMMEDIATE_NATIVE_GRI_REVIEW":"URGENT_COUNTRY_RESOLUTION"):
        mayCheckOriginal?
        (iso?"SOURCE_RECHECK_ONLY":"COUNTRY_RESOLUTION_FOR_RECHECK"):
        "HISTORICAL_REVIEW_ONLY";
      const nextAction=!iso?
        "RESOLVE_ISO3_ONLY_FROM_EXACT_FIRST_PARTY_ORIGINAL":
        inNewGriWindow?
        "REVERIFY_NATIVE_BYTES_RIGHTS_AND_INDEPENDENT_SIGNED_CERTIFICATION":
        mayCheckOriginal?
        "SOURCE_RECHECK_ALLOWED_BUT_NEW_90M_GRI_EVENT_REQUIRED":
        "AWAIT_NEW_NATIVE_PUBLISHED_ORIGINAL_FOR_CURRENT_GRI";
      return Object.freeze({
        derived_event_id:candidate.derived_event_id,
        category:row.category,event_kind:candidate.event_kind,
        country_iso3:iso,
        original_published_at:at,
        original_date_precision:candidate.original_date_precision,
        first_party_original_reread_required:true,
        source_native_timestamp_reverification_required:true,
        independent_origin_and_same_event_review_required:true,
        country_category_certification_required:true,
        source_commercial_use_review_required:true,
        reviewed_canonical_gri_event_required:true,
        materiality_or_impact_verified:false,
        candidate_within_6h_recheck_window:mayCheckOriginal,
        candidate_within_90m_new_gri_window:inNewGriWindow,
        materiality_review_priority:priority,
        next_safe_review_action:nextAction,
        // Windows route a reviewer. No score, rights, signer or commercial
        // certification can be derived from window presence alone.
        can_promote_from_worklist:false,
        gri_score:null,
        signed_gri_input_available:false,
        public_gri_promotion_authorized:false,
        status:iso?"COUNTRY_MAPPED_REVIEW_REQUIRED":"GEOGRAPHY_UNRESOLVED_REVIEW_REQUIRED",
      });
    });
    // Do not drop historical records: retain all 72h for research while
    // routing the 90-minute CURRENT qualification window first.
    const ranked=worklist.sort((a,b)=>
      Number(b.candidate_within_90m_new_gri_window)-
        Number(a.candidate_within_90m_new_gri_window) ||
      Number(b.candidate_within_6h_recheck_window)-
        Number(a.candidate_within_6h_recheck_window) ||
      b.original_published_at.localeCompare(a.original_published_at) ||
      a.derived_event_id.localeCompare(b.derived_event_id));
    return Object.freeze({category:row.category,review_targets:ranked,
      country_mapped:ranked.filter(x=>x.country_iso3!==null).length,
      geography_unresolved:ranked.filter(x=>x.country_iso3===null).length,
      within_6h_original_recheck_window:ranked.filter(x=>x.candidate_within_6h_recheck_window).length,
      within_90m_new_gri_window:ranked.filter(x=>x.candidate_within_90m_new_gri_window).length,
      within_90m_and_country_mapped:ranked.filter(x=>
        x.candidate_within_90m_new_gri_window&&x.country_iso3!==null).length,
      historical_review_only:ranked.filter(x=>
        x.materiality_review_priority==="HISTORICAL_REVIEW_ONLY").length,
    });
  });
  const worklist={
    schema:"geomacro.material-gri-country-evidence-worklist.v1",
    generated_at:new Date(now).toISOString(),
    canonical_country_registry_count:country.count,
    source_queue_schema:queue.schema,
    source_queue_generated_at:queue.generated_at,
    source_queue_sha256:createHash("sha256").update(JSON.stringify(queue)).digest("hex"),
    categories,
    // Only the protected signed GRI workflow may promote an independently
    // attested B2 reviewed input + country certifications + historical anchor.
    next_authorized_processor:"gri-v12-supabase-free-reviewed-current.yml",
    required_ready_event:"gri_reviewed_current_ready",
    trigger_only_after_verified_signed_inputs:true,
    promotion_status:"WAITING_FOR_SEPARATELY_SIGNED_THREE_DOMAIN_GRI_INPUTS",
    current_native_original_90m_review_targets:categories.reduce((n,c)=>
      n+c.within_90m_new_gri_window,0),
    current_native_original_90m_country_mapped_targets:categories.reduce((n,c)=>
      n+c.within_90m_and_country_mapped,0),
    real_signed_gri_scoring_permission_inferred:false,
    numerical_gri_recomputed:false,
    signed_gri_or_country_certificate_created:false,
    public_gri_or_indices_written:false,
    original_content_or_urls_included:false,
    supabase_writes:0,b2_writes:0,d1_writes:0,payments:0,
  };
  return Object.freeze(worklist);
}
