import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireRiskSupabase } from "../lib/risk-supabase.server";

const MAX_BODY_BYTES = 6 * 1024;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_FEEDBACK_PER_WINDOW = 10;
const buckets = new Map<string, { startedAt: number; count: number }>();

const feedbackSchema = z.object({
  request_id: z.string().uuid().nullable().optional(),
  demo_mode: z.enum(["PUBLIC_SANDBOX", "X402_PAID", "OTHER"]).default("PUBLIC_SANDBOX"),
  tester_type: z.enum(["builder", "agent_project", "institution", "researcher", "other"]),
  rating: z.number().int().min(1).max(5),
  would_integrate: z.boolean().nullable().optional(),
  outcome: z.enum(["worked", "partly_worked", "blocked", "exploring"]),
  most_valuable: z.string().trim().max(1000).optional(),
  friction: z.string().trim().max(2000).optional(),
  missing_capability: z.string().trim().max(1000).optional(),
});

function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function allowRequest(request: Request) {
  const key = clientKey(request);
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_FEEDBACK_PER_WINDOW;
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (
      url.origin === "https://geomacro.live" ||
      url.origin === "https://www.geomacro.live" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api/demo/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!allowedOrigin(request)) {
          return json({ ok: false, error: "Feedback origin is not allowed." }, 403);
        }
        if (!allowRequest(request)) {
          return json({ ok: false, error: "Feedback limit exceeded. Try again later." }, 429);
        }

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return json({ ok: false, error: "Content-Type must be application/json." }, 415);
        }

        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
          return json({ ok: false, error: "Feedback body is too large." }, 413);
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(raw);
        } catch {
          return json({ ok: false, error: "Feedback body is not valid JSON." }, 400);
        }

        const parsed = feedbackSchema.safeParse(parsedJson);
        if (!parsed.success) {
          return json(
            {
              ok: false,
              error: "Feedback fields are invalid.",
              issues: parsed.error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
            400,
          );
        }

        try {
          const db = requireRiskSupabase();
          const { error } = await db.from("agentic_demo_feedback").insert({
            request_id: parsed.data.request_id ?? null,
            demo_mode: parsed.data.demo_mode,
            tester_type: parsed.data.tester_type,
            rating: parsed.data.rating,
            would_integrate: parsed.data.would_integrate ?? null,
            outcome: parsed.data.outcome,
            most_valuable: parsed.data.most_valuable || null,
            friction: parsed.data.friction || null,
            missing_capability: parsed.data.missing_capability || null,
          });

          if (error) throw error;
          return json({
            ok: true,
            message: "Thanks. This feedback is stored without your IP address or wallet address.",
          });
        } catch (error) {
          console.error("[agentic-demo] feedback persistence failed", error);
          return json({ ok: false, error: "Feedback could not be saved right now." }, 503);
        }
      },
    },
  },
});