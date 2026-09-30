import { timingSafeEqual } from "node:crypto";

import { apiCredentialDigest } from "./api-credential-hash.server";
import {
  designPartnerPilotCommercialAccess,
  paidX402CommercialAccess,
} from "./risk-gate-commercial-access";
import { handleIdempotentExternalRiskGateRequest } from "./risk-gate-idempotency.server";
import { requireRiskSupabase } from "./risk-supabase.server";

type CommercialClientRow = {
  client_id: string;
  api_key_hash: string;
  enabled: boolean;
  access_tier: "design_partner_pilot" | "private_pilot" | "paid_x402";
  quota_class: "limited_free_quota" | "commercial";
  daily_request_limit: number | null;
};

type DailyLimitRow = {
  allowed: boolean;
  request_count: number;
  limit_count: number;
  usage_day: string;
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? "";
  return token.length >= 32 && token.length <= 512 ? token : null;
}

function secureHashEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function identifyCommercialClient(request: Request): Promise<CommercialClientRow | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const digest = apiCredentialDigest(token, "risk-gate-bearer");
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("risk_gate_api_clients")
    .select("client_id,api_key_hash,enabled,access_tier,quota_class,daily_request_limit")
    .eq("api_key_hash", digest)
    .maybeSingle();

  if (error || !data) return null;
  const client = data as CommercialClientRow;
  if (!client.enabled || !secureHashEqual(client.api_key_hash, digest)) return null;
  return client;
}

async function consumeDailyQuota(client: CommercialClientRow): Promise<DailyLimitRow | null> {
  if (client.daily_request_limit == null) return null;

  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("consume_risk_gate_daily_limit", {
    p_client_id: client.client_id,
    p_limit: client.daily_request_limit,
  });

  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error("Risk Gate daily quota backend is unavailable");
  }

  return data[0] as DailyLimitRow;
}

function quotaExceeded(row: DailyLimitRow): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: "DAILY_PILOT_QUOTA_EXCEEDED",
        message: "The Design Partner pilot daily quota has been reached. Contact Geomacro for paid options or a higher agreed limit.",
      },
      commercial_access: designPartnerPilotCommercialAccess(),
      execution_authorized: false,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Geomacro-Daily-Limit": String(row.limit_count),
        "X-Geomacro-Daily-Remaining": "0",
      },
    },
  );
}

async function attachCommercialAccess(
  response: Response,
  client: CommercialClientRow | null,
): Promise<Response> {
  if (!client || response.status < 200 || response.status > 299) return response;
  if (client.access_tier === "private_pilot") return response;

  let body: Record<string, unknown>;
  try {
    body = await response.clone().json() as Record<string, unknown>;
  } catch {
    return response;
  }

  const commercialAccess =
    client.access_tier === "design_partner_pilot"
      ? designPartnerPilotCommercialAccess()
      : paidX402CommercialAccess();

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Geomacro-Access-Tier", client.access_tier);

  return Response.json(
    {
      ...body,
      commercial_access: commercialAccess,
    },
    {
      status: response.status,
      headers,
    },
  );
}

/**
 * Commercial delivery boundary for the external Risk Gate.
 * Design-partner traffic is bounded by the configured daily cap without
 * changing the canonical risk methodology. Paid x402 clients reuse the same
 * response envelope with commercial semantics.
 */
export async function handleCommercialExternalRiskGateRequest(
  request: Request,
): Promise<Response> {
  const client = await identifyCommercialClient(request);

  if (client?.access_tier === "design_partner_pilot") {
    let daily: DailyLimitRow | null;
    try {
      daily = await consumeDailyQuota(client);
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "DAILY_QUOTA_BACKEND_UNAVAILABLE",
            message: "The Design Partner pilot quota check is unavailable. Retry later.",
          },
          commercial_access: designPartnerPilotCommercialAccess(),
          execution_authorized: false,
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }

    if (daily && !daily.allowed) return quotaExceeded(daily);
  }

  const response = await handleIdempotentExternalRiskGateRequest(request);
  return attachCommercialAccess(response, client);
}
