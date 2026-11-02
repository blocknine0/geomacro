// Staging-only Worker entrypoint; deliberately no live data ingestion or checkout.
// Deployment is a separate owner-approved step, and does not mutate production.
const json = (body, status = 200) => Response.json(body, {
  status,
  headers: {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/_health") {
      return json({
        ok: false,
        code: "STAGING_ENDPOINT_NOT_ACTIVATED",
        risk_gate_active: false,
        source_sync_active: false,
        payment_active: false
      }, 503);
    }

    // Only this staging D1 binding may be used. No access to canonical D1.
    if (!env?.RC_STAGING_D1?.prepare) {
      return json({
        ok: false, code: "STAGING_D1_BINDING_MISSING",
        source_sync_active: false, payment_active: false
      }, 503);
    }
    try {
      const row = await env.RC_STAGING_D1.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='gm_rc_requests' LIMIT 1"
      ).first();
      if (row?.name !== "gm_rc_requests") {
        return json({ok: false, code: "STAGING_D1_SCHEMA_MISSING",
          source_sync_active: false, payment_active: false}, 503);
      }
      return json({
        ok: true,
        service: "geomacro-rc-staging",
        staging_d1_schema_readback: "VERIFIED",
        source_sync_active: false,
        risk_gate_active: false,
        payment_active: false,
        supabase_connected: false
      });
    } catch {
      return json({
        ok: false, code: "STAGING_D1_READ_FAILED",
        source_sync_active: false, payment_active: false
      }, 503);
    }
  }
};
