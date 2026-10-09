/**
 * Canonical source-native freshness clock for commercially served structural
 * observations. A fetch/retrieval timestamp never upgrades old or undated
 * evidence to "current". When original observation and publication timestamps
 * both exist, conservatively use the earlier original time.
 *
 * This is a pure gate: no data reads, writes, certification or payment.
 */
export function sourceNativeObservationTime(
  row: { observed_at?: string | null; published_at?: string | null; retrieved_at?: string | null },
  asOfMs: number,
): number | null {
  if (!Number.isFinite(asOfMs)) return null;
  const native = [row.observed_at, row.published_at].filter(
    (value): value is string => value !== null && value !== undefined,
  );
  if (native.length === 0) return null;
  const parsed = native.map((value) => Date.parse(value));
  // Fail closed on invalid or future source-native timestamps, even when
  // another timestamp in the same row looks old.
  if (parsed.some((time) => !Number.isFinite(time) || time > asOfMs)) return null;
  return Math.min(...parsed);
}
