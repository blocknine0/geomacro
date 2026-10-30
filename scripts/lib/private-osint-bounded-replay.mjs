/** Minimal additional D1 cost for recovering a held 25h AES-GCM batch.
 * Ingest no more than five actual native-dated observations per admitted
 * research cycle; never treat a partially recovered artifact as fully read
 * back or delete it. Uses existing private D1 bundled writer and receipts.
 */
const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
export const MINIMUM_BUNDLED_REPLAY_MAX_ITEMS=5;
export function selectBoundedPrivateOsintReplay(planned,{
 now=Date.now(),maxItems=MINIMUM_BUNDLED_REPLAY_MAX_ITEMS,
}={}){
 if(!planned||!Array.isArray(planned.items)||
    !Number.isFinite(now)||!Number.isSafeInteger(maxItems)||
    maxItems<1||maxItems>MINIMUM_BUNDLED_REPLAY_MAX_ITEMS||
    planned.items.some(x=>!x||typeof x.id!=="string"||
      !CATEGORIES.includes(x.category)))
  throw Error("OSINT_MINIMUM_BUNDLED_REPLAY_INVALID");
 const slot=Math.floor(now/900000);
 const groups=CATEGORIES.map(category=>{
  const items=planned.items.filter(item=>item.category===category)
    .sort((a,b)=>a.id.localeCompare(b.id));
  if(!items.length)return items;
  const offset=(slot*2)%items.length;
  return [...items.slice(offset),...items.slice(0,offset)];
 });
 const selected=[],positions=[0,0,0];
 while(selected.length<maxItems&&groups.some((g,i)=>positions[i]<g.length))
  for(let i=0;i<3&&selected.length<maxItems;i++){
   const row=groups[i][positions[i]++];
   if(row)selected.push(row);
  }
 return Object.freeze({items:Object.freeze(selected),
  eligible_total:planned.items.length,
  eligible_selected:selected.length,
  eligible_deferred:planned.items.length-selected.length,
  all_eligible_selected:selected.length===planned.items.length,
  encrypted_artifact_can_be_deleted_on_partial:false,
  category_counts:Object.freeze(Object.fromEntries(CATEGORIES.map((c,i)=>[
   c,selected.filter(x=>x.category===c).length
  ]))),
  source_fetches:0,no_original_clock_extension:true,
  commercial_rights_granted:false});
}
