# Ask Geomacro verified-answer progressive chat

The browser uses POST `/api/ask/v2/turn` with bounded in-tab user-question history (up to eight turns). The request body is JSON, not a URL; same-origin POST enforcement, request length cap and the canonical existing Ask rate/security boundaries remain in force.

The response is Server-Sent Events with static event names `stage`, `answer`, `error`. `stage` signals are `researching` and `finalizing`, then the FULL governed answer is sent once. The implementation does **not** stream speculative LLM tokens or generate unsupported facts before verifying evidence.

The client keeps the previously shipped GET `/api/public-ask` fallback exclusively for an older deploy returning HTTP 404/405 on the new route; all other errors fail closed. Chat history remains ephemeral browser-tab React state and is never a data source or a signed proof.

The UI change is founder-requested but website-lock baseline approval must be recorded in a dedicated locked-presentation PR after review of this change. Live deploy, route buffering and first-byte/readback must be tested externally; CI builds alone do not prove edge streaming works.
