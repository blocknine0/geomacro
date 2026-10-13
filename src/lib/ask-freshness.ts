/**
 * "What is changing?" and "What is happening?" are freshness requests even
 * without literal "latest", "recent", "today" or "current" tokens.
 *
 * Only the original event publication clock (not read/cache time) may satisfy
 * this window. Questions without temporal intent retain the established B2
 * continuity behavior. This never turns an old snapshot into a new event.
 */
const FRESHNESS_RE =
  /\b(now|today|latest|current|currently|real[ -]?time|breaking|recent|recently|last\s+\d+\s*(?:minutes?|hours?|days?)|past\s+\d+\s*(?:minutes?|hours?|days?))\b/i;
const CURRENT_DEVELOPMENT_RE =
  /\b(?:what(?:\s+(?:is|are)|'s)?\s+changing|(?:is|are)\s+changing|what(?:\s+(?:is|are)|'s)?\s+happening|new\s+(?:developments?|updates?|releases?))\b/i;

export function freshnessMaxAgeHours(question: string): number | null {
  if (!FRESHNESS_RE.test(question) && !CURRENT_DEVELOPMENT_RE.test(question))
    return null;
  if (/\b(now|latest|current|currently|real[ -]?time|breaking)\b/i.test(question))
    return 6;
  return 24;
}
