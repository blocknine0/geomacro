/**
 * Read-only derived newsroom publishing cadence guard.
 * It compares ACTUAL successful canonical D1 publisher workflow completion
 * times, never a story's original date or a public GET/read refresh clock.
 */
// Hourly primary at :07 UTC; backstop at :22 and :52. Recover once last verified
// publisher completion is at least 70 minutes old. This tolerates normal
// collection runtime without hiding a missed hourly cycle indefinitely.
// No claim of an exact GitHub scheduling SLA.
// Both workflows use the same non-canceling writer lock.
export const BACKSTOP_AFTER_MS = 70 * 60_000;
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

/**
 * Only a successful RECOVERY PUBLISH (not a green/no-op backstop workflow)
 * can reset the unattended freshness clock. GitHub Actions marks skipped
 * backstop workflows green, so require all three actual publication/readback
 * steps on the canonical recovery writer job. Job completion, not run updates
 * or news timestamps, is the verified successful recovery time.
 */
export const WEBSITE_BACKSTOP_WORKFLOW = "website-derived-news-cadence-backstop.yml";
export function verifiedBackstopPublicationTime(run,jobs,now=Date.now()) {
  if (!run || run.status!=="completed" || run.conclusion!=="success" ||
      run.head_branch!=="main" || !Number.isSafeInteger(run.id) || run.id<=0 ||
      !Array.isArray(jobs) || !Number.isFinite(now)) return null;
  const expected=[
    "Publish bounded 3-domain derived news to existing D1 (idempotent)",
    // Signed Finds/B2 is a separate capability. A quota-held archive must
    // never invalidate a genuine, verified free-only D1 publication clock.
    "Independently prove private-source-free D1 readback after recovery",
  ];
  for (const job of jobs) {
    if (job?.name!=="catch-up-derived-only" || job.status!=="completed" ||
        job.conclusion!=="success" || !Array.isArray(job.steps))continue;
    if (!expected.every(name=>job.steps.some(step=>step.name===name &&
      step.status==="completed" && step.conclusion==="success")))continue;
    const at=Date.parse(job.completed_at);
    if(Number.isFinite(at) && at<=now+60_000 && at<=Date.parse(run.updated_at)+60_000)
      return new Date(at).toISOString();
  }
  return null;
}
