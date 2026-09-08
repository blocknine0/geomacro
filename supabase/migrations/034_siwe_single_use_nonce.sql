-- =============================================================================
-- Geomacro SIWE single-use nonce ledger
--
-- PURPOSE
-- - replace freshness-only SIWE replay protection with a one-time challenge
-- - persist only SHA-256(nonce), never the plaintext nonce
-- - atomically consume a valid challenge after signature verification
-- - keep the table and consume RPC server/service-role only
-- =============================================================================

create table if not exists public.siwe_login_nonces (
  nonce_hash text primary key,

  wallet_address text not null,

  issued_at_ms bigint not null,

  expires_at timestamptz not null,

  consumed_at timestamptz,

  created_at timestamptz not null
    default now(),

  constraint siwe_login_nonce_hash_check
    check (
      nonce_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint siwe_login_wallet_address_check
    check (
      wallet_address ~ '^0x[a-f0-9]{40}$'
    ),

  constraint siwe_login_issued_at_check
    check (
      issued_at_ms > 0
    ),

  constraint siwe_login_expiry_check
    check (
      expires_at > created_at
    )
);


create index if not exists
  siwe_login_nonces_expiry_idx
on public.siwe_login_nonces (
  expires_at
);


create index if not exists
  siwe_login_nonces_wallet_idx
on public.siwe_login_nonces (
  wallet_address,
  expires_at desc
);


create or replace function
  public.consume_siwe_login_nonce(
    p_nonce_hash text,
    p_wallet_address text,
    p_issued_at_ms bigint
  )
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumed integer := 0;
begin
  if
    p_nonce_hash is null
    or p_nonce_hash !~ '^[a-f0-9]{64}$'
    or p_wallet_address is null
    or lower(p_wallet_address) !~ '^0x[a-f0-9]{40}$'
    or p_issued_at_ms is null
    or p_issued_at_ms <= 0
  then
    return false;
  end if;

  update public.siwe_login_nonces nonce
  set
    consumed_at = now()
  where
    nonce.nonce_hash = p_nonce_hash
    and nonce.wallet_address = lower(p_wallet_address)
    and nonce.issued_at_ms = p_issued_at_ms
    and nonce.consumed_at is null
    and nonce.expires_at > now();

  get diagnostics
    v_consumed = row_count;

  return v_consumed = 1;
end;
$$;


alter table public.siwe_login_nonces
  enable row level security;

revoke all
on table public.siwe_login_nonces
from PUBLIC, anon, authenticated;

grant all
on table public.siwe_login_nonces
to service_role;

revoke all
on function public.consume_siwe_login_nonce(
  text,
  text,
  bigint
)
from PUBLIC, anon, authenticated;

grant execute
on function public.consume_siwe_login_nonce(
  text,
  text,
  bigint
)
to service_role;


comment on table public.siwe_login_nonces is
  'Server-only SIWE challenge ledger. Stores only nonce hashes and enforces one-time consumption.';

comment on function public.consume_siwe_login_nonce(text, text, bigint) is
  'Atomically consumes one unexpired SIWE nonce after wallet signature verification. Returns false for replay, expiry or mismatch.';
