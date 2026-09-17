# Live structured event identity invariant

`live_structured_events.id` is a permanent canonical identity once a `story_key` has been stored.

The structuring runtime may use a bounded recent-event window for similarity matching, but an exact deterministic `story_key` match must be resolved against the canonical store before a new UUID is allocated. When an older exact story is found, the runtime hydrates the stored event state and appends new evidence to that canonical event.

The runtime must not rely on `ON UPDATE CASCADE` or mutate an existing event primary key to resolve a `story_key` conflict. Existing evidence and commercial-rights provenance reference the canonical event ID and must remain stable.
