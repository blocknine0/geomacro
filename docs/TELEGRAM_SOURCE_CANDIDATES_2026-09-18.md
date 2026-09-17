# Global Public Telegram Source Candidates — Manual Review Queue

Review date: **2026-09-18**

Status: **CANDIDATES ONLY · NOTHING IN THIS FILE IS APPROVED OR ENABLED**

This sheet is a human-review queue for third-party public Telegram channels that may be useful to Geomacro as internal raw-signal inputs. It is not a runtime allowlist and does not change `live_telegram_channel_registry`.

For every candidate, independently open the public Telegram page and the publisher/authority website before approving it. Handles can change or be impersonated.

## Publisher / newsroom candidates

| Public handle | Coverage | Current identity signal | Review state |
| --- | --- | --- | --- |
| `@liveuamap` | global conflict / geolocation | Liveuamap website links this Telegram handle | PENDING |
| `@KyivIndependent_official` | Ukraine / Eastern Europe | channel identifies itself as the official Kyiv Independent channel | PENDING |
| `@bbcrussian` | Russia / Ukraine / Eurasia | verified channel, identifies itself as BBC News Russian Service official | PENDING |
| `@anadoluagency_en` | Türkiye / MENA / global | verified channel, identifies itself as Anadolu Agency English official | PENDING |
| `@euronews_eng` | Europe / global | verified Euronews English channel | PENDING |
| `@nikkeiasia` | Asia business / geopolitics / macro | verified Nikkei Asia channel | PENDING |
| `@rbc_news` | Russia business / macro / news | verified channel, identifies itself as official RBC | PENDING |
| `@THnewsupdates` | India / South Asia | verified The Hindu feed | PENDING |
| `@SCMP_News` | China / Hong Kong / Asia | verified South China Morning Post channel | PENDING |
| `@hongkongfp` | Hong Kong / China | public Hong Kong Free Press channel | PENDING |
| `@cnalatest` | Southeast Asia / global | verified CNA channel linking cna.asia | PENDING |
| `@AddisstandardEng` | Ethiopia / Horn of Africa | verified Addis Standard channel | PENDING |
| `@MiddleEastEye_TG` | Middle East / North Africa | verified Middle East Eye channel | PENDING |
| `@trtworld` | Türkiye / global | verified TRT World channel | PENDING |
| `@the_jerusalem_post` | Israel / Middle East | verified Jerusalem Post channel | PENDING |
| `@listadapublica` | Brazil / environment / mining / rare earths | verified Agência Pública channel | PENDING |

## Primary / official-claim candidates

These are valuable because they can reveal what an authority is officially announcing. They are **not independent corroboration of their own claims**.

| Public handle | Source type / coverage | Current identity signal | Review state |
| --- | --- | --- | --- |
| `@centralbank_russia` | central bank / Russia macro | verified Bank of Russia channel | PENDING |
| `@nbu_ua` | central bank / Ukraine macro | verified National Bank of Ukraine official channel | PENDING |
| `@pibindiaenglish` | Government of India releases | channel identifies PIB as the Government of India nodal agency | PENDING |
| `@kpszsu` | Ukraine Air Force announcements | verified channel links official Air Force social accounts | PENDING |
| `@IDFofficial` | Israel Defense Forces announcements | verified channel identifies itself as official IDF | PENDING |
| `@Irna_en` | Iran state news / official claims | identifies IRNA as Iran's official news agency | PENDING |
| `@tass_agency` | Russia state news / official claims | verified TASS channel linking tass.ru | PENDING |

## Identity needs extra manual confirmation

Do not approve until the publisher's own website or another first-party surface confirms the exact handle.

| Public handle | Coverage | Reason for extra check | Review state |
| --- | --- | --- | --- |
| `@africanewsofficial` | pan-Africa | public active channel found; first-party ownership confirmation still required | HOLD |
| `@teleSUREng` | Latin America | public active channel found; first-party ownership confirmation still required | HOLD |
| `@agenciabrasil` | Brazil | public channel found; first-party ownership confirmation still required | HOLD |

## Explicit relay / non-official hold

These can be useful for speed, but should not be enabled during the first manual-approval wave.

| Public handle | Reason | Review state |
| --- | --- | --- |
| `@ReutersWorldChannel` | channel itself says it is not an official Reuters channel | HOLD |
| `@FinancialJuice` | channel description says it is an automated Twitter-to-Telegram feed with no affiliation | HOLD |

## Not yet approved / unresolved identity

- Al Jazeera English: multiple Telegram handles are discoverable, and at least one explicitly labels itself unofficial. Do not add an Al Jazeera Telegram handle until a current first-party Al Jazeera surface confirms the exact public username.
- Do not substitute similarly named channels, mirrors, translated repost channels, or high-subscriber impersonators for the exact reviewed handle.

## Manual review record

For a channel you decide to approve, capture:

- exact lower-case public username;
- exact `https://t.me/<username>` URL;
- first-party identity proof URL;
- source role: publisher, official authority, state agency, independent media, aggregator, or relay;
- regions/domains;
- language;
- repost/aggregation behavior;
- rights boundary (default `INTERNAL_RESEARCH_ONLY`);
- reviewer name;
- review date;
- review reference;
- decision.

Only after this review should the separate database row be set to `manual_review_status=APPROVED` and `enabled=true`.
