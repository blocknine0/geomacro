begin;

-- Commercial eligibility must travel with structured intelligence instead of
-- being inferred later from provider names or public accessibility.
alter table public.live_structured_events
  add column if not exists commercial_eligibility_status text not null default 'UNVERIFIED'
    check (
      commercial_eligibility_status in (
        'VERIFIED',
        'DERIVED_ONLY',
        'UNVERIFIED',
        'INELIGIBLE'
      )
    ),
  add column if not exists commercial_eligibility_reason_codes text[] not null
    default array['commercial_source_eligibility_not_enforced']::text[];

create index if not exists live_structured_events_commercial_status_idx
  on public.live_structured_events(
    commercial_eligibility_status,
    last_seen_at desc
  );

comment on column public.live_structured_events.commercial_eligibility_status is
  'Fail-closed commercial rights state for this structured event. VERIFIED must be explicitly derived from reviewed source policy; DERIVED_ONLY permits only derived intelligence; UNVERIFIED/INELIGIBLE cannot auto-authorize Risk Gate continuation.';

comment on column public.live_structured_events.commercial_eligibility_reason_codes is
  'Machine-readable reasons supporting the structured event commercial eligibility state.';

commit;
