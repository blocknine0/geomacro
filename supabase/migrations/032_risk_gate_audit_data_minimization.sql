-- =============================================================================
-- Geomacro Risk Gate audit data minimization
--
-- PURPOSE
-- Keep the immutable commercial audit trail while avoiding unnecessary
-- retention of customer-supplied action metadata, destinations, amounts and
-- full policy thresholds.
--
-- IMPORTANT
-- - request_hash remains the SHA-256 hash calculated from the complete request
--   before insert, preserving request-integrity evidence.
-- - decision/policy/subject/methodology fields already have dedicated columns.
-- - request_payload becomes a deliberately minimized summary on NEW rows.
-- - historical immutable audit rows are not rewritten by this migration.
-- =============================================================================

create or replace function
  public.minimize_risk_gate_audit_request_payload()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_request jsonb;
  v_subject jsonb;
  v_policy jsonb;
  v_action jsonb;
begin
  v_request :=
    coalesce(
      new.request_payload,
      '{}'::jsonb
    );

  if jsonb_typeof(v_request) <> 'object' then
    new.request_payload :=
      jsonb_build_object(
        'redacted', true,
        'original_json_type',
          coalesce(
            jsonb_typeof(v_request),
            'null'
          )
      );

    return new;
  end if;

  -- Subject data is intentionally limited to the country/corridor identity
  -- required to reconcile the audit row. No arbitrary nested caller data is
  -- copied from the request.
  if jsonb_typeof(v_request -> 'subject') = 'object' then
    v_subject :=
      jsonb_strip_nulls(
        jsonb_build_object(
          'type',
            v_request #> '{subject,type}',
          'country_iso3',
            v_request #> '{subject,country_iso3}',
          'origin_country_iso3',
            v_request #> '{subject,origin_country_iso3}',
          'destination_country_iso3',
            v_request #> '{subject,destination_country_iso3}'
        )
      );
  else
    v_subject := null;
  end if;

  -- Customer policy thresholds can themselves be commercially sensitive.
  -- The immutable row already stores policy_id/policy_version as columns, so
  -- only those identifiers are retained in the JSON summary.
  if jsonb_typeof(v_request -> 'policy') = 'object' then
    v_policy :=
      jsonb_strip_nulls(
        jsonb_build_object(
          'policy_id',
            v_request #> '{policy,policy_id}',
          'policy_version',
            v_request #> '{policy,policy_version}'
        )
      );
  else
    v_policy := null;
  end if;

  -- Preserve only low-sensitivity structural facts about action context.
  -- Values for amount, destination and metadata are intentionally not stored.
  if jsonb_typeof(v_request -> 'action_context') = 'object' then
    v_action :=
      jsonb_strip_nulls(
        jsonb_build_object(
          'action_type',
            v_request #> '{action_context,action_type}',
          'currency',
            v_request #> '{action_context,currency}',
          'amount_present',
            to_jsonb(
              (v_request -> 'action_context') ? 'amount'
            ),
          'destination_present',
            to_jsonb(
              (v_request -> 'action_context') ? 'destination'
            ),
          'metadata_present',
            to_jsonb(
              (v_request -> 'action_context') ? 'metadata'
            )
        )
      );
  else
    v_action := null;
  end if;

  new.request_payload :=
    jsonb_strip_nulls(
      jsonb_build_object(
        'redacted', true,
        'request_id',
          v_request -> 'request_id',
        'country_iso3',
          v_request -> 'country_iso3',
        'subject',
          v_subject,
        'evaluated_at',
          v_request -> 'evaluated_at',
        'policy',
          v_policy,
        'action_context',
          v_action
      )
    );

  return new;
end;
$$;


drop trigger if exists
  risk_gate_audit_minimize_request
on public.risk_gate_audit_log;


create trigger
  risk_gate_audit_minimize_request
before insert
on public.risk_gate_audit_log
for each row
execute function
  public.minimize_risk_gate_audit_request_payload();


comment on function
  public.minimize_risk_gate_audit_request_payload()
is
  'Minimizes customer-supplied Risk Gate request payloads before immutable audit persistence while preserving the pre-insert full-request SHA-256 hash.';
