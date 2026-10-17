/**
 * Read-only derived newsroom publishing cadence guard.
 * It compares ACTUAL successful canonical D1 publisher workflow completion
 * times, never a story's original date or a public GET/read refresh clock.
 */
// After a normal 15-minute slot is missed, the +7m backstop may recover.
// Keep real successful completion (not visit, scheduled start or news date)
// authoritative; the publisher/backstop share a non-canceling writer lock.
export const BACKSTOP_AFTER_MS = 22 * 60_000;
export const WEBSITE_PUBLISHER_WORKFLOW = "website-derived-news-continuity.yml";
export function decideWebsiteNewsBackstop(runs, now=Date.now(), limit=BACKSTOP_AFTER_MS) {
  if (!Array.isArray(runs) || !Number.isFinite(now) || !Number.isFinite(limit) || limit<=0)
    throw Error("WEBSITE_NEWS_CADENCE_INPUT_INVALID");
  let mostRecent = null;
  for (const run of runs) {
    if (!run || run.status!=="completed" || run.conclusion!=="success" ||
        run.head_branch!=="main") continue;
    const at=Date.parse(run.updated_at);
    if (!Number.isFinite(at) || at>now+60_000) continue;
    if (mostRecent===null || at>mostRecent) mostRecent=at;
  }
  if (mostRecent===null) return {
    should_run:true, reason:"NO_CONFIRMED_SUCCESS", age_minutes:null,
    last_success_at:null, guaranteed:false,
  };
  const age=Math.max(0,now-mostRecent);
  return {
    should_run:age>=limit,
    reason:age>=limit?"PUBLISHER_SUCCESS_STALE":"PUBLISHER_SUCCESS_RECENT",
    age_minutes:Math.floor(age/60_000),
    last_success_at:new Date(mostRecent).toISOString(),
    guaranteed:false,
  };
}
