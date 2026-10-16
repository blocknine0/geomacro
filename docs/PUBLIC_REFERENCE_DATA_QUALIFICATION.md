# Public transport to actual reference record qualification

This lane reads bounded actual data records from seven existing public sources rather than counting HTTP responses. It preserves reference period (not release timestamp), explicit country attribution or a null country, original publication unknown, and rights not certified. No third-party raw payload or numeric value is persisted by the scheduled receipt.

| Source | Pinned series or collection | Extracted | Not proven |
| --- | --- | --- | --- |
| ECB | EXR D.USD.EUR.SP00.A | Latest FX period and numeric value | Native publishing clock or country of impact |
| BIS | WS_CBPOL M.US | US policy-rate period and value | Commercial rights or issuer event provenance |
| Eurostat | namq_10_gdp geo=DE | Latest quarterly Germany GDP reference | News release or world coverage |
| BLS | CUUR0000SA0 | US CPI index and month | Inflation percent or publication time |
| SEC EDGAR | Apple CIK submissions index | Filing form and day | Original filing content or affected country |
| GDACS | Global earthquake search | Bounded hazard collection | Affected country and independent corroboration |
| NOAA SWPC | Solar wind speed summary | Physical observation collection | Geopolitical event or country of impact |

The existing public-source runtime checks 13 upstream source transports, including IMF, OECD, FAOSTAT, ILOSTAT, Comtrade, BGS and Copernicus. Dataflow metadata and collection lists are not verified current country-period releases.

Execution: node --test scripts/tests/public-reference-extraction.test.mjs. Protected production workflow: Public reference data extraction (research-only). One bounded HTTPS GET per source, no redirects, maximum 1 MiB, 12-second timeout. Provider failure is marked as degraded, not replaced with an invented observation.

Commercial boundary: IMF commercial reuse requires permission assessment; BIS, BGS and UN Comtrade require exact dataset/use-case review; OpenSanctions business use requires a data license. Public/free transport does not authorize paid delivery. No signing, source-rights promotion, risk scores, raw customer data, x402, Supabase reactivation, D1/B2 writes or payments.

Still required: actual FAOSTAT/ILOSTAT normalized indicators; native SEC original filings; GDACS affected-country verification; Copernicus STAC scene and imagery readback; full 195-country series mapping and publisher release clocks; mineral HS classification rights review; credentialed BEA/Alpha Vantage/EIA/NCEI/WTO access and quota checks; OpenSanctions business license; independent signed public D1/B2 readback and website exact deployed SHA. Do not declare complete from transport probes or tests.
