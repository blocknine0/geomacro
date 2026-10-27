// Same server-owned limits in Nitro and the authenticated D1 budget service.
export const CENTRAL_SECURITY_POLICIES = {
  // Strict globally shared D1 admission before EVERY direct historical
  // Supabase website fallback request. One 72-request daily pool across
  // server isolates, all users, and countries; denied reads never bypass.
  historical_supabase_fallback: {
    windowSeconds: 86400,
    perClient: 72,
    global: 72,
    maxBodyBytes: 0,
    distributed: true,
    failClosed: true,
  },
  // One purpose-scoped Predge research bearer, hard 500 GETs per UTC day.
  // Existing atomic D1 security-budget table; no new migration or cron.
  predge_research_news: {
    windowSeconds: 86400,
    perClient: 500,
    global: 500,
    maxBodyBytes: 0,
    distributed: true,
    failClosed: true,
  },
  public_api: {
    windowSeconds: 60,
    perClient: 240,
    global: 5000,
    maxBodyBytes: 128 * 1024,
    distributed: true,
    // Public read/proof surfaces remain available for diagnosis if the
    // privileged abuse-control store is temporarily unavailable. They still
    // receive the bounded in-process burst guard.
    failClosed: false,
  },
  api_write: {
    windowSeconds: 60,
    perClient: 60,
    global: 1200,
    maxBodyBytes: 64 * 1024,
    distributed: true,
    failClosed: true,
  },
  server_function: {
    windowSeconds: 60,
    perClient: 60,
    global: 1200,
    maxBodyBytes: 128 * 1024,
    distributed: true,
    failClosed: true,
  },
  risk_gate: {
    windowSeconds: 60,
    perClient: 90,
    global: 1500,
    maxBodyBytes: 32 * 1024,
    distributed: true,
    failClosed: true,
  },
  commercial: {
    windowSeconds: 60,
    perClient: 90,
    global: 1500,
    maxBodyBytes: 32 * 1024,
    distributed: true,
    failClosed: true,
  },
  payment: {
    windowSeconds: 60,
    perClient: 45,
    global: 900,
    maxBodyBytes: 32 * 1024,
    distributed: true,
    failClosed: true,
  },
  internal: {
    windowSeconds: 60,
    perClient: 30,
    global: 300,
    maxBodyBytes: 64 * 1024,
    distributed: true,
    failClosed: true,
  },
};
