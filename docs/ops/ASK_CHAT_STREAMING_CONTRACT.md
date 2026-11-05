# Ask Geomacro verified-answer progressive chat

The browser uses POST `/api/ask/v2/turn` with bounded in-tab user-question history (up to eight turns). The request body is JSON, not a URL; same-origin POST enforcement, request length cap and the canonical existing Ask rate/security boundaries remain in force.

The response is Server-Sent Events with static event names `stage`, `answer`, `error`. `stage` signals are `researching` and `finalizing`, then the FULL governed answer is sent once. The implementation does **not** stream speculative LLM tokens or generate unsupported facts before verifying evidence.

The client keeps the previously shipped GET `/api/public-ask` fallback exclusively for an older deploy returning HTTP 404/405 on the new route; all other errors fail closed. Chat history remains ephemeral browser-tab React state and is never a data source or a signed proof.

The UI change is founder-requested but website-lock baseline approval must be recorded in a dedicated locked-presentation PR after review of this change. Live deploy, route buffering and first-byte/readback must be tested externally; CI builds alone do not prove edge streaming works.

## Founder-directed three-category free-form routing (2026-11-06)

Ask accepts free-form questions and short follow-ups in the existing tab-only ChatGPT-style workspace. A common three-domain vocabulary drives both user-scope detection and bounded index category planning; standalone unclassified questions may use the existing **optional** scope-checking language interpreter, never as evidence. Common US/UK country mentions and broad news prompts are not incorrectly rejected solely for omitting a sector keyword. Timeless two/three-category conceptual mechanisms are clearly marked educational with no current event, fresh numerical reading, signature or finance claim. Current, geographic, numeric or forecast questions always use governed retrieval and honestly return insufficient evidence if unavailable. The public API stays rate-limited, source-private, non-commercial, no-funds and no added data writes. Exact-head CI, signed provenance and independent live answer verification are separate gates; a frontend build does not prove worldwide live coverage.
