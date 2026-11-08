/**
 * Live, D1-only Hot50 evidence deficit lookup. Source feeds are already
 * ingested into progressive_risk_gate_cell_state and gro_evidence.
 *
 * They are discovery metadata / draft GRO evidence, NOT proof of current
 * source rights, physical B2 readback or a valid signed paid risk score.
 * Never map legacy rare_earth directly into all trade/supply-chain risk.
 * A signed B2-backed commercial snapshot may be published only by the
 * independently verified evidence qualification/snapshot publisher.
 */
import {RISK_GATE_HOT50} from './risk-gate-hot50-scope.mjs';
const iso=n=>new Date(n).toISOString();
const COUNTRY_SET=new Set(RISK_GATE_HOT50);
const LIVE=['geopolitics','macro_financial','trade_minerals_supplychain'];
const RAW_LANE=Object.freeze({geopolitics:'geopolitics',macro:'macro_financial',
 rare_earth:'trade_minerals_supplychain'});
const FLAGS=Object.freeze({lookback_hours:72,report_type:'SOURCE_METADATA_ONLY',
 signed_paid_score_authorized:false,source_rights_verified:false,
 physical_b2_readback_verified:false,
 legacy_rare_earth_not_a_complete_trade_and_supply_chain_domain:true,
 no_credit_burn:true});
const HOT_COUNTRIES=RISK_GATE_HOT50.map(()=>'?').join(',');
/** Returns only aggregates, not source identities or private publisher URLs. */
export async function readHot50LiveEvidenceDeficit(env,now=Date.now()){
 const cutoff=iso(now-72*3600000),ceiling=iso(now);
 if(!env?.DB?.prepare)return {...FLAGS,status:'INSUFFICIENT_EVIDENCE',
  source_d1_query_available:false};
 try{
  const [facts,gro]=await Promise.all([
   env.DB.prepare(`SELECT country_iso3,category,
      COUNT(*) corroborated_event_count,
      MAX(event_clock) last_event_clock
     FROM progressive_risk_gate_cell_state
     WHERE country_iso3 IN (${HOT_COUNTRIES}) AND
       status='CORROBORATED' AND event_clock>=? AND event_clock<=?
     GROUP BY country_iso3,category`)
    .bind(...RISK_GATE_HOT50,cutoff,ceiling).all(),
   env.DB.prepare(`SELECT country_iso3,category,COUNT(*) verified_gro_rows
     FROM gro_evidence INDEXED BY idx_gro_evidence_verified_category
     WHERE is_gro_verified=1 AND country_iso3 IN (${HOT_COUNTRIES})
       AND original_published_at>=? AND original_published_at<=?
     GROUP BY country_iso3,category`)
    .bind(...RISK_GATE_HOT50,cutoff,ceiling).all(),
  ]);
  if(!Array.isArray(facts?.results)||!Array.isArray(gro?.results))
   throw Error('SOURCE_READBACK_INCOMPLETE');
  const observed=new Map();
  for(const r of facts.results){
   if(!COUNTRY_SET.has(r.country_iso3)||!Object.hasOwn(RAW_LANE,r.category)||
      !Number.isSafeInteger(r.corroborated_event_count)||r.corroborated_event_count<0)
    throw Error('SOURCE_CENSUS_MALFORMED');
   const k=r.country_iso3+':'+RAW_LANE[r.category];
   observed.set(k,(observed.get(k)||0)+r.corroborated_event_count);
  }
  const groObserved=new Map();
  for(const r of gro.results){
   if(!COUNTRY_SET.has(r.country_iso3)||!Object.hasOwn(RAW_LANE,r.category)||
      !Number.isSafeInteger(r.verified_gro_rows)||r.verified_gro_rows<0)
    throw Error('GRO_CENSUS_MALFORMED');
   const k=r.country_iso3+':'+RAW_LANE[r.category];
   groObserved.set(k,(groObserved.get(k)||0)+r.verified_gro_rows);
  }
  const missing=RISK_GATE_HOT50.flatMap(iso3=>LIVE.filter(category=>
    !observed.get(iso3+':'+category)||!groObserved.get(iso3+':'+category)
  ).map(category=>iso3+':'+category));
  return {...FLAGS,status:'INSUFFICIENT_EVIDENCE',
   source_d1_query_available:true,
   checked_at_utc:ceiling,source_metadata_cells:observed.size,
   gro_verified_candidate_cells:groObserved.size,
   missing_source_metadata_or_verified_gro_cells:missing.length,
   first_missing_cells:missing.slice(0,20),
   all_150_qualified_scored_cells_confirmed:false,
   upstream_live_d1_tables:['progressive_risk_gate_cell_state','gro_evidence'],
  };
 }catch{
  return {...FLAGS,status:'INSUFFICIENT_EVIDENCE',source_d1_query_available:false,
   source_readback_error:'LIVE_D1_EVIDENCE_LOOKUP_FAILED'};
 }
}
