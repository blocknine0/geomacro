# BGS production historical minerals reference correction

BGS world-mineral-statistics OGC API responses use the native field `year` as a date-time string such as `2024-01-01 00:00:00`. The previous adapter tried numerical conversion of that string and silently dropped the year. Native commodity and country are `bgs_commodity_trans` and `country_trans`, which the prior adapter also did not recognize. This change handles exact publisher-native fields, retains `country_iso3_code`, `bgs_sub_commodity_trans`, units and SDMX precision codes, and reports the year as a historical reference (never publication time).

The protected `BGS exact native historical minerals verification` run uses the official OGC URL, latest-year sorting and up to five rows. A passing receipt requires one real fully attributed record (ISO3, commodity, reference year, statistic type, units and numeric value). It stores no numerical values, raw features, source URLs or third-party payloads. No credentials, Supabase/D1/B2 writes, signing or payments.

BGS official terms for World Mineral Statistics remain subject to an explicit commercial-use review, and historical features do not establish a genuine current critical-minerals disruption. No commercial output permitted on this receipt alone.
