const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedNonNegative(value) {
  return Math.max(0, finiteNumber(value, 0));
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function round4(value) {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}

function isoTime(value, field) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} is invalid`);
  return date.toISOString();
}

function normalizeObservation(row) {
  const country = String(row?.country_iso3 ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(country)) return null;

  const observedAt = new Date(row?.observed_at ?? "");
  if (!Number.isFinite(observedAt.getTime())) return null;

  const goldstein = Number(row?.value_numeric);
  if (!Number.isFinite(goldstein) || goldstein < -10 || goldstein > 10) return null;

  const provenance = row?.provenance && typeof row.provenance === "object" ? row.provenance : {};
  const tone = Number(provenance.avg_tone);

  return {
    country_iso3: country,
    observed_at_ms: observedAt.getTime(),
    observed_at: observedAt.toISOString(),
    goldstein,
    avg_tone: Number.isFinite(tone) ? tone : null,
    num_mentions: boundedNonNegative(provenance.num_mentions),
    num_sources: boundedNonNegative(provenance.num_sources),
    num_articles: boundedNonNegative(provenance.num_articles),
    source_record_id: String(row?.source_record_id ?? "").trim() || null,
  };
}

function aggregateWindow(rows) {
  const goldsteinValues = rows.map((row) => row.goldstein);
  const toneValues = rows.map((row) => row.avg_tone).filter((value) => value !== null);
  const negativeIntensity = rows.reduce(
    (sum, row) => sum + Math.max(0, -row.goldstein),
    0,
  );

  return {
    event_count: rows.length,
    mean_goldstein: round4(mean(goldsteinValues)),
    min_goldstein: goldsteinValues.length ? Math.min(...goldsteinValues) : null,
    negative_event_count: rows.filter((row) => row.goldstein < 0).length,
    severe_negative_event_count: rows.filter((row) => row.goldstein <= -5).length,
    negative_intensity_sum: round4(negativeIntensity),
    mean_tone: round4(mean(toneValues)),
    mentions_sum: Math.round(rows.reduce((sum, row) => sum + row.num_mentions, 0)),
    sources_sum: Math.round(rows.reduce((sum, row) => sum + row.num_sources, 0)),
    articles_sum: Math.round(rows.reduce((sum, row) => sum + row.num_articles, 0)),
    distinct_source_records: new Set(rows.map((row) => row.source_record_id).filter(Boolean)).size,
  };
}

function ratioOrNull(current, prior) {
  if (prior <= 0) return current > 0 ? null : 1;
  return round4(current / prior);
}

/**
 * Produces research/calibration features only.
 *
 * It deliberately does not create a CEWS score, public status, market direction,
 * or commercial eligibility. The feature vector is intended for historical/live
 * replay so later methodology calibration can be evidence-based.
 */
export function buildGdeltCountryEscalationFeatures(input) {
  const asOf = new Date(isoTime(input?.as_of_utc, "as_of_utc"));
  const observations = Array.isArray(input?.observations) ? input.observations : [];
  const normalized = observations.map(normalizeObservation).filter(Boolean);

  const current15Start = asOf.getTime() - 15 * MINUTE_MS;
  const current60Start = asOf.getTime() - HOUR_MS;
  const prior60Start = asOf.getTime() - 2 * HOUR_MS;
  const prior60End = current60Start;

  const byCountry = new Map();
  for (const row of normalized) {
    if (row.observed_at_ms > asOf.getTime() || row.observed_at_ms < prior60Start) continue;
    if (!byCountry.has(row.country_iso3)) byCountry.set(row.country_iso3, []);
    byCountry.get(row.country_iso3).push(row);
  }

  const features = [];
  for (const [countryIso3, rows] of byCountry.entries()) {
    const current15 = rows.filter((row) => row.observed_at_ms >= current15Start);
    const current60 = rows.filter((row) => row.observed_at_ms >= current60Start);
    const prior60 = rows.filter(
      (row) => row.observed_at_ms >= prior60Start && row.observed_at_ms < prior60End,
    );

    const current15Agg = aggregateWindow(current15);
    const current60Agg = aggregateWindow(current60);
    const prior60Agg = aggregateWindow(prior60);
    const freshest = current60.length
      ? Math.max(...current60.map((row) => row.observed_at_ms))
      : rows.length
        ? Math.max(...rows.map((row) => row.observed_at_ms))
        : null;

    features.push({
      country_iso3: countryIso3,
      as_of_utc: asOf.toISOString(),
      source_id: "gdelt_v2_events",
      methodology: "gdelt-country-escalation-features-v1",
      research_only: true,
      commercial_signal_activation: false,
      public_alert_activation: false,
      windows: {
        current_15m: current15Agg,
        current_60m: current60Agg,
        prior_60m: prior60Agg,
      },
      deltas: {
        event_count_delta_60m: current60Agg.event_count - prior60Agg.event_count,
        event_count_ratio_60m: ratioOrNull(
          current60Agg.event_count,
          prior60Agg.event_count,
        ),
        negative_intensity_delta_60m: round4(
          current60Agg.negative_intensity_sum - prior60Agg.negative_intensity_sum,
        ),
        negative_intensity_ratio_60m: ratioOrNull(
          current60Agg.negative_intensity_sum,
          prior60Agg.negative_intensity_sum,
        ),
        sources_delta_60m: current60Agg.sources_sum - prior60Agg.sources_sum,
        articles_delta_60m: current60Agg.articles_sum - prior60Agg.articles_sum,
      },
      freshness_seconds:
        freshest === null ? null : Math.max(0, Math.round((asOf.getTime() - freshest) / 1000)),
    });
  }

  return features.sort((a, b) => {
    const intensityDelta =
      b.deltas.negative_intensity_delta_60m - a.deltas.negative_intensity_delta_60m;
    if (intensityDelta !== 0) return intensityDelta;
    const countDelta = b.deltas.event_count_delta_60m - a.deltas.event_count_delta_60m;
    if (countDelta !== 0) return countDelta;
    return a.country_iso3.localeCompare(b.country_iso3);
  });
}
