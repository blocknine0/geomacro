const API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_PIPELINE = "intelligence_orchestrator";
const KEY_RE = /^[a-z0-9][a-z0-9_.:-]{1,127}$/;

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`D1_CONTROL_STATE_${name}_REQUIRED`);
  return value;
}

function safeKey(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!KEY_RE.test(normalized)) throw new Error(`D1_CONTROL_STATE_${label}_INVALID`);
  return normalized;
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function createD1ControlPlaneStateClient({ pipeline = DEFAULT_PIPELINE } = {}) {
  const accountId = required("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = required("CLOUDFLARE_API_TOKEN");
  const databaseId = required("D1_DATABASE_ID");
  const safePipeline = safeKey(pipeline, "PIPELINE");
  const endpoint = `${API_BASE}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;

  async function query(sql, params = []) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok || payload?.success !== true) {
      const code = String(payload?.errors?.[0]?.code ?? response.status ?? "unknown");
      throw new Error(`D1_CONTROL_STATE_QUERY_FAILED:${code}`);
    }
    const batch = Array.isArray(payload.result) ? payload.result[0] : payload.result;
    if (!batch || batch.success === false) {
      throw new Error("D1_CONTROL_STATE_QUERY_RESULT_INVALID");
    }
    return Array.isArray(batch.results) ? batch.results : [];
  }

  async function loadRows() {
    const rows = await query(
      `SELECT scope,status,last_attempt_at,last_success_at,cursor,metadata_json,updated_at
       FROM pipeline_checkpoint
       WHERE pipeline = ?`,
      [safePipeline],
    );
    return new Map(rows.map((row) => {
      const scope = safeKey(row.scope, "SCOPE");
      const metadata = parseJson(row.metadata_json, {});
      const cursor = parseJson(row.cursor, {});
      return [scope, {
        source_id: `orchestrator:${scope}`,
        payload: {
          ...metadata,
          source: "geomacro_intelligence_orchestrator",
          task: scope,
          cursor,
        },
        last_attempt_at: row.last_attempt_at ?? null,
        last_success_at: row.last_success_at ?? null,
        updated_at: row.updated_at ?? null,
      }];
    }));
  }

  async function persist(scope, state, update = {}) {
    const safeScope = safeKey(scope, "SCOPE");
    const cursor = {
      ...(state?.cursor ?? {}),
      ...(update?.cursor ?? {}),
    };
    const metadata = {
      ...state,
      ...(update?.payload ?? {}),
      source: "geomacro_intelligence_orchestrator",
      task: safeScope,
    };
    delete metadata.cursor;
    const status = String(cursor.status ?? (update?.last_success_at ? "healthy" : "pending"))
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "_")
      .slice(0, 64) || "PENDING";
    const lastAttemptAt = update?.last_attempt_at ?? null;
    const lastSuccessAt = update?.last_success_at ?? null;
    const updatedAt = new Date().toISOString();

    await query(
      `INSERT INTO pipeline_checkpoint
        (pipeline,scope,status,last_attempt_at,last_success_at,cursor,metadata_json,updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(pipeline,scope) DO UPDATE SET
        status=excluded.status,
        last_attempt_at=excluded.last_attempt_at,
        last_success_at=excluded.last_success_at,
        cursor=excluded.cursor,
        metadata_json=excluded.metadata_json,
        updated_at=excluded.updated_at`,
      [
        safePipeline,
        safeScope,
        status,
        lastAttemptAt,
        lastSuccessAt,
        JSON.stringify(cursor),
        JSON.stringify(metadata),
        updatedAt,
      ],
    );

    return {
      ...metadata,
      cursor,
    };
  }

  return { loadRows, persist };
}
