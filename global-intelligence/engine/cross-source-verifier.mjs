import {claimFingerprint} from "./claim-normalizer.mjs";

const EARLY_TELEGRAM = /TELEGRAM_EARLY_SIGNAL|telegram_osint/i;

function sourceIdOf(observation) {
  return String(
    observation?.source_id ??
    observation?.sourceId ??
    observation?.source ??
    ""
  ).trim();
}

function sourceClassOf(observation) {
  return String(
    observation?.source_class ??
    observation?.source_type ??
    observation?.transport ??
    ""
  ).trim().toUpperCase();
}

function isEarlyTelegram(observation) {
  return EARLY_TELEGRAM.test(sourceIdOf(observation)) ||
    sourceClassOf(observation) === "TELEGRAM_EARLY_SIGNAL";
}

function isAuthoritativeTelegram(observation) {
  return sourceClassOf(observation) === "TELEGRAM_VERIFIED" ||
    sourceClassOf(observation) === "TELEGRAM_OFFICIAL";
}

export function verifyObservations(observations, {minIndependentSources = 2} = {}) {
  if (!Array.isArray(observations)) return [];

  const groups = new Map();

  for (const observation of observations) {
    const key = claimFingerprint(observation);
    if (!key || key.split("|").every(part => !part)) continue;

    const sourceId = sourceIdOf(observation);
    const group = groups.get(key) ?? {
      observations: [],
      sourceIds: new Set(),
      trustedIndependentSourceIds: new Set(),
      authoritativeTelegramSourceIds: new Set()
    };

    group.observations.push(observation);
    if (sourceId) {
      group.sourceIds.add(sourceId);
      if (!isEarlyTelegram(observation)) {
        group.trustedIndependentSourceIds.add(sourceId);
      }
      if (isAuthoritativeTelegram(observation)) {
        group.authoritativeTelegramSourceIds.add(sourceId);
      }
    }
    groups.set(key, group);
  }

  return [...groups.values()].map(group => {
    const independentSourceCount = group.sourceIds.size;
    const trustedIndependentSourceCount = group.trustedIndependentSourceIds.size;
    const authoritativeTelegramCount = group.authoritativeTelegramSourceIds.size;

    return {
      verified:
        trustedIndependentSourceCount >= minIndependentSources ||
        authoritativeTelegramCount >= 1,
      corroborated: independentSourceCount >= minIndependentSources,
      independent_source_count: independentSourceCount,
      trusted_independent_source_count: trustedIndependentSourceCount,
      authoritative_telegram_source_count: authoritativeTelegramCount,
      telegram_only: trustedIndependentSourceCount === 0,
      observations: group.observations
    };
  });
}
