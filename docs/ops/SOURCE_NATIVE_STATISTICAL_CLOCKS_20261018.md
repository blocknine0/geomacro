# Source-native statistical clocks — 18 October 2026

This correction preserves the existing Geomacro three-domain intake and all commercial validation gates. **Reference period != publisher release time != read time**.

- WDI annual/period series: require the returned ISO3, requested indicator and finite numeric value. Do not synthesize December 31 publication clocks; retain the actual reference period and dataset metadata.
- Eurostat JSON-stat: cap decoded dataset cells; require the requested country's exact geography dimension. Keep period and dataset update separate from news publication.
- USGS Mineral Yearbook historical production and facility CSV: remove the hardcoded 2026-08-31 publication date. Retain the production year as historical context only.
- Offline regression tests run in repository-wide Product CI. Genuine original-publisher article/native clocks and existing free news bridge are unchanged.

This does **not** make an unavailable feed operational, certify third-party commercial reuse rights, generate signed GRI, repair expired B2/D1 paid hot snapshots or authorize settlement.
