/** Reuse three malformed, redundant index searches; never add a network slot. */
export const LAUNCH_PRIORITY_WATCHES=Object.freeze([
 {id:'private_repo_4688ad23c9b59eb5b42e',lane:'wars_security',terms:'(war OR ceasefire OR "missile strike" OR "airspace closure" OR sanctions OR "cyber attack" OR "internet shutdown" OR coup OR election OR displacement)'},
 {id:'private_repo_c1d816902275558c19c8',lane:'macro_corridors',terms:'(shipping OR chokepoint OR "border closure" OR "port strike" OR freight OR pipeline OR "payment outage" OR "capital controls" OR "war risk premium" OR "central bank" OR inflation OR "debt default" OR "grid outage")'},
 {id:'private_repo_fb1be770eb7ef866a3b8',lane:'minerals_supply',terms:'("critical minerals" OR "rare earth" OR lithium OR copper OR graphite OR cobalt OR nickel OR gallium OR germanium OR antimony OR tungsten OR neodymium OR "mining permit" OR "smelter outage" OR "mineral export ban")'},
]);
export function launchPriorityWatchSources(sources){
 const watches=new Map(LAUNCH_PRIORITY_WATCHES.map(w=>[w.id,w]));
 const priority=[],rest=[];
 for(const source of sources){
  const watch=watches.get(source.id);
  if(!watch){rest.push(source);continue}
  const url=new URL(source.url);
  if(url.origin!=='https://news.google.com'||url.pathname!=='/rss/search'||url.username||url.password)
   throw Error('LAUNCH_WATCH_PINNED_INDEX_DRIFT');
  url.searchParams.set('q',watch.terms+' when:1d');
  url.searchParams.set('hl','en-US');url.searchParams.set('gl','US');url.searchParams.set('ceid','US:en');
  priority.push({...source,url:url.toString(),continent:'global',launch_watch:watch.lane,
   private_discovery_index_only:true,index_timestamp_not_original_page_clock:true,
   publisher_country_iso3:null,transport_verified_at_registration:false,
   commercial_eligible:false,publicly_deliverable:false});
 }
 const result=[...priority,...rest];
 if(result.length!==sources.length||new Set(result.map(s=>s.url)).size!==sources.length)
  throw Error('LAUNCH_WATCH_SOURCE_BUDGET_OR_DUPLICATE');
 return result;
}
