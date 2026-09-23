function keyFor(row){
  const raw=row?.raw ?? row;
  return [
    String(raw.country_iso3 ?? "").toUpperCase(),
    String(raw.mineral ?? "").trim().toLowerCase(),
    String(raw.year ?? raw.period ?? "")
  ].join("|");
}

export function reconcileMineralEvidence({production=[],trade=[]}={}){
  const productionByKey=new Map();
  for(const row of production){
    const key=keyFor(row);
    if(!productionByKey.has(key)) productionByKey.set(key,[]);
    productionByKey.get(key).push(row);
  }

  const tradeByKey=new Map();
  for(const row of trade){
    const raw=row?.raw ?? row;
    const evidence=raw.evidence_type;
    if(!["TRADE_EXPORT","TRADE_IMPORT","TRADE_BALANCE"].includes(evidence)) continue;
    const key=keyFor(row);
    if(!tradeByKey.has(key)) tradeByKey.set(key,[]);
    tradeByKey.get(key).push(row);
  }

  const keys=new Set([...productionByKey.keys(),...tradeByKey.keys()]);
  return [...keys].map(key=>{
    const p=productionByKey.get(key) ?? [];
    const t=tradeByKey.get(key) ?? [];
    if(!p.length) return {key,status:"TRADE_ONLY",production:[],trade:t};
    if(!t.length) return {key,status:"PRODUCTION_ONLY",production:p,trade:[]};

    const productionTypes=new Set(p.map(x=>x.raw?.unit ?? x.raw?.evidence_type));
    const tradeTypes=new Set(t.map(x=>x.raw?.evidence_type));
    const sameScope=[...productionTypes].some(unit=>t.some(x=>x.raw?.unit===unit));
    return {
      key,
      status:sameScope ? "ALIGNED_SCOPE" : "INSUFFICIENT_SCOPE",
      production:p,
      trade:t,
      evidence_types:{production:[...productionTypes],trade:[...tradeTypes]},
      note:"Production and trade are separate evidence types. This layer does not convert exports/imports into production or silently average unlike measures."
    };
  });
}
