import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { answerQuestion } from "../../../src/lib/ask-intelligence.server";
import { getAppSupabase } from "../../../src/lib/supabase-app.server";

const MAX_BODY_BYTES = 8 * 1024;

const WatchProbeInput = z.object({
  watch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  probe_index: z.number().int().min(0).max(999),
  category: z.enum(["geopolitics", "macro", "critical_minerals"]),
  mode: z.enum(["current", "historical"]),
  question: z.string().trim().min(4).max(300),
});

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requireWatchToken(suppliedValue: string | null | undefined) {
  const expected = String(process.env.GEOMACRO_PRODUCTION_WATCH_TOKEN ?? "").trim();
  const supplied = String(suppliedValue ?? "").trim();

  if (expected.length < 32 || supplied.length < 32) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const expectedHash = Buffer.from(sha256(expected), "hex");
  const suppliedHash = Buffer.from(sha256(supplied), "hex");
  if (!timingSafeEqual(expectedHash, suppliedHash)) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

function safeDate(value: string | null | undefined) {
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });

  requireWatchToken(getRequestHeader(event, "x-geomacro-production-watch-token"));

  const startedAt = Date.now();

  const rawBody = (await readRawBody(event)) ?? "";
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    setResponseStatus(event, 413);
    return {
      ok: false,
      error: {
        code: "WATCH_REQUEST_TOO_LARGE",
        message: "Watch probe request body is too large.",
      },
    };
  }

  let input: z.infer<typeof WatchProbeInput>;
  try {
    input = WatchProbeInput.parse(JSON.parse(rawBody));
  } catch {
    setResponseStatus(event, 400);
    return {
      ok: false,
      error: {
        code: "INVALID_WATCH_PROBE",
        message: "Watch probe fields are invalid.",
      },
    };
  }

  let answer;
  try {
    answer = await answerQuestion(input.question);
  } catch (error) {
    console.error("[production-watch] answer failed", error);
    setResponseStatus(event, 503);
    return {
      ok: false,
      error: {
        code: "PRODUCTION_WATCH_ANSWER_UNAVAILABLE",
        message: "Ask Geomacro could not produce a production answer.",
      },
      watch: {
        watch_date: input.watch_date,
        probe_index: input.probe_index,
        category: input.category,
        mode: input.mode,
        latency_ms: Date.now() - startedAt,
      },
    };
  }

  const evidenceIds = answer.evidence.map((item) => item.eventId);
  let evidenceTiming: Array<{
    event_id: string;
    published_at: string | null;
    created_at: string | null;
  }> = [];

  const db = getAppSupabase();
  if (db && evidenceIds.length > 0) {
    const { data, error } = await db
      .from("events")
      .select("id,published_at,created_at")
      .in("id", evidenceIds);

    if (!error && data) {
      evidenceTiming = data.map((row) => ({
        event_id: String(row.id),
        published_at: row.published_at ? String(row.published_at) : null,
        created_at: row.created_at ? String(row.created_at) : null,
      }));
    }
  }

  const now = Date.now();
  const eventTimes = evidenceTiming
    .map((row) => safeDate(row.published_at ?? row.created_at))
    .filter((value): value is Date => Boolean(value));

  const currentEvidenceCount = eventTimes.filter(
    (value) => now - value.getTime() <= 48 * 3_600_000,
  ).length;
  const historicalEvidenceCount = eventTimes.filter(
    (value) => now - value.getTime() > 7 * 24 * 3_600_000,
  ).length;

  return {
    ok: true,
    watch: {
      watch_date: input.watch_date,
      probe_index: input.probe_index,
      category: input.category,
      mode: input.mode,
      question_sha256: sha256(input.question),
      latency_ms: Date.now() - startedAt,
      evidence_count: answer.evidence.length,
      current_evidence_count: currentEvidenceCount,
      historical_evidence_count: historicalEvidenceCount,
      evidence_timing: evidenceTiming,
    },
    answer,
  };
});
