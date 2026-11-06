import pg from 'pg';
import { readFileSync } from 'node:fs';
// Explicit TLS verification. For local development only, set PG_LOCAL=true.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
// Strip driver URL SSL options so they cannot silently override our TLS policy.
const url = new URL(process.env.DATABASE_URL);
for (const name of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(name);
export const pool = new pg.Pool({
  connectionString: url.toString(), max: 10, connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  ssl: process.env.PG_LOCAL === 'true' ? false : {
    rejectUnauthorized: true,
    ...(process.env.PG_CA_FILE ? { ca: readFileSync(process.env.PG_CA_FILE, 'utf8') } : {}),
  },
});
pool.on('error', error => { console.error('Idle database connection failed:', error.code ?? 'UNKNOWN'); });
