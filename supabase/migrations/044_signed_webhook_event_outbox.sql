-- =============================================================================
-- Geomacro signed structured webhook event outbox
--
-- PURPOSE
-- - persist customer-deliverable structured events durably beside Risk Gate audit
-- - keep webhook content cryptographically signed and independently verifiable
-- - provide a replay-safe immutable source for a future delivery worker
--
-- SECURITY / PRODUCT BOUNDARY
-- - no outbound HTTP delivery is implemented by this migration
-- - no callback URL, DNS lookup, redirect or arbitrary network fetch occurs here
-- - only structured Risk Gate decision context is stored in webhook payloads
-- - execution_authorized remains false in the signed event contract
-- - service-role only; anon/authenticated receive no table access
-- - delivery attempts/state will live in a separate table so signed event rows
--   never need mutation
-- =============================================================================

create table if not exists public.webhook_event_outbox (
  id uuid primary key default gen_random_uuid(),

  event_id text not null unique,

  audit_id text not null unique
    references public.risk_gate_audit_log(audit_id),

  client_id text not null
    references public.risk_gate_api_clients(client_id),

  schema_version text not null
    check (
      schema_version = 'geomacro-webhook-1.0'
    ),

  event_type text not null
    check (
      event_type = 'risk_gate.decision.created'
    ),

  occurred_at timestamptz not null,

  payload jsonb not null,

  payload_hash text not null
    check (
      payload_hash ~ '^[a-f0-9]{64}$'
    ),

  signature_scheme text not null
    check (
      signature_scheme = 'Ed25519'
    ),

  signing_key_id text not null
    check (
      signing_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),

  signature text not null
    check (
      char_length(signature) between 80 and 256
    ),

  created_at timestamptz not null default now(),

  constraint webhook_event_outbox_payload_alignment_check
    check (
      (
        jsonb_typeof(payload) = 'object'
        and payload ->> 'event_id' = event_id
        and payload ->> 'client_id' = client_id
        and payload ->> 'schema_version' = schema_version
        and payload ->> 'event_type' = event_type
        and payload #>> '{data,audit_id}' = audit_id
        and payload -> 'data' -> 'execution_authorized' = 'false'::jsonb
        and payload #>> '{integrity,payload_hash}' = payload_hash
        and payload #>> '{integrity,signature_scheme}' = signature_scheme
        and payload #>> '{integrity,signing_key_id}' = signing_key_id
        and payload #>> '{integrity,signature}' = signature
        and payload #>> '{integrity,canonicalization}' = 'geomacro-canonical-json-1.0'
      ) is true
    )
);


create index if not exists
  webhook_event_outbox_client_created_idx
on public.webhook_event_outbox (
  client_id,
  created_at desc
);


create index if not exists
  webhook_event_outbox_type_created_idx
on public.webhook_event_outbox (
  event_type,
  created_at desc
);


-- Signed event rows are source evidence. Future delivery-attempt state belongs
-- in a separate delivery table so the signed envelope itself remains immutable.
create or replace function
  public.prevent_webhook_event_outbox_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'Webhook event outbox records are immutable';
end;
$$;


create trigger
  webhook_event_outbox_immutable
before update or delete
on public.webhook_event_outbox
for each row
execute function
  public.prevent_webhook_event_outbox_mutation();


-- ---------------------------------------------------------------------------
-- RLS / privilege hardening
-- ---------------------------------------------------------------------------

alter table public.webhook_event_outbox
  enable row level security;

revoke all
on table public.webhook_event_outbox
from PUBLIC, anon, authenticated;

grant all
on table public.webhook_event_outbox
to service_role;


comment on table public.webhook_event_outbox is
  'Immutable signed structured webhook event source. No outbound network delivery is performed by this table or migration.';
