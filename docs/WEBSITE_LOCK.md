# Geomacro Website Lock

## Status

The public website presentation is **locked to a founder-approved Git baseline**. An approved source baseline is not proof that Lovable has published that SHA; live deployment acceptance is checked separately.

The lock exists so backend, API, data, agent-commerce, x402, database, security, and infrastructure work can continue without accidentally changing the public website presentation.

## Protected presentation surface

The guard blocks changes to:

- public website assets under `public/`
- `src/assets/**`
- `src/components/**`
- `src/content/**`
- `src/hooks/**`
- all UI route files under `src/routes/**/*.tsx`
- `src/router.tsx`
- `src/styles.css`
- root `styles.css`
- `vite.config.ts`
- `components.json`

The guard intentionally does **not** freeze API/server/data implementation files, so backend development can continue.

## Deployment safety

Two independent checks protect the published site:

1. **Website Lock CI** checks every pull request and every push to `main`.
2. **Lovable mirror sync** runs the same lock check before copying canonical `main` into the deployment mirror. If the website differs from the approved baseline, mirroring stops before the live deployment source changes.

## Intentional website changes

Do not edit the protected presentation surface as part of background/backend work.

An intentional website change follows this two-stage approval and deployment sequence:

1. The founder explicitly authorizes the specific presentation change.
2. A dedicated website PR contains only that scoped change, with Product CI, Hosting Alignment and CodeQL reviewed. Website Lock may fail until approval metadata catches up; that failure must be recorded, never disguised.
3. A separate founder-approval/baseline PR pins the exact approved UI commit (not an arbitrary future main SHA), preserves the independent immutable Global Risk lock, keeps `pending_publish_acceptance=true`, and retains the previously observed `published_source_sha`. Website Lock must then pass.
4. The existing protected one-way Lovable mirror synchronizes the approved canonical main. The founder explicitly publishes in Lovable.
5. Verify the exact deployed SHA, visually inspect desktop/mobile, test affected functionality and verify the existing no-funds/data health gates. Do not mark production live merely because CI passed or a mirror commit was created.
6. Only after real acceptance may the publication-status record be updated; never rewrite the earlier approval history.

Lovable AI edits and automatic “Fix” changes must not be used against the locked website.

## Founder-approved Ask verified-progress SSE presentation (2026-10-17)

The founder explicitly requested the Ask Geomacro ChatGPT-style chat to retrieve missing data live, deliver accurate official CPI/FX observations, and display streamed research progress. Reviewed presentation SHA `060fedbae69bf51d4a2b5bee0b30618bec70dd3f` (PR #2363) is the **new website presentation baseline** solely for `src/components/ask/ask-workspace.tsx`. The prior ChatGPT-style UI approved SHA `f98aa5088100a520e1c91300ad8a93c0036f663c` remains pinned in approval history.

No Global Risk, Intelligence, pricing, payment, rights, source-redaction or delay presentation changes are authorized. The SSE route streams research stages and a final governed answer, **not** speculative model tokens or a new signed product. The canonical site still requires a manually published exact-SHA production deployment, outside-in tests of the new POST endpoint and the existing health/503 recovery; GitHub merge or mirror sync alone does not establish live acceptance. No real funds, no Supabase reactivation.

## Founder-approved Ask modular production-smoke correction (2026-10-17)

The owner directed finishing the live-fetch Ask Geomacro user experience. Exact reviewed PR #2366 merged at `7ad7e57f1b67873de3dbc050cf0eaa847e471081` modularizes the Ask page without increasing the existing 18,000-character source budget: `ask-workspace.tsx` 22,020 → 17,518 characters. Its answer/evidence component moved to `ask-answer-view.tsx` and the GET compatibility reader to `ask-legacy-transport.ts`. No behavior/price/data-rights or risk-product presentation change is authorized. The prior SSE UI approved commit `060fedbae69bf51d4a2b5bee0b30618bec70dd3f` remains pinned in prior approval history.

This is **not** a production acceptance override. Preserve `published_source_sha` and `pending_publish_acceptance: true` until the website is published at exact SHA, the external POST SSE route successfully reads back, and the separate signed D1/B2 current Intelligence/GRI/Risk Indices product health genuinely recovers. Nothing here permits fund movement, Supabase reactivation or fabricated source events.

## Founder-approved free homepage Finds original-date recovery (2026-10-17)

The founder directed completing the public website and automatic live source surfacing. Reviewed website PR #2376 merged at `ecbf82c6bea1d77ad9b38a41cedf8b1f306ca61e`. The **only** newly approved presentation paths are:
- `src/routes/index.tsx`
- `src/components/home/commercial-home.tsx`
- `src/components/home/live-intelligence-showcase.tsx`

Previously the homepage depended on the legacy scored `useIntelligence` feed even though the free three-domain collector already published independently verified D1 readbacks of *unscored official original-date observations*. The approved homepage now SSR-loads the existing read-only public D1 journal within 2.5 seconds, projects a bounded free `geomacro.find.v1` card and refreshes from the existing `/api/v1/finds` GET with a separately guarded D1 direct-read fallback. It does not claim that two independent first-party originals, no-attribution commercial rights, external reviewer signatures, canonical GRO or paid hot GRI/Risk Indices exist. Absence/expiry is shown honestly.

The existing six-hour `Production Website Health` adds a **separate parallel** no-funds free homepage/Ask/Finds/D1 outside-in canary, so the strict commercial hot-data 503 does not suppress true free-website diagnostics. This is not a waiver of exact deployed SHA, security, independent signed hot products or no-funds x402 checks.

The general website presentation baseline is now the exact reviewed merge SHA above. The frozen Global Risk baseline remains `0270ab7876cabe372c246f76fbcf299ed1b0e1fc`. The previously observed `published_source_sha` in `config/website-lock.json` is **not** rewritten, `locked=true`, `pending_publish_acceptance=true`, and no funds or Supabase writes are authorized.

**Deployment requires independent outside-in acceptance:** protected canonical main → Lovable mirror → owner hosted Publish → public build marker exactly matches canonical main → real website free Find card and Ask/Intelligence mobile/desktop smoke → strict signed Intelligence/GRI/Risk Indices and deep-health 200 only from actual current proofs. A merged approval record is not a public site deployment.
