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
