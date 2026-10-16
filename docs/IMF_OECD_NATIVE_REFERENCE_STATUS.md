# IMF/OECD native periods and commercial-read boundary

Existing `global-intelligence/adapters/imf-sdmx.mjs` fabricated publication by converting each annual reference period to 31 December. This patch preserves IMF DataMapper v2 native country, indicator, annual period and numeric value but sets `published_at=null` and `native_release_at=null`; no freshness or signed-current claim can be inferred. Restricts country/indicator/period and uses bounded fail-closed HTTP without redirects.

The new experimental OECD SDMX monthly unemployment series reads one official Data Explorer dataset within a single historical period, validates exact United States country, monthly frequency and exactly one qualifying record, and fails closed on extra/missing scope. This is an *attempt to validate the real API*, not proof that the provider has accepted the query. The protected production workflow independently reports failures and preserves only sanitized metadata; it never stores third-party numerical values.

Both readers are statistical references only. Neither original publication clock nor exact commercial licence permissions have been proven. No payments, Supabase/D1/B2 writes, signing, GRI/Indices scoring or commercial source promotion are performed.

Production acceptance requires a real `IMF OECD native statistical reference verification` run returning 2/2 with exactly scoped datasets, plus independent release-time, redistribution/use permission and publisher proof before signing paid intelligence. A protected daily run does not by itself prove any country's current news coverage or repair the public D1 503.

After production readback #38927909639 the first historical OECD query returned HTTP 500, so the corrected probe selects the explicitly documented `DSD_LFS@DF_IALFS_INDIC` combined unemployment rate series (`UNE_LF_M`, calendar/seasonal adjustment Y, total sex, age 15+). It continues to fail closed until the new real-source receipt succeeds. IMF provider denial is now classified by sanitized HTTP status; a 403 is not bypassed or treated as a release.

## Official IMF public transport correction — 2026-10-16

The production IMF DataMapper v2 read returned HTTP 403. IMF's own API documentation at https://www.imf.org/external/datamapper/api/ still publishes an anonymous v1 DataMapper resource. Switch the GDP country/years reader and bounded catalogue to the public v1 resource rather than retrying the denied v2 endpoint or sending a bearer token. If v1 is denied, fail closed with the true HTTP status. Original publication times remain null, commercial_rights_verified remains false and no signed/paid output is authorized by a transport response.
