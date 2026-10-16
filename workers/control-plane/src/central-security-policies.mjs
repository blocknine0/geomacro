// Same server-owned limits in Nitro and the authenticated D1 budget service.
export const CENTRAL_SECURITY_POLICIES = {
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
