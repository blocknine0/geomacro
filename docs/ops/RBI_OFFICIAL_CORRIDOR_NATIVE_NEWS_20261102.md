# RBI official press releases — supplemental native intake (2026-11-02)

Original directory source ID `rbi_releases` still points to the provided official press-release portal. This is a **supplemental original-publisher RSS adapter**, not a replacement or a fabricated feed for other regional data portals.

- Native RSS: `https://www.rbi.org.in/pressreleases_rss.xml`
- New dedicated source ID: `rbi_official_press_releases`
- Domain: `macro` / APAC.
- Existing Direct Global Corridor Intake schedule: 15-minute best-effort, 9 RSS feeds total (six original directory feeds, WTO, USGS and RBI supplements).
- Source-native dated items and pinned same-publisher permalink only; no title, body, article text or protected content in D1.
- RBI release links that use the `BS_PressReleaseDisplay.aspx?prid=12345` format retain the one numeric `prid` parameter. Other query parameters, foreign hosts and unknown redirect targets are rejected. Distinct press-release IDs may not collapse into one article.
- Existing private 72-hour D1 storage, strict readback, retained original 37/39 registry parity, and nonchargeable/no-PREDGE/no-Website Intelligence boundary are unchanged.

**Runtime state:** A successfully registered endpoint is not proof of a new source-dated publication. Check the source-specific receipt/log line `supplemental_native_feed_checks`. A denied/empty/malformed feed is reported as such and not substituted by another website.

**Operator credentials:** No RBI key required. Separate missing optional FRED key, pre-approved ReliefWeb appname and optional licensed CryptoCompare key must be provided through GitHub production environment secrets, not chat. FRED/World Bank/ECB/USGS annual statistical datasets are reference data, not current news. This change does not certify any CAMEO event, corridor blockade, commercial eligibility, signed GRO, or payable Risk Gate decision.
