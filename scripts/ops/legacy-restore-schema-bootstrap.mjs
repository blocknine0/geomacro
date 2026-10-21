// Strictly local, non-privileged bootstrap plan for a DISPOSABLE PG17 database.
// No SQL from upstream error messages, no private object identifiers in receipts.
const ALLOWED = Object.freeze(new Set([
  "public","auth","storage","extensions","vault","graphql",
  "graphql_public","pgbouncer","realtime","supabase_migrations",
]));
export function archiveDefinesSchema(toc,name) {
 if(!ALLOWED.has(name))return false;
 return String(toc??"").split(/\r?\n/u).some(line=>{
  const match=/^\s*\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+([a-z_]+)(?:\s|$)/u.exec(line);
  return match?.[1]===name;
 });
}
export function privateMissingSchema(stderr,toc,already=[]) {
 const text=String(stderr??"");
 const first=/\bERROR:\s+([^\r\n]+)/u.exec(text)?.[1]??"";
 const match=/^schema\s+"([a-z_]+)"\s+does not exist\b/iu.exec(first);
 const name=match?.[1]?.toLowerCase();
 if(!name||!ALLOWED.has(name)||
  archiveDefinesSchema(toc,name)||
  already.includes(name))return null;
 return name;
}
export function safeSchemaList(list) {
 if(!Array.isArray(list)||list.length>10||list.some(x=>!ALLOWED.has(x))||
    new Set(list).size!==list.length)throw Error("RESTORE_SCHEMA_BOOTSTRAP_NOT_ALLOWED");
 return list.slice();
}
