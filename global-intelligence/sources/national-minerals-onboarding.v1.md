# National Minerals Authority Onboarding

National sources are the country-primary layer for minerals. They supplement, not replace, global baselines such as USGS and BGS.

## Required evidence

For each country, onboarding must pin:

1. official authority identity;
2. exact dataset/report endpoint;
3. machine-readable format where available;
4. commodity taxonomy;
5. country/ISO mapping;
6. production unit and reporting period;
7. revision/freshness behavior;
8. licensing and commercial/re-dissemination terms;
9. rate limits and failure behavior.

## Current state

The registry is intentionally partial. It contains a first discovery set for major mineral-producing jurisdictions and the USGS national source. It is **not** a 195-country completion claim.

A country enters `ONBOARDED` only after the exact official data route is pinned and tested. A source cannot be promoted because an authority homepage merely exists.

## Coverage rule

The 195-country mesh must record one of:

- `ONBOARDED`: exact official source tested;
- `NO_MACHINE_READABLE_SOURCE`: official source identified but no stable machine-readable route;
- `DISCOVERY`: source identity found, endpoint unresolved;
- `GAP`: no official source identified yet.

No status may be silently converted to PASS.
