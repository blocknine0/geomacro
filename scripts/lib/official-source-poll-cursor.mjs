/**
 * Source-publisher transport/shape failure is a degraded observation, never a
 * successful 90-minute freshness heartbeat or a published scored event.
 * Persist only fixed, non-sensitive failure classification to D1 cursors.
 */
export function officialSourcePollCursorOutcome(success) {
  return success === true
    ? { status: "healthy", failure_class: null }
    : { status: "degraded", failure_class: "official_native_source_probe_failed" };
}
