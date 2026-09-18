import { createClient } from "npm:@supabase/supabase-js@2";

const PIPELINE_KEY = "gdelt_gal_native_pipeline";
const LEASE_TTL_SECONDS = 480;
const STRUCTURE_PASSES = 3;

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

function getAdminClient() {
  const url = requiredEnv("SUPABASE_URL");
  const secretMapRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let secret: string | undefined;
  if (secretMapRaw) {
    const parsed = JSON.parse(secretMapRaw);
    secret = typeof parsed?.default === "string" ? parsed.default : undefined;
  }
  secret ||= legacy ?? undefined;
  if (!secret) throw new Error("supabase_backend_secret_missing");

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function parseJsonResponse(response: Response, label: string) {
  const text = await response.text();
  let body: JsonRecord = {};

  if (text.trim()) {
    try {
      body = JSON.parse(text) as JsonRecord;
    } catch {
      throw new Error(`${label}_returned_non_json_http_${response.status}`);
    }
  }

  if (!response.ok || body.ok !== true) {
    const error = typeof body.error === "string" ? body.error : `http_${response.status}`;
    throw new Error(`${label}_failed:${error}`);
  }

  return body;
}

async function invokeInternalFunction(input: {
  projectUrl: string;
  functionName: string;
  headerName: string;
  token: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await fetch(
      `${input.projectUrl.replace(/\/$/, "")}/functions/v1/${input.functionName}`,
      {
        method: "POST",
        headers: {
          [input.headerName]: input.token,
          "content-type": "application/json",
          "user-agent": "Geomacro-Native-GDELT-Scheduler/1.0",
        },
        body: "{}",
        signal: controller.signal,
      },
    );

    return await parseJsonResponse(response, input.functionName);
  } finally {
    clearTimeout(timeout);
  }
}

function compactInternalResult(body: JsonRecord) {
  const allowed = [
    "status",
    "last_source_stamp",
    "latest_source_stamp",
    "files_seen",
    "source_files",
    "items_seen",
    "relevant_candidates",
    "accepted",
    "items_accepted",
    "fragments_considered",
    "fragments_processed",
    "evidence_rows",
    "event_rows",
    "events_created",
    "events_updated",
  ];

  return Object.fromEntries(
    allowed
      .filter((key) => body[key] !== undefined)
      .map((key) => [key, body[key]]),
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST_required" }, 405);
  }

  const supabase = getAdminClient();
  const suppliedSchedulerToken = req.headers
    .get("x-geomacro-scheduler-token")
    ?.trim();

  if (!suppliedSchedulerToken) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const { data: schedulerAuthorized, error: schedulerAuthError } = await supabase.rpc(
    "verify_gdelt_pipeline_scheduler_token",
    { p_token: suppliedSchedulerToken },
  );

  if (schedulerAuthError || schedulerAuthorized !== true) {
    console.warn("GDELT scheduler authentication rejected", {
      rpc_error: schedulerAuthError?.message ?? null,
    });
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const leaseId = crypto.randomUUID();
  const { data: acquired, error: acquireError } = await supabase.rpc(
    "acquire_gdelt_native_pipeline_lease",
    {
      p_lease_id: leaseId,
      p_ttl_seconds: LEASE_TTL_SECONDS,
    },
  );

  if (acquireError) {
    console.error("GDELT scheduler lease acquisition failed", acquireError);
    return jsonResponse({ ok: false, error: "lease_acquisition_failed" }, 503);
  }

  if (acquired !== true) {
    return jsonResponse({
      ok: true,
      status: "lease_held",
      pipeline_key: PIPELINE_KEY,
      writes_performed: false,
    });
  }

  let released = false;

  try {
    const projectUrl = requiredEnv("SUPABASE_URL");
    const ingestToken = requiredEnv("LIVE_INGEST_TOKEN");
    const structureToken = requiredEnv("LIVE_STRUCTURE_TOKEN");

    const ingest = await invokeInternalFunction({
      projectUrl,
      functionName: "live-gdelt-ingest",
      headerName: "x-geomacro-ingest-token",
      token: ingestToken,
    });

    const structureResults: JsonRecord[] = [];
    for (let pass = 0; pass < STRUCTURE_PASSES; pass += 1) {
      structureResults.push(
        await invokeInternalFunction({
          projectUrl,
          functionName: "live-structure-intelligence",
          headerName: "x-geomacro-structure-token",
          token: structureToken,
        }),
      );
    }

    const { data: rightsRowsChanged, error: rightsError } = await supabase.rpc(
      "reconcile_live_structured_event_commercial_rights",
    );
    if (rightsError) throw new Error(`rights_reconcile_failed:${rightsError.message}`);

    const { data: releaseResult, error: releaseError } = await supabase.rpc(
      "release_gdelt_native_pipeline_lease",
      {
        p_lease_id: leaseId,
        p_succeeded: true,
        p_error: null,
      },
    );
    if (releaseError || releaseResult !== true) {
      throw new Error(`lease_release_failed:${releaseError?.message ?? "not_released"}`);
    }
    released = true;

    return jsonResponse({
      ok: true,
      status: "completed",
      pipeline_key: PIPELINE_KEY,
      scheduler: "supabase_pg_cron_pg_net",
      cadence_minutes: 10,
      ingestion: compactInternalResult(ingest),
      structure_passes: structureResults.map(compactInternalResult),
      rights_rows_changed: Number(rightsRowsChanged ?? 0),
      raw_source_material_redistributed: false,
      public_alert_activation: false,
      commercial_signal_activation: false,
      payment_or_mainnet_activation: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Scheduled GDELT pipeline failed", { error: message });

    if (!released) {
      const { error: releaseError } = await supabase.rpc(
        "release_gdelt_native_pipeline_lease",
        {
          p_lease_id: leaseId,
          p_succeeded: false,
          p_error: message,
        },
      );
      if (releaseError) {
        console.error("Failed to release GDELT pipeline lease after error", releaseError);
      }
    }

    return jsonResponse(
      {
        ok: false,
        status: "failed",
        pipeline_key: PIPELINE_KEY,
        error: message.slice(0, 500),
        public_alert_activation: false,
        commercial_signal_activation: false,
        payment_or_mainnet_activation: false,
      },
      500,
    );
  }
});
