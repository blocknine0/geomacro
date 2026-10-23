/**
 * GDELT 2.0 official 15-minute published batch manifest.
 *
 * Public free/commercial GDELT dataset license is already separately reviewed
 * in scripts/commercial-source-rights-evidence.mjs (gdelt_v2_events).
 * This is a batch DISCOVERY clock, NOT the native time of any news article.
 * Do not GET any of the manifest's ZIP links, including its plain HTTP URLs.
 */
export const GDELT_PUBLIC_BATCH_MANIFEST=
  "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
const KINDS=["export.CSV","mentions.CSV","gkg.csv"];
function date14(value){
 if(!/^20\d{12}$/u.test(value))return null;
 const iso=value.slice(0,4)+"-"+value.slice(4,6)+"-"+value.slice(6,8)+
   "T"+value.slice(8,10)+":"+value.slice(10,12)+":"+value.slice(12,14)+"Z";
 const ms=Date.parse(iso);
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)+"Z"!==iso)return null;
 if(Number(value.slice(10,12))%15!==0||value.slice(12,14)!=="00")return null;
 return iso;
}
export function parseGdeltBatchManifest(raw,{now=new Date()}={}){
 if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")>4096||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))return null;
 const lines=raw.trim().split(/\r?\n/u);
 if(lines.length!==3)return null;
 const rows=new Map(),clocks=new Set();
 for(const line of lines){
   const m=/^(\d{1,10}) ([a-f0-9]{32}) (http:\/\/data\.gdeltproject\.org\/gdeltv2\/(20\d{12})\.(export\.CSV|mentions\.CSV|gkg\.csv)\.zip)$/u.exec(line);
   if(!m)return null;
   const size=Number(m[1]),batchAt=date14(m[4]),kind=m[5];
   if(!Number.isSafeInteger(size)||size<100||size>100_000_000||
     !batchAt||rows.has(kind))return null;
   clocks.add(batchAt);rows.set(kind,{size,hash:m[2]});
 }
 if(rows.size!==3||clocks.size!==1||KINDS.some(x=>!rows.has(x)))return null;
 const batchAt=[...clocks][0],age=now.getTime()-Date.parse(batchAt);
 // Network clock/skew and stale upstream batches must not be claimed current.
 const timely=age>=-5*60_000&&age<=90*60_000;
 // Do not emit source ZIP URLs, MD5 hashes or article text.
 const hashInput=KINDS.map(x=>rows.get(x).hash).join("|")+"|"+batchAt;
 return Object.freeze({
   schema:"geomacro.gdelt-free-batch-index.v1",
   upstream_batch_at:batchAt,
   current_batch_within_90m:timely,
   age_minutes:Math.floor(age/60000),
   internal_batch_identity:hashInput,
   kind_count:rows.size,
   clock_semantics:"DATASET_BATCH_NOT_ORIGINAL_EVENT_TIME",
   original_article_published_at_verified:false,
   individual_news_event_verified:false,
   cross_publisher_corroboration_verified:false,
   country_195x3_certified:false,
   source_rights_inherited_from_linked_news:false,
   signed_commercial_data_verified:false,
   chargeable:false,
 });
}
