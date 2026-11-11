/**
 * Isolated shadow-only source FK integrity. Unverified index URLs must be
 * catalogued as DISABLED / RIGHTS_UNAPPROVED so the D1 foreign key exists.
 * This is NOT a license, publisher approval, or machine attestation.
 */
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const DOMAIN=/^[a-z0-9.-]{3,253}$/u;
const ROLES=new Set(["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL",
  "OFFICIAL_STATISTICS","MARKET_PRICE","TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]);
export async function registerUntrustedShadowIndexSources(db,items,{now=new Date()}={}){
 if(!db?.prepare||!db?.batch||!Array.isArray(items)||items.length>10)
  throw Error("SHADOW_INDEX_SOURCE_BATCH_INVALID");
 const sources=new Map();
 for(const e of items){
  if(e?.kind!=="INDEX_ONLY")continue; // originals require independently approved registry
  const id=e.source_id,domain=e.publisher_root_domain,parent=e.parent_media_entity,
    role=e.source_role;
  if(e.schema!=="geomacro.risk-stream-candidate.v1"||!SOURCE.test(id??"")||
     !DOMAIN.test(domain??"")||typeof parent!=="string"||
     !/^[a-z0-9_.:-]{3,100}$/u.test(parent)||!ROLES.has(role))
   throw Error("SHADOW_INDEX_SOURCE_METADATA_INVALID");
  const current={id,domain,parent,role};
  const prior=sources.get(id);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(current))
   throw Error("SHADOW_INDEX_SOURCE_ID_COLLISION");
  sources.set(id,current);
 }
 if(sources.size===0)return {untrusted_source_registry_count:0,
  rights_approved_by_registration:false};
 const rows=[...sources.values()];
 const stamp=now.toISOString();
 const placeholders=rows.map(()=>" (?,?,?,?,0,0,?,NULL)").join(",");
 const values=rows.flatMap(e=>[e.id,e.domain,e.parent,e.role,stamp]);
 if(values.length>100)throw Error("SHADOW_D1_BIND_LIMIT_EXCEEDED");
 const statement=db.prepare("INSERT OR IGNORE INTO risk_stream_sources "+
   "(source_id,publisher_root_domain,parent_media_entity,source_role,"+
   "commercial_rights_approved,enabled,reviewed_at,rights_expire_at) VALUES"+
   placeholders).bind(...values);
 const result=await db.batch([statement]);
 if(!Array.isArray(result)||result.length!==1||result[0]?.success===false)
  throw Error("SHADOW_INDEX_SOURCE_ADMISSION_UNVERIFIED");
 const read=await db.prepare("SELECT source_id,publisher_root_domain,"+
   "parent_media_entity,source_role,commercial_rights_approved,enabled "+
   "FROM risk_stream_sources WHERE source_id IN (SELECT value FROM json_each(?))")
  .bind(JSON.stringify(rows.map(x=>x.id))).all();
 const actual=new Map((read?.results??[]).map(x=>[x.source_id,x]));
 for(const e of rows){
  const r=actual.get(e.id);
  if(!r||r.publisher_root_domain!==e.domain||
     r.parent_media_entity!==e.parent||r.source_role!==e.role)
   throw Error("SHADOW_INDEX_SOURCE_READBACK_MISMATCH");
  // A pre-existing *genuinely approved* source is not demoted, but never
  // become approved merely because an unsigned hint referred to its domain.
  if(![0,1].includes(r.commercial_rights_approved)||![0,1].includes(r.enabled))
   throw Error("SHADOW_INDEX_SOURCE_FLAGS_INVALID");
 }
 return {untrusted_source_registry_count:rows.length,
  rights_approved_by_registration:false};
}
