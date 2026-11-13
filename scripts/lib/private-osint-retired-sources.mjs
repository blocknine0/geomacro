/** Production-discovered, repeatedly broken upstream feeds. This is a
 * permanent active-poll exclusion, NOT a deletion of source provenance or
 * previously acquired D1 evidence. See operational proof links below.
 *
 * Four independent *read-only* 512-endpoint probes on 2026-10-30 at
 * 18:27, 20:36, 20:39 and 20:42 UTC were reconciled. Each of the 76
 * original entries was denied, unavailable, malformed or otherwise unsupported in
 * at least three probes; no healthy native-dated item was observed from
 * any of them in those checks. The presence of an item without a fresh
 * native clock is not a healthy original-source observation.
 *
 * Evidence: Actions 41106820853, 41124471216, 41124882797,
 * 41125059189 (artifact 'geomacro-private-osint-live-coverage-*').
 * Additional 2026-10-31 PR #3268 live-probe evidence (run 41209335181)\n * classified private_priority_aus_ga_news UNAVAILABLE and\n * private_priority_iea_news DENIED; exclude both from future private polling.\n * These sources are not guaranteed irrecoverable upstream; retirement
 * means GeoMacro stops requesting them unless explicitly re-reviewed.
 */
import {readFileSync} from "node:fs";
const policy=JSON.parse(readFileSync(new URL("../../config/retired-source-replacements.v1.json",import.meta.url),"utf8"));
if(policy.schema!=="geomacro.retired-source-replacements.v1"||
   policy.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||!Array.isArray(policy.retired))
 throw Error("PRIVATE_OSINT_RETIREMENT_POLICY_INVALID");
// Owner instruction on 2026-11-08 adds the 48 endpoint failures from run
// 42419005003 to the historical 79; retirement is not permanent outage proof.
export const PRIVATE_OSINT_RETIRED_SOURCE_IDS=Object.freeze(policy.retired.map(x=>x.id));
const RETIRED=new Set(PRIVATE_OSINT_RETIRED_SOURCE_IDS);
const RETIRED_URLS=new Set(policy.retired.flatMap(x=>x.url?[x.url]:[]));
const DISABLED_PENDING_LIVE_VERIFICATION=new Set(policy.disabled_pending_live_verification??[]);
if(RETIRED.size!==PRIVATE_OSINT_RETIRED_SOURCE_IDS.length ||
   PRIVATE_OSINT_RETIRED_SOURCE_IDS.some(x=>!/^private_[a-z0-9_]+$/u.test(x)))
 throw Error("PRIVATE_OSINT_RETIRED_MANIFEST_INVALID");
// Match aliases by exact feed URL as well: a second catalogue ID must never
// silently reintroduce an endpoint that the owner permanently removed.
export const isRetiredPrivateOsintSource=source=>
 RETIRED.has(source?.id)||RETIRED_URLS.has(source?.url)||
 DISABLED_PENDING_LIVE_VERIFICATION.has(source?.id)||
 source?.status==="disabled_pending_live_verification";
