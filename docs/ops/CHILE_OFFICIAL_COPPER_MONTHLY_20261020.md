# Chile: official Central Bank / COCHILCO monthly copper source

Original government series: https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_IND_SEC/MN_IND_SEC20/IS_MIN2?idSerie=F034.PCUM.FLU.COCHILCO.Z.0.M

Chile Central Bank publishes monthly COCHILCO copper mine production reference series F034.PCUM.FLU.COCHILCO.Z.0.M. Its native observation month is NOT the publication timestamp or today's mine event.

Exact first-party HTTPS GET; 384KiB response cap, 12s timeout, no redirects. The metadata parser never exposes exact publisher numeric values or commercial permissions, and rejects missing issuer/series identity, stale/future reference periods. No source numbers/HTML retained beyond transient input.

Reuses the existing single once-daily GDACS/PortWatch source workflow; one additional bounded GET, three-day private GitHub Actions receipt, no D1/B2/Supabase write, no x402 funds. This does not grant commercial source rights, certify trade flows, confirm an incident or complete 195-country production coverage.

Exact-main production verification uses the chile-cochilco-monthly-reference job. Do not claim a live source solely because CI passes.