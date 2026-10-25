/** Allowlisted, secret-free D1 failure receipts for production diagnostics.
 * Never return or log the exception text, which may contain SQL/query context.
 */
export const DERIVED_NEWS_D1_FAILURE_CLASSES = Object.freeze([
  "D1_DAILY_ROW_READ_LIMIT",
  "D1_DAILY_ROW_WRITE_LIMIT",
  "D1_STORAGE_LIMIT",
  "D1_OVERLOADED",
  "D1_TRANSIENT",
  "D1_SCHEMA_OR_SQL",
  "D1_UNCLASSIFIED",
]);

const ALLOWED = new Set(DERIVED_NEWS_D1_FAILURE_CLASSES);

export function safeDerivedNewsD1FailureClass(value) {
  return ALLOWED.has(value) ? value : "D1_UNCLASSIFIED";
}

export function classifyDerivedNewsD1Failure(error) {
  const messages = [
    typeof error?.message === "string" ? error.message : "",
    typeof error?.cause?.message === "string" ? error.cause.message : "",
  ].filter(Boolean).join("\n").toLowerCase();

  if (/exceeded d1's free tier daily row read limit/.test(messages))
    return "D1_DAILY_ROW_READ_LIMIT";
  if (/exceeded d1's free tier daily row write limit/.test(messages))
    return "D1_DAILY_ROW_WRITE_LIMIT";
  if (/maximum account storage limit|exceeded maximum db size/.test(messages))
    return "D1_STORAGE_LIMIT";
  if (/d1 db is overloaded|too many requests queued|requests queued for too long/.test(messages))
    return "D1_OVERLOADED";
  if (/network connection lost|replica disconnected|cannot resolve d1 db|d1 db reset|object to be reset|storage operation exceeded timeout|client disconnected/.test(messages))
    return "D1_TRANSIENT";
  if (/no such table|no such column|syntax error|d1_column_notfound|d1_exec_error|d1_type_error/.test(messages))
    return "D1_SCHEMA_OR_SQL";
  return "D1_UNCLASSIFIED";
}
