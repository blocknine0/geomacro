/**
 * Separate D1-only baseline/changes for first-party Atom entries where
 * original publication is UNKNOWN. No "fresh articles" counter, no signing.
 * New since prior POLL means changed feed membership, not original publication.
 */
const MAX_HISTORY=240,MAX_CURRENT=128,TTL=7*86400000;
const SHA=/^[a-f0-9]{64}$/u;
const SOURCES={
  geopolitics:new Set(["uk_fcdo_original_foreign_policy_atom_review"]),
  macro:new Set(["statcan_prices_original_atom_review"]),
  rare_earth:new Set([
    "nrcan_government_news_original_atom_review",
    "uk_dbt_critical_minerals_atom_pending_review",
  ]),
};
const parsed=(value)=>{
  if(typeof value!=="string"||
     !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value))
    return NaN;
  return Date.parse(value);
};
export function reconcileUndatedPrivateFeedObservations({
  domain,checkedAt,observations=[],previousHistory,
}={}) {
  const ms=parsed(checkedAt);
  if(!SOURCES[domain]||!Number.isFinite(ms)||
     !Array.isArray(observations)||observations.length>MAX_CURRENT||
     (previousHistory!==undefined&&(!Array.isArray(previousHistory)||
       previousHistory.length>MAX_HISTORY)))
    throw Error("UNDATED_PULSE_HISTORY_INVALID");
  const history=new Map();
  for(const prev of previousHistory??[]) {
    if(!prev||prev.domain!==domain||!SHA.test(prev.sha256??"")||
       !SOURCES[domain].has(prev.source_id)||
       !Number.isFinite(parsed(prev.first_seen_at))||
       !Number.isFinite(parsed(prev.last_seen_at))||
       parsed(prev.first_seen_at)>parsed(prev.last_seen_at)||
       parsed(prev.last_seen_at)>ms||history.has(prev.sha256))
      throw Error("UNDATED_PULSE_PREVIOUS_HISTORY_UNTRUSTED");
    if(ms-parsed(prev.last_seen_at)<=TTL)history.set(prev.sha256,{...prev});
  }
  // When a new identifier strategy starts with a previously empty history,
  // do not call its pre-existing publisher backlog newly published news.
  const baseline=previousHistory===undefined || previousHistory.length===0;
  let newSinceLastPoll=0,baselineCount=0,repeated=0;
  const seenNow=new Set();
  for(const row of observations) {
    if(!row||row.schema!=="geomacro.private-undated-first-party-observation.v1"||
       row.domain!==domain||!SOURCES[domain].has(row.source_id)||
       !SHA.test(row.original_link_sha256??"")||
       !SHA.test(row.headline_sha256??"")||
       row.publication_clock_status!=="UNKNOWN"||
       !["FIRST_PARTY_LINK","OFFICIAL_ATOM_ENTRY_ID","OPAQUE_FIRST_PARTY_FEED_ENTRY"].includes(row.feed_entry_identity_kind)||
       row.original_article_path_verified!==false||
       row.original_article_content_verified!==false||
       row.article_category_relevance_verified!==false||
       row.commercial_derived_use_rights_verified!==false||
       row.eligible_for_scoring!==false||
       row.eligible_for_publication!==false||
       parsed(row.first_seen_at)!==ms)
      throw Error("UNDATED_PULSE_UNSAFE_OBSERVATION");
    const hash=row.original_link_sha256;
    if(seenNow.has(hash))continue;
    seenNow.add(hash);
    if(history.has(hash)) {
      repeated++;
      const stored=history.get(hash);
      stored.last_seen_at=checkedAt;
    } else {
      baseline?baselineCount++:newSinceLastPoll++;
      history.set(hash,{
        domain,source_id:row.source_id,sha256:hash,
        first_seen_at:checkedAt,last_seen_at:checkedAt,
      });
    }
  }
  const retained=[...history.values()]
    .sort((a,b)=>b.last_seen_at.localeCompare(a.last_seen_at)||
      a.sha256.localeCompare(b.sha256)).slice(0,MAX_HISTORY);
  return {
    schema:"geomacro.private-undated-feed-dedup.v1",
    publication_clock_verified:false,
    initial_baseline_run:baseline,
    initial_backlog_entries_baselined:baselineCount,
    new_feed_entries_since_previous_observation:newSinceLastPoll,
    existing_feed_entries_repeated:repeated,
    tracked_first_party_feed_entries:retained.length,
    recent_private_undated_feed_fingerprints:retained,
    semantic_relevance_qualified:false,
    chargeable:false,
  };
}
