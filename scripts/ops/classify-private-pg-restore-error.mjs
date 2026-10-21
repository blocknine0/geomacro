import { readFileSync } from "node:fs";

const FAILURE_TYPES = Object.freeze([
  ["MISSING_SCHEMA", /^schema\s+"?[^"\n]+"?\s+does not exist/iu],
  ["MISSING_EXTENSION", /^extension\s+"?[^"\n]+"?\s+(?:does not exist|is not available)/iu],
  ["MISSING_FUNCTION", /^function\s+[^\n]+\s+does not exist/iu],
  ["MISSING_RELATION", /^relation\s+[^\n]+\s+does not exist/iu],
  ["MISSING_TYPE", /^type\s+[^\n]+\s+does not exist/iu],
  ["MISSING_OPERATOR", /^operator\s+[^\n]+\s+does not exist/iu],
  ["MISSING_ROLE", /^role\s+[^\n]+\s+does not exist/iu],
  ["MISSING_COLUMN", /^column\s+[^\n]+\s+does not exist/iu],
  ["MISSING_CAST", /^cast\s+[^\n]+\s+does not exist/iu],
  ["MISSING_TABLESPACE", /^tablespace\s+[^\n]+\s+does not exist/iu],
  ["MISSING_OTHER_OBJECT", /does not exist/iu],
  ["DUPLICATE_OBJECT", /already exists|duplicate key value/iu],
  ["UNAVAILABLE_EXTENSION_LIBRARY", /could not open extension control file|extension .* is not available/iu],
  ["PERMISSION_PROBLEM", /permission denied|must be owner|not permitted/iu],
  ["OTHER_SQL_FAILURE", /./u],
]);

// Use FIRST actual server ERROR, never later errors from an unrelated object.
// Not even quoted object identifiers are copied into this output.
export function classifyPrivatePgRestoreLog(content) {
  const lines = String(content ?? "").split(/\r?\n/u);
  let error = null;
  for (const line of lines) {
    const match = /(?:^|\s)ERROR:\s+(.+)$/u.exec(line);
    if (match) { error = match[1]; break; }
  }
  let kind = "NO_RESTORABLE_PG_ERROR_FOUND";
  if (error) {
    for (const [label,matcher] of FAILURE_TYPES) {
      if (matcher.test(error)) { kind = label; break; }
    }
  }
  const toc = lines.find(line => /pg_restore:\s+from TOC entry \d+;/u.test(line)) ?? "";
  const match = /;\s+(?:\d+\s+\d+\s+)?(SCHEMA|EXTENSION|TYPE|TABLE|TABLE DATA|FUNCTION|VIEW|INDEX|CONSTRAINT|FK CONSTRAINT|TRIGGER|POLICY|DEFAULT|SEQUENCE|ACL|COMMENT|DOMAIN|PROCEDURE|MATERIALIZED VIEW)\s/u.exec(toc);
  const stage = match?.[1]?.replaceAll(" ","_") ?? "UNCLASSIFIED";
  const known = [
    ["PGCRYPTO", /(?:^|[^\w])pgcrypto(?:[^\w]|$)/iu],
    ["UUID_OSSP", /uuid-ossp/iu],
    ["SUPABASE_VAULT", /supabase_vault/iu],
    ["PGSTATTUPLE", /pgstattuple/iu],
    ["PG_STAT_STATEMENTS", /pg_stat_statements/iu],
    ["AUTH_UID", /auth\.uid\s*\(/iu],
    ["AUTH_SCHEMA", /(?:^|[\s"])auth(?:[\s".]|$)/iu],
    ["STORAGE_SCHEMA", /(?:^|[\s"])storage(?:[\s".]|$)/iu],
    ["EXTENSIONS_SCHEMA", /(?:^|[\s"])extensions(?:[\s".]|$)/iu],
    ["VAULT_SCHEMA", /(?:^|[\s"])vault(?:[\s".]|$)/iu],
  ];
  const dependency = error
    ? known.find(([,matcher])=>matcher.test(error))?.[0] ?? "NOT_WHITELISTED"
    : "NOT_WHITELISTED";
  return Object.freeze({
    first_server_error_kind: kind,
    attempted_archive_object_type: stage,
    missing_known_dependency_class: dependency,
    error_text_or_object_identifiers_exposed: false,
  });
}

if (process.argv[1]?.endsWith("classify-private-pg-restore-error.mjs")) {
  const path = process.argv[2];
  if (!path || !path.startsWith("/tmp/") || path.includes("..")) process.exit(3);
  console.log(JSON.stringify(classifyPrivatePgRestoreLog(readFileSync(path,"utf8"))));
}
