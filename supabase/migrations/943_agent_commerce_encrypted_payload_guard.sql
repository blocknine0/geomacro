-- =============================================================================
-- Agent commerce encrypted prepared-payload guard
--
-- New prepared responses must be application-encrypted before they are written
-- to the durable replay ledger. Existing historical rows are not rewritten by
-- this migration, but the application refuses plaintext replay.
-- =============================================================================

create or replace function public.prepare_agent_commerce_delivery(
  p_provider text,
  p_provider_environment text,
  p_payment_fingerprint text,
  p_claim_token uuid,
  p_response_payload jsonb,
  p_response_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if
    p_response_payload is null
    or p_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_response_payload->>'schema_version' <> 'geomacro.agent-commerce.encrypted-payload.v1'
    or p_response_payload->>'algorithm' <> 'aes-256-gcm'
    or coalesce(char_length(p_response_payload->>'key_id'), 0) < 1
    or coalesce(char_length(p_response_payload->>'key_id'), 0) > 96
    or coalesce(char_length(p_response_payload->>'iv_b64'), 0) < 12
    or coalesce(char_length(p_response_payload->>'tag_b64'), 0) < 16
    or coalesce(char_length(p_response_payload->>'ciphertext_b64'), 0) < 1
    or coalesce(p_response_payload->>'plaintext_sha256', '') !~ '^[0-9a-f]{64}$'
    or p_response_payload->>'plaintext_sha256' <> p_response_sha256
  then
    return false;
  end if;

  update public.agent_commerce_deliveries d
  set
    state = 'prepared',
    response_payload = p_response_payload,
    response_sha256 = p_response_sha256,
    updated_at = now(),
    lease_expires_at = now() + interval '5 minutes'
  where
    d.provider = p_provider
    and d.provider_environment = p_provider_environment
    and d.payment_fingerprint_sha256 = p_payment_fingerprint
    and d.claim_token = p_claim_token
    and d.state in ('processing','prepared');

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.prepare_agent_commerce_delivery(text,text,text,uuid,jsonb,text)
  from PUBLIC, anon, authenticated;
grant execute on function public.prepare_agent_commerce_delivery(text,text,text,uuid,jsonb,text)
  to service_role;
