import {
  dryRunCountryRiskObject,
} from "../src/lib/country-risk-publisher.server";

/*
 * Bounded operational discovery set.
 * No database writes occur here.
 *
 * The result is authoritative only when the existing
 * country-risk publisher itself reports country_events_used > 0.
 */
const candidates = [
  "USA",
  "CHN",
  "RUS",
  "UKR",
  "ISR",
  "PSE",
  "IRN",
  "IRQ",
  "SYR",
  "LBN",
  "JOR",
  "SAU",
  "ARE",
  "TUR",
  "IND",
  "PAK",
  "AFG",
  "BGD",
  "NPL",
  "MMR",
  "PRK",
  "KOR",
  "JPN",
  "TWN",
  "PHL",
  "VNM",
  "IDN",
  "GBR",
  "FRA",
  "DEU",
  "POL",
  "BLR",
  "MDA",
  "ROU",
  "GEO",
  "ARM",
  "AZE",
  "SRB",
  "XKX",
  "VEN",
  "MEX",
  "CAN",
  "BRA",
  "ARG",
  "SDN",
  "SSD",
  "ETH",
  "COD",
  "SOM",
  "ZAF",
];

const matches: Array<{
  country_iso3: string;
  recent_events_loaded: number;
  country_events_used: number;
  score: number;
  label: string;
  confidence: number;
  verification_status: string;
  event_count: number;
  evidence_count: number;
  independent_source_count: number;
}> = [];

let sharedRecentEventCount:
  number | null = null;

for (const iso3 of candidates) {
  const result =
    await dryRunCountryRiskObject({
      country_iso3: iso3,
    });

  sharedRecentEventCount ??=
    result.context
      .recent_events_loaded;

  if (
    result.context
      .country_events_used <= 0
  ) {
    continue;
  }

  matches.push({
    country_iso3:
      iso3,

    recent_events_loaded:
      result.context
        .recent_events_loaded,

    country_events_used:
      result.context
        .country_events_used,

    score:
      result.object.risk.score,

    label:
      result.object.risk.label,

    confidence:
      result.object.confidence,

    verification_status:
      result.object
        .verification.status,

    event_count:
      result.object
        .evidence_summary
        .event_count,

    evidence_count:
      result.object
        .evidence_summary
        .evidence_count,

    independent_source_count:
      result.object
        .evidence_summary
        .independent_source_count,
  });
}

matches.sort(
  (a, b) =>
    b.country_events_used -
      a.country_events_used ||
    b.score - a.score ||
    a.country_iso3.localeCompare(
      b.country_iso3,
    ),
);

console.log(
  JSON.stringify(
    {
      shared_recent_events_loaded:
        sharedRecentEventCount,

      countries_checked:
        candidates.length,

      matched_country_count:
        matches.length,

      matches,
    },
    null,
    2,
  ),
);

if (matches.length === 0) {
  console.log(
    "\nNO_COUNTRY_MATCH: current shared recent-event window has no match in the bounded discovery set.",
  );

  process.exit(2);
} else {
  console.log(
    `\nPASS: ${matches.length} evidence-backed country candidate(s) found`,
  );
}
