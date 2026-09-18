# Global Public Telegram Source Candidates — Manual Review Queue

Review date: **2026-09-18**

Status: **GLOBAL DISCOVERY MATRIX COMPLETE · CANDIDATES ONLY · NOTHING APPROVED OR ENABLED**

This document is a human-review queue and coverage plan for third-party public Telegram channels that may be useful to Geomacro as internal raw-signal inputs. It is not a runtime allowlist and does not authorize ingestion.

The machine-readable coverage contract is:
`config/telegram-global-coverage-matrix.json`

## Global coverage contract

Geomacro's target is:

> **Global geographic and linguistic coverage with controlled, diversified Telegram signal intake.**

This does **not** mean "all global news from Telegram". Telegram does not publish a complete public channel directory, channels can appear/disappear continuously, and public directories explicitly state that no complete list exists. Independent research indexes also show very large multilingual coverage, including 18M+ indexed channels/groups and 84-language research coverage, so exhaustive enumeration is neither necessary nor reliable. citeturn0search1turn0search9

The coverage matrix therefore uses three layers:

1. **Geographic coverage:** North America, Latin America/Caribbean, Europe, Middle East, Africa, South Asia, East Asia, Southeast Asia, Central Asia/Caucasus, Oceania/Pacific, plus global institutions.
2. **Language coverage:** major global and regional languages relevant to geopolitical and macro signals.
3. **Signal-domain coverage:** geopolitics, conflict/security, macroeconomics, trade, energy, commodities, shipping, humanitarian risk, climate/disaster and market-moving events.

## Coverage regions

The machine-readable matrix defines explicit country and language targets for:

- North America
- Latin America & Caribbean
- Western/Central Europe
- Northern Europe
- Eastern Europe & Balkans
- Middle East
- Africa
- South Asia
- East Asia
- Southeast Asia
- Central Asia & Caucasus
- Oceania & Pacific
- Global institutions

The matrix is a **coverage target**, not a claim that every country already has an approved Telegram source.

## Current candidate queue

### Publisher / newsroom candidates

| Public handle | Coverage | Current identity signal | Review state |
| --- | --- | --- | --- |
| `@liveuamap` | global conflict / geolocation | publisher-linked Telegram handle from prior review | PENDING |
| `@KyivIndependent_official` | Ukraine / Eastern Europe | channel identifies as official publisher channel | PENDING |
| `@bbcrussian` | Russia / Ukraine / Eurasia | prior review identified BBC Russian service | PENDING |
| `@anadoluagency_en` | Türkiye / MENA / global | Telegram page states official Anadolu Agency English account | PENDING |
| `@euronews_eng` | Europe / global | prior review identified Euronews English channel | PENDING |
| `@nikkeiasia` | Asia business / geopolitics / macro | prior review identified Nikkei Asia channel | PENDING |
| `@rbc_news` | Russia business / macro / news | prior review identified official RBC channel | PENDING |
| `@THnewsupdates` | India / South Asia | prior review identified The Hindu feed | PENDING |
| `@SCMP_News` | China / Hong Kong / Asia | prior review identified South China Morning Post channel | PENDING |
| `@hongkongfp` | Hong Kong / China | prior review identified Hong Kong Free Press channel | PENDING |
| `@cnalatest` | Southeast Asia / global | prior review identified CNA channel | PENDING |
| `@AddisstandardEng` | Ethiopia / Horn of Africa | prior review identified Addis Standard channel | PENDING |
| `@MiddleEastEye_TG` | Middle East / North Africa | prior review identified Middle East Eye channel | PENDING |
| `@trtworld` | Türkiye / global | prior review identified TRT World channel | PENDING |
| `@the_jerusalem_post` | Israel / Middle East | prior review identified Jerusalem Post channel | PENDING |
| `@listadapublica` | Brazil / environment / mining / rare earths | prior review identified Agência Pública channel | PENDING |
| `@BBCArabic` | Arabic / MENA / global | Telegram page labels it the official BBC Arabic channel | PENDING |
| `@France24_en` | Europe / global | Telegram page identifies FRANCE 24 English | PENDING |
| `@France24_fr` | France / Francophone world | Telegram page identifies FRANCE 24 French | PENDING |
| `@hindustantimes` | India / South Asia | Telegram page labels it official and links the publisher website | PENDING |
| `@thedailystar` | Bangladesh / South Asia | Telegram page identifies The Daily Star Bangladesh | PENDING |

Current web evidence supports the identity claims for Anadolu Agency, BBC Arabic, FRANCE 24 English/French, Hindustan Times and The Daily Star, but these remain **PENDING** until the operator performs the required first-party review and records the review reference. citeturn1search2turn1search14turn1search12turn1search11turn1search1turn1search3

### Primary / official-claim candidates

These sources can reveal what an authority officially announces. They are **not independent corroboration of their own claims**.

| Public handle | Source type / coverage | Review state |
| --- | --- | --- |
| `@centralbank_russia` | central bank / Russia macro | PENDING |
| `@nbu_ua` | central bank / Ukraine macro | PENDING |
| `@pibindiaenglish` | Government of India releases | PENDING |
| `@kpszsu` | Ukraine Air Force announcements | PENDING |
| `@IDFofficial` | Israel Defense Forces announcements | PENDING |
| `@Irna_en` | Iran state news / official claims | PENDING |
| `@tass_agency` | Russia state news / official claims | PENDING |

### Identity needs extra manual confirmation

| Public handle | Coverage | Review state |
| --- | --- | --- |
| `@AJENews_Official` | Al Jazeera English / global | PENDING |
| `@AlJazeeraEnglish` | Al Jazeera English / global | HOLD |
| `@africanewsofficial` | pan-Africa | HOLD |
| `@teleSUREng` | Latin America | HOLD |
| `@agenciabrasil` | Brazil | HOLD |

The Al Jazeera candidates are deliberately unresolved. Public Telegram pages exist for multiple similarly named handles, including `@AJENews_Official` and `@AlJazeeraEnglish`, but a Telegram page alone is not enough to establish first-party ownership. citeturn1search31turn1search5

### Explicit relay / non-official hold

| Public handle | Reason | Review state |
| --- | --- | --- |
| `@ReutersWorldChannel` | channel explicitly says it is not an official Reuters channel | HOLD |
| `@bbcworld` | channel explicitly says it is not an official BBC channel | HOLD |
| `@BBCWorldoffl` | independent aggregator claiming to source the BBC feed, not a first-party BBC channel | HOLD |
| `@FinancialJuice` | automated relay / no publisher affiliation | HOLD |

The Reuters World Telegram channel explicitly disclaims official Reuters status, and the `@bbcworld` page explicitly says it is not an official channel. These must not be treated as first-party Reuters/BBC sources. citeturn1search0turn0search6

## Discovery does not equal approval

Public directories are useful for discovery, but they are not source-authority systems. Current directory evidence shows very large public Telegram coverage across 154+ countries and many languages, while another directory states that its listings include unchecked/unreviewed entries. citeturn0search0turn0search10

Therefore:

- subscriber count is not a trust score;
- Telegram verification is not commercial rights clearance;
- directory presence is not publisher ownership;
- a public channel is not automatically safe or accurate;
- a channel that republishes another publisher is not an independent corroborator;
- raw Telegram text/media is not automatically reusable for customer delivery.

## Manual approval record

For every channel the operator chooses to approve, capture:

- exact lower-case public username;
- exact `https://t.me/<username>` URL;
- first-party identity proof URL;
- source role: publisher, official authority, state agency, independent media, aggregator, relay, or OSINT;
- countries/regions;
- language;
- signal domains;
- repost/aggregation behavior;
- rights boundary, default `INTERNAL_RESEARCH_ONLY`;
- reviewer;
- review date;
- review reference;
- decision.

Only after this review should the separate database row be set to:

`manual_review_status=APPROVED` and `enabled=true`.

## Runtime boundary

The source matrix does **not** change the fail-closed runtime contract:

```text
global coverage matrix
        ↓
candidate source
        ↓
manual identity / rights review
        ↓
APPROVED + enabled
        ↓
public Telegram raw intake
        ↓
UNVERIFIED
        ↓
dedup / repost-family detection
        ↓
independent corroboration
        ↓
source-rights / provenance / freshness gates
        ↓
CORROBORATING / VERIFIED / REJECTED
        ↓
only governed VERIFIED derived evidence may reach production intelligence
```

Telegram-only evidence can never directly authorize GRI, Risk Gate, paid intelligence, public Early Warning, or a customer-facing Risk Object.

## Completion definition

The Telegram global-coverage phase is complete when:

- the global geographic/language matrix is versioned in Git;
- candidate discovery is separated from runtime authorization;
- all starter candidates are explicitly PENDING or HOLD;
- no unofficial relay is represented as an official publisher;
- manual approval remains mandatory;
- Telegram evidence remains UNVERIFIED at ingestion;
- independent corroboration remains mandatory;
- rights boundaries remain explicit;
- the registry and worker must agree before ingestion;
- no secrets or Telegram session material are stored in the repository.

This phase is therefore **architecture + coverage discovery complete**, while **channel activation remains intentionally manual**.
