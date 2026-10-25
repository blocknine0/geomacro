#!/usr/bin/env node
/**
 * Classify a failed read-only Cloudflare D1 metadata query into a fixed,
 * non-sensitive reason. Raw Wrangler stderr is consumed in memory only:
 * never reprinted, persisted, or copied to CI artifacts.
 */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const MAX_INPUT=32_000;
const CLASSES=Object.freeze([
  ["AUTHENTICATION_REJECTED",/\b(?:invalid api token|invalid token|authentication (?:error|failure)|token is invalid|unauthorized)\b/iu],
  ["PERMISSION_OR_SCOPE_DENIED",/\b(?:permission denied|insufficient permissions?|not authorized|forbidden|access denied|does not have .*permission|missing .*permission)\b/iu],
  ["D1_DATABASE_OR_BINDING_NOT_FOUND",/\b(?:database.{0,100}(?:not found|does not exist|could not be found)|(?:not found|does not exist).{0,100}database|unknown database|missing database id)\b/iu],
  ["RATE_LIMITED",/\b(?:rate limit|too many requests|429)\b/iu],
  ["NETWORK_OR_UPSTREAM_UNAVAILABLE",/\b(?:fetch failed|econnreset|enotfound|etimedout|timed out|connection reset|network unavailable|service unavailable|502|503|504)\b/iu],
]);

export function classifyCloudflareD1ReadonlyError(stderr) {
  const text=typeof stderr==="string"?stderr.slice(0,MAX_INPUT):"";
  const error_class=CLASSES.find(([,pattern])=>pattern.test(text))?.[0]
    ?? "UNKNOWN_WRANGLER_FAILURE";
  return Object.freeze({
    schema:"geomacro.cloudflare-d1-readonly-error-class.v1",
    error_class,
    diagnostic_stderr_present:text.trim().length>0,
    raw_stderr_exposed:false,
    credential_or_query_values_exposed:false,
    d1_write_performed:false,
    b2_request_performed:false,
    supabase_request_performed:false,
    payment_performed:false,
  });
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const raw=readFileSync(0,"utf8");
  process.stdout.write(JSON.stringify(classifyCloudflareD1ReadonlyError(raw))+"\n");
}
