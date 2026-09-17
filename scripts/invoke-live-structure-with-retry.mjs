const baseUrl = (process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL || "").replace(/\/$/, "");
const token = process.env.LIVE_STRUCTURE_TOKEN || "";

const maxAttempts = Number.parseInt(process.env.LIVE_STRUCTURE_MAX_ATTEMPTS || "4", 10);
const timeoutMs = Number.parseInt(process.env.LIVE_STRUCTURE_ATTEMPT_TIMEOUT_MS || "90000", 10);
const retryableStatus = new Set([408, 425, 429, 500, 502, 503, 504]);
const backoffMs = [0, 2000, 5000, 10000];

if (!baseUrl || !token) {
  console.error("Live structure invocation requires SUPABASE_URL/APP_SUPABASE_URL and LIVE_STRUCTURE_TOKEN.");
  process.exit(2);
}

if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 6) {
  console.error("LIVE_STRUCTURE_MAX_ATTEMPTS must be an integer between 1 and 6.");
  process.exit(2);
}

if (!Number.isInteger(timeoutMs) || timeoutMs < 5000 || timeoutMs > 180000) {
  console.error("LIVE_STRUCTURE_ATTEMPT_TIMEOUT_MS must be between 5000 and 180000 milliseconds.");
  process.exit(2);
}

const endpoint = `${baseUrl}/functions/v1/live-structure-intelligence`;

function compactPublicBody(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  if (attempt > 1) {
    const delay = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)];
    console.log(`Retrying structured-intelligence handoff in ${delay}ms (attempt ${attempt}/${maxAttempts}).`);
    await sleep(delay);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-geomacro-structure-token": token,
      },
      body: "{}",
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (response.ok) {
      if (payload?.ok === true) {
        console.log(JSON.stringify({
          ok: true,
          status: response.status,
          attempt,
          fragments_considered: payload.fragments_considered ?? null,
          fragments_processed: payload.fragments_processed ?? null,
          evidence_rows: payload.evidence_rows ?? null,
          event_rows: payload.event_rows ?? null,
          events_created: payload.events_created ?? null,
          events_updated: payload.events_updated ?? null,
        }));
        process.exit(0);
      }

      console.error(
        `Structured-intelligence endpoint returned HTTP ${response.status} without the required ok=true contract.`,
      );
      process.exit(3);
    }

    const safeBody = compactPublicBody(text);
    console.error(
      `Structured-intelligence handoff returned HTTP ${response.status}${safeBody ? `: ${safeBody}` : ""}`,
    );

    if (!retryableStatus.has(response.status)) {
      console.error("Failure is non-transient; refusing to retry.");
      process.exit(4);
    }

    if (attempt === maxAttempts) {
      console.error(`Retryable structured-intelligence failure persisted after ${maxAttempts} attempts.`);
      process.exit(5);
    }
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    const message = isAbort
      ? `Structured-intelligence attempt exceeded ${timeoutMs}ms.`
      : `Structured-intelligence network invocation failed: ${compactPublicBody(error?.message || error)}`;
    console.error(message);

    if (attempt === maxAttempts) {
      console.error(`Network/timeout failure persisted after ${maxAttempts} attempts.`);
      process.exit(6);
    }
  } finally {
    clearTimeout(timeout);
  }
}

process.exit(7);
