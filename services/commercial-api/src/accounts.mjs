import { mintApiKey } from './metering.mjs';
// trustedAuthUser must be resolved from a verified Supabase Auth session on the
// server. Never accept a browser-supplied user_id as authentication.
export async function provisionAccount(pool, trustedAuthUser) {
  if (!trustedAuthUser?.id || trustedAuthUser.is_anonymous || !trustedAuthUser.email_confirmed_at)
    throw new Error('VERIFIED_NON_ANONYMOUS_ACCOUNT_REQUIRED');
  const { rows } = await pool.query('SELECT geomacro.provision_user($1,$2) AS account',
    [trustedAuthUser.id, trustedAuthUser.email ?? null]);
  return rows[0].account;
}
export async function createApiKey(pool, trustedUserId, label) {
  const key = mintApiKey();
  const { rows } = await pool.query('SELECT geomacro.create_api_key($1,$2,$3,$4) AS id',
    [trustedUserId, key.hash, key.prefix, label]);
  return { id: rows[0].id, api_key: key.secret, prefix: key.prefix };
  // Return over HTTPS exactly once. Do not log key.secret.
}
