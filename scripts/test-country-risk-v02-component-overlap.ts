import {
  dryRunCountryRiskObject,
} from "../src/lib/country-risk-publisher.server";

import {
  classifyEventDriverOverlap,
} from "../src/lib/country-risk-v02-component-overlap";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const countries = [
  ["IND", "India"],
  ["USA", "United States"],
  ["CHN", "China"],
  ["DEU", "Germany"],
] as const;


const seen =
  new Map<
    string,
    {
      driver:
        string;

      countries:
        Set<string>;

      total_contribution:
        number;

      total_events:
        number;
    }
  >();


for (
  const [
    iso3,
    name,
  ] of countries
) {
  const result =
    await dryRunCountryRiskObject({
      country_iso3:
        iso3,

      country_name:
        name,

      as_of:
        AS_OF,
    });


  for (
    const item of
      result.object.attribution
  ) {
    const current =
      seen.get(
        item.driver,
      ) ?? {
        driver:
          item.driver,

        countries:
          new Set<string>(),

        total_contribution:
          0,

        total_events:
          0,
      };


    current.countries.add(
      iso3,
    );

    current.total_contribution +=
      item.score_contribution;

    current.total_events +=
      item.event_count;


    seen.set(
      item.driver,
      current,
    );
  }
}


const rows =
  [...seen.values()]
    .map(
      item => {
        const overlap =
          classifyEventDriverOverlap(
            item.driver as any,
          );


        return {
          driver:
            item.driver,

          status:
            overlap.status,

          overlaps_with:
            overlap.overlaps_with
              .join(","),

          countries:
            [...item.countries]
              .sort()
              .join(","),

          total_events:
            item.total_events,

          total_contribution:
            Math.round(
              item.total_contribution *
              1e6,
            ) /
            1e6,

          rationale:
            overlap.rationale,
        };
      },
    )
    .sort(
      (a, b) =>
        b.total_contribution -
        a.total_contribution,
    );


console.table(
  rows,
);


const direct =
  rows.filter(
    row =>
      row.status ===
      "DIRECT_OVERLAP",
  );


const partial =
  rows.filter(
    row =>
      row.status ===
      "PARTIAL_OVERLAP",
  );


const review =
  rows.filter(
    row =>
      row.status ===
      "REVIEW_REQUIRED",
  );


console.log({
  observed_drivers:
    rows.length,

  direct_overlap:
    direct.length,

  partial_overlap:
    partial.length,

  review_required:
    review.length,

  direct_overlap_contribution:
    Math.round(
      direct.reduce(
        (
          sum,
          row,
        ) =>
          sum +
          row.total_contribution,
        0,
      ) *
      1e6,
    ) /
    1e6,
});


console.log(
  "PASS: REAL EVENT ATTRIBUTION OVERLAP AUDIT COMPLETE",
);
