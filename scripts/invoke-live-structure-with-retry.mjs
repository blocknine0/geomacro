const baseUrl = (process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL || "").replace(/\/$/, "");
const token = process.env.LIVE_STRUCTURE_TOKEN || "";
const requestedFragmentId = String(process.env.LIVE_STRUCTURE_FRAGMENT_ID || "").trim();

const maxAttempts = Number.parseInt(process.env.LIVE_STRUCTURE_MAX_ATTEMPTS || "4", 10);
const timeoutMs = Number.parseInt(process.env.LIVE_STRUCTURE_ATTEMPT_TIMEOUT_MS || "90000", 10);
const retryableStatus = new Set([408, 425, 429, 500, 502, 503, 504]);
const backoffMs = [0, 2000, 5000, 10000];

if (!baseUrl || !token) {
  console.error("Live structure invocation requires SUPABASE_URL/APP_SUPABASE_URL and LIVE_STRUCTURE_TOKEN.");
  process.exit(2);
}

if (requestedFragmentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedFragmentId)) {
  console.error("LIVE_STRUCTURE_FRAGMENT_ID must be a UUID when provided.");
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
const requestBody = requestedFragmentId
  ? JSON.stringify({ fragment_id: requestedFragmentId })
  : "{}";

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
      body: requestBody,
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
        const returnedFragmentId = typeof payload.fragment_id === "string"
          ? payload.fragment_id.trim()
          : "";

        if (
          requestedFragmentId &&
          payload.status !== "nothing_new" &&
          returnedFragmentId !== requestedFragmentId
        ) {
          console.error(
            `Structured-intelligence target mismatch: requested ${requestedFragmentId}, returned ${returnedFragmentId || "missing"}.`,
          );
          process.exit(8);
        }

        if (requestedFragmentId && payload.has_more === true) {
          console.error(
            `Targeted structured-intelligence fragment ${requestedFragmentId} still has unprocessed records after one bounded batch.`,
          );
          process.exit(9);
        }

        console.log(JSON.stringify({
          ok: true,
          status: response.status,
          structure_status: payload.status ?? null,
          attempt,
          requested_fragment_id: requestedFragmentId || null,
          fragment_id: returnedFragmentId || null,
          evidence_structured: payload.evidence_structured ?? null,
          evidence_excluded: payload.evidence_excluded ?? null,
          events_created: payload.events_created ?? null,
          events_updated: payload.events_updated ?? null,
          handled_before: payload.handled_before ?? null,
          handled_after: payload.handled_after ?? null,
          fragment_total: payload.fragment_total ?? null,
          remaining: payload.remaining ?? null,
          has_more: payload.has_more ?? null,
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
