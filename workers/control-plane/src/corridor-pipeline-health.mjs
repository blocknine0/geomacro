/** Scheduled internal-only watchdog. Never mints credits or alters source/PREDGE records. */
const stamp=t=>new Date(t).toISOString();
const SRC="SELECT MAX(t) AS t FROM ("+
 "SELECT MAX(first_seen_at) t FROM reusable_news_items UNION ALL "+
 "SELECT MAX(first_ingested_at) t FROM corridor_native_news_candidates UNION ALL "+
 "SELECT MAX(first_seen_at) t FROM corridor_official_reference_context)";
const DERIVED="SELECT MAX(created_at) AS t FROM corridor_private_derived_research";
const respond=(o,s=200)=>Response.json(o,{status:s,headers:{"Cache-Control":"private, no-store"}});
function dest(v){
 try{const u=new URL(v);return u.protocol==="https:"&&!u.port&&!u.hash&&!u.username&&
 !u.password&&u.hostname.includes(".")&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)?u.toString():null}
 catch{return null}
}
export async function corridorWatchTick(env,{now=Date.now(),fetchImpl=fetch}={}){
 if(!env?.DB?.prepare)return {ok:false,error:"CORRIDOR_WATCH_D1_UNAVAILABLE"};
 const db=env.DB,at=stamp(now);
 try{
  const [s,d,prev]=await Promise.all([
   db.prepare(SRC).first(),db.prepare(DERIVED).first(),
   db.prepare("SELECT * FROM corridor_pipeline_watchdog WHERE singleton=1").first()
  ]);
  const source=s?.t??null,derived=d?.t??null;
  const baseline=prev?Date.parse(prev.last_scan_at):now-900000;
  const sourceNew=Boolean(source&&Date.parse(source)>baseline&&Date.parse(source)<=now);
  const derivedNew=Boolean(derived&&Date.parse(derived)>baseline&&Date.parse(derived)<=now);
  const lag=derivedNew?0:sourceNew?(prev?.source_no_structured_streak??0)+1:
   (prev?.source_no_structured_streak??0);
  const idle=sourceNew?0:(prev?.no_source_streak??0)+1;
  const state=lag>=3?"STRUCTURED_LAG":idle>=3?"SOURCE_STALE":
   derivedNew?"HEALTHY":sourceNew?"PENDING":"SOURCE_IDLE";
  const alertKind=state==="STRUCTURED_LAG"||state==="SOURCE_STALE"?state:null;
  const due=alertKind&&(!prev?.last_alert_at||now-Date.parse(prev.last_alert_at)>=14400000);
  await db.prepare("INSERT INTO corridor_pipeline_watchdog VALUES(1,?,?,?,?,?,?,?) "+
   "ON CONFLICT(singleton) DO UPDATE SET last_scan_at=excluded.last_scan_at,"+
   "last_source_at=excluded.last_source_at,last_structured_at=excluded.last_structured_at,"+
   "source_no_structured_streak=excluded.source_no_structured_streak,no_source_streak=excluded.no_source_streak,"+
   "last_alert_at=excluded.last_alert_at,state=excluded.state"
  ).bind(at,source,derived,lag,idle,due?at:prev?.last_alert_at??null,state).run();
  if(due)await db.prepare("INSERT OR IGNORE INTO corridor_pipeline_alerts(alert_id,kind,created_at) VALUES(?,?,?)")
   .bind(alertKind+":"+at.slice(0,13),alertKind,at).run();
  await db.prepare("DELETE FROM corridor_pipeline_alerts WHERE created_at<?")
   .bind(stamp(now-7*86400000)).run();
  const endpoint=dest(String(env.GEOMACRO_INGEST_ALERT_WEBHOOK??""));
  let sent=0;
  if(endpoint){
   const rows=(await db.prepare("SELECT alert_id,kind,created_at FROM corridor_pipeline_alerts "+
    "WHERE delivered_at IS NULL AND attempts<12 ORDER BY created_at LIMIT 2").all())?.results??[];
   for(const r of rows){
    const claim=await db.prepare("UPDATE corridor_pipeline_alerts SET attempts=attempts+1 "+
     "WHERE alert_id=? AND delivered_at IS NULL AND attempts<12").bind(r.alert_id).run();
    if(claim.meta?.changes!==1)continue;
    try{
     const res=await fetchImpl(endpoint,{method:"POST",redirect:"manual",headers:{"content-type":"application/json"},
      body:JSON.stringify({schema:"geomacro.corridor-watch-alert.v1",id:r.alert_id,kind:r.kind,at:r.created_at}),
      signal:AbortSignal.timeout(5000)});
     if(res.status>=200&&res.status<300){
      await db.prepare("UPDATE corridor_pipeline_alerts SET delivered_at=? WHERE alert_id=? AND delivered_at IS NULL")
       .bind(at,r.alert_id).run();sent++;
     }
    }catch{}
   }
  }
  return {ok:true,schema:"geomacro.corridor-watch.v1",scanned_at:at,state,
   source_new:sourceNew,structured_new:derivedNew,source_without_structured_streak:lag,
   no_source_streak:idle,alerts_enqueued:Boolean(due),alerts_delivered:sent,
   webhook_configured:Boolean(endpoint),chargeable:false,predge_writes:0};
 }catch{return {ok:false,error:"CORRIDOR_WATCH_D1_READWRITE_FAILED"}}
}
export async function corridorWatchRead(env){
 if(!env?.DB?.prepare)return respond({ok:false,error:"D1_UNAVAILABLE"},503);
 try{
  const state=await env.DB.prepare("SELECT * FROM corridor_pipeline_watchdog WHERE singleton=1").first();
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM corridor_pipeline_alerts WHERE delivered_at IS NULL").first();
  return respond({ok:true,state:state??null,pending_alerts:count?.n??0,chargeable:false});
 }catch{return respond({ok:false,error:"D1_UNAVAILABLE"},503)}
}
