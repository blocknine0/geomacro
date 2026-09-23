function rawOf(row){ return row?.raw ?? row ?? {}; }

function normalizeCountry(row){
  const raw=rawOf(row);
  return String(raw.country_iso3 ?? raw.iso3 ?? raw.country ?? "").trim().toUpperCase();
}

function normalizeCommodity(row){
  const raw=rawOf(row);
  return String(raw.mineral ?? raw.commodity ?? raw.material ?? "").trim().toLowerCase();
}

function normalizePeriod(row){
  const raw=rawOf(row);
  return String(raw.year ?? raw.period ?? raw.observation_year ?? "").trim();
}

function keyFor(row){
  return [normalizeCountry(row),normalizeCommodity(row),normalizePeriod(row)].join("|");
}

function evidenceType(row){
  return String(rawOf(row).evidence_type ?? rawOf(row).type ?? "").toUpperCase();
}

function sourceId(row){
  const raw=rawOf(row);
  return String(raw.source_id ?? row?.source_id ?? "unknown");
}

function unit(row){
  return String(rawOf(row).unit ?? rawOf(row).unit_of_measure ?? "").trim().toLowerCase();
}

function independentSources(rows){
  return [...new Set(rows.map(sourceId).filter(Boolean))];
}

function group(rows){
  const map=new Map();
  for(const row of rows){
    const key=keyFor(row);
    if(!map.has(key)) map.set(key,[]);
    map.get(key).push(row);
  }
  return map;
}

export function reconcileMineralEvidence({
  production=[],
  trade=[],
  historical=[],
  disruptions=[],
  now=new Date()
}={}){
  const all=[...production,...trade,...historical,...disruptions];
  const grouped=group(all);
  return [...grouped.entries()].map(([key,rows])=>{
    const types={};
    for(const row of rows){
      const type=evidenceType(row) || "UNKNOWN";
      (types[type] ??= []).push(row);
    }

    const prod=types.PRODUCTION ?? [];
    const exports=types.TRADE_EXPORT ?? [];
    const imports=types.TRADE_IMPORT ?? [];
    const balances=types.TRADE_BALANCE ?? [];
    const disruption=[...(types.DISRUPTION ?? []),...(types.POLICY ?? []),...(types.EARLY_SIGNAL ?? [])];
    const sources=independentSources(rows);

    const units=[...new Set(prod.map(unit).filter(Boolean))];
    const comparableProduction=units.length === 1 && prod.length > 0;
    const productionAgreement={
      independent_source_count:independentSources(prod).length,
      status: independentSources(prod).length >= 2 ? "CROSS_SOURCE_SUPPORTED" :
        prod.length ? "SINGLE_SOURCE" : "NO_PRODUCTION"
    };

    const conflict=[];
    if(units.length>1) conflict.push({type:"UNIT_CONFLICT",units});
    if(prod.length>1 && independentSources(prod).length>=2){
      const numeric=prod.map(r=>Number(rawOf(r).value)).filter(Number.isFinite);
      if(numeric.length>=2){
        const min=Math.min(...numeric),max=Math.max(...numeric);
        if(min!==0 && max/min >= 2) conflict.push({type:"PRODUCTION_MAGNITUDE_CONFLICT",min,max,ratio:max/min});
      }
    }

    const freshness=rows.map(row=>{
      const raw=rawOf(row);
      const stamp=raw.observed_at ?? raw.published_at ?? raw.fetched_at ?? raw.year;
      const date=stamp ? new Date(stamp) : null;
      return {
        source_id:sourceId(row),
        timestamp:stamp ?? null,
        age_days:date && !Number.isNaN(date.getTime()) ? Math.max(0,(now-date)/86400000) : null
      };
    });

    let status="INSUFFICIENT_SCOPE";
    if(prod.length && (exports.length||imports.length||balances.length)) status="PRODUCTION_AND_TRADE";
    else if(prod.length) status="PRODUCTION_ONLY";
    else if(exports.length||imports.length||balances.length) status="TRADE_ONLY";
    else if(disruption.length) status="DISRUPTION_ONLY";
    else if(rows.length) status="HISTORICAL_OR_OTHER";

    return {
      key,
      country_iso3:normalizeCountry(rows[0]),
      commodity:normalizeCommodity(rows[0]),
      period:normalizePeriod(rows[0]),
      status,
      source_count:sources.length,
      independent_sources:sources,
      evidence_types:Object.fromEntries(Object.entries(types).map(([k,v])=>[k,v.length])),
      production_agreement:productionAgreement,
      comparable_production_scope:comparableProduction,
      conflicts:conflict,
      freshness,
      trade_is_not_production:true,
      historical_is_context_only:true,
      note:"Production, trade, disruption/policy and historical context remain separate claims. No source is silently averaged or promoted because it is newer."
    };
  });
}
