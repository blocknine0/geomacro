/**
 * D1-native read offload, no new provider:
 * one bounded journal scan per *authorized publisher EMPTY sweep*, then
 * public page reads fetch one materialized row (+ one revision meta row).
 *
 * A monotone data_revision increment is in the same D1.batch as each ingest.
 * The sweep performs a compare-and-swap-style revision commit in a single
 * D1.batch with all pages. Any overlapping writer invalidates all old pages.
 * Protected origin/readback NEVER consults this cache.
 */
export const MATERIALIZED_PUBLIC_PAGES_SCHEMA="geomacro.public-derived-page-materialized.v1";
export const MATERIALIZED_PUBLIC_PAGES_TTL_MS=10*60_000;
const OFFSETS=[0,250,500];
const PAGE_SIZE=250;
const MAX_PAGE_BYTES=1_650_000;
const MAX_JOURNAL_ROWS=600;
const UTF8=new TextEncoder();

const rowShape=row=>row&&typeof row.story_json==="string"&&
  row.story_json.length>=100&&row.story_json.length<=4096&&
  typeof row.first_seen_at==="string"&&row.first_seen_at.length<=40;

export function invalidateMaterializedNewsStatement(env){
  // This statement is appended *inside* the exact ingestion D1.batch,
  // never after it; no partially stale materialization may be served.
  return env.DB.prepare("UPDATE website_derived_materialized_meta_v1 SET data_revision=data_revision+1 WHERE id=1");
}

export async function refreshMaterializedNewsPages(env,now=Date.now()){
  if(!Number.isFinite(now))throw Error("MATERIALIZED_CLOCK_INVALID");
  const metadata=await env.DB.prepare(
    "SELECT data_revision FROM website_derived_materialized_meta_v1 WHERE id=1"
  ).first();
  if(!Number.isSafeInteger(metadata?.data_revision)||metadata.data_revision<0)
    throw Error("MATERIALIZED_REVISION_MISSING");
  const {results}=await env.DB.prepare(
    "SELECT story_json,first_seen_at FROM website_derived_intelligence "+
    "WHERE published_at>=? AND first_seen_at>=? "+
    "ORDER BY published_at DESC,id DESC LIMIT 601"
  ).bind(
    new Date(now-72*60*60_000).toISOString().slice(0,10),
    new Date(now-72*60*60_000).toISOString()
  ).all();
  if(!Array.isArray(results)||results.length>MAX_JOURNAL_ROWS||
     results.some(r=>!rowShape(r)))
    throw Error("MATERIALIZED_JOURNAL_OVER_CAP_OR_INVALID");
  const producedAt=new Date(now).toISOString();
  const statements=OFFSETS.map(offset=>{
    // +1 ensures has_more and next_offset are identical to canonical page SQL.
    const rows=results.slice(offset,offset+PAGE_SIZE+1);
    const raw=JSON.stringify(rows);
    if(UTF8.encode(raw).byteLength>MAX_PAGE_BYTES)
      throw Error("MATERIALIZED_PAGE_TOO_LARGE");
    return env.DB.prepare(
      "INSERT INTO website_derived_materialized_pages_v1 "+
      "(page_offset,data_revision,generated_at,rows_json) VALUES (?,?,?,?) "+
      "ON CONFLICT(page_offset) DO UPDATE SET "+
      "data_revision=excluded.data_revision,generated_at=excluded.generated_at,"+
      "rows_json=excluded.rows_json"
    ).bind(offset,metadata.data_revision,producedAt,raw);
  });
  // Atomic publication. The last update cannot authorize stale pages if an
  // overlapping news INSERT bumped the data_revision since our first SELECT.
  statements.push(env.DB.prepare(
    "UPDATE website_derived_materialized_meta_v1 "+
    "SET snapshot_revision=data_revision WHERE id=1 AND data_revision=?"
  ).bind(metadata.data_revision));
  const receipt=await env.DB.batch(statements);
  if(!Array.isArray(receipt)||receipt.some(x=>x?.success===false))
    throw Error("MATERIALIZED_ATOMIC_PUBLISH_FAILED");
  // No extra D1 origin readback required: later requests only use the
  // revision-joined materialization; an overlap returns NULL and falls back.
  return {status:"MATERIALIZED_COMMIT_SUBMITTED",pages:3,
    canonical_rows:results.length,producer_read_queries:2,
    snapshot_is_disposable:true};
}

export async function getMaterializedNewsPage(env,offset,now=Date.now()){
  if(!env?.DB||!OFFSETS.includes(offset)||!Number.isFinite(now))return null;
  try{
    const row=await env.DB.prepare(
      "SELECT p.rows_json,p.generated_at FROM website_derived_materialized_pages_v1 p "+
      "JOIN website_derived_materialized_meta_v1 m ON m.id=1 "+
      "WHERE p.page_offset=? AND p.data_revision=m.data_revision "+
      "AND m.snapshot_revision=m.data_revision"
    ).bind(offset).first();
    if(!row)return null;
    const age=now-Date.parse(row.generated_at);
    if(!Number.isFinite(age)||age< -15_000||age>MATERIALIZED_PUBLIC_PAGES_TTL_MS||
       typeof row.rows_json!=="string"||
       UTF8.encode(row.rows_json).byteLength>MAX_PAGE_BYTES)return null;
    const rows=JSON.parse(row.rows_json);
    if(!Array.isArray(rows)||rows.length>PAGE_SIZE+1||
       rows.some(r=>!rowShape(r)))return null;
    return rows;
  }catch{ return null; } // missing migration or invalid record -> honest D1 origin
}
export async function getMaterializedNewsBundle(env,now=Date.now()){
  // One row/page, three fixed pages. Source-clock and 600-row cap are
  // re-evaluated by canonical bundle projector on every request.
  const rows=[];
  for(const offset of OFFSETS){
    const page=await getMaterializedNewsPage(env,offset,now);
    if(!page)return null;
    const available=page.slice(0,PAGE_SIZE);
    rows.push(...available);
    if(page.length<=PAGE_SIZE)break;
  }
  return rows.length<=MAX_JOURNAL_ROWS?rows:null;
}
