/**
 * Generic public PostgREST proxy query hardening.
 *
 * Even a recursive JSON redactor fails if the caller asks PostgREST to
 * rename source_name -> non-source-looking alias, or requests CSV instead
 * of JSON. These pure guards reject alias expressions and any filter
 * on private source fields before an outbound provider read is made.
 */
export function plainPublicProjection(select:string|null):boolean{
  return select===null || /^[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*$/u.test(select);
}
export function hasPrivateSourceQueryFilter(search:URLSearchParams):boolean{
  for(const key of search.keys()){
    if(/(?:^|[._])(?:source|publisher|provider|licen[cs]e|provenance)(?:_|$)/iu.test(key) ||
       /(?:^|[._])raw_(?:content|payload|text|html|article)(?:_|$)/iu.test(key) ||
       key==="or"||key==="and")return true;
  }
  return false;
}
export function safePostgrestAccept(header:string|null):string{
  // Preserve the exact vendor JSON type used by PostgREST maybeSingle(),
  // rejecting CSV, NDJSON, XML and other unredacted streaming formats.
  return header==="application/vnd.pgrst.object+json"?
    "application/vnd.pgrst.object+json":"application/json";
}
