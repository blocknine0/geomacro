import process from "node:process";

export class GroqError extends Error {
  code: string;
  status?: number;
  snippet?: string;
  constructor(code: string, message: string, opts?: { status?: number; snippet?: string }) {
    super(`${code}: ${message}`);
    this.code = code;
    this.status = opts?.status;
    this.snippet = opts?.snippet;
  }
}

const MAX_RATE_LIMIT_RETRIES = Number(process.env.GROQ_MAX_RETRIES ?? 4);
const BASE_BACKOFF_MS = 1500;
const MAX_BACKOFF_MS = 20_000; // ফ্রন্টএন্ড রিকোয়েস্ট, তাই ব্যাকফিল স্ক্রিপ্টের চেয়ে ছোট cap রাখা হলো — ইউজারকে বেশিক্ষণ আটকে রাখা যাবে না

/**
 * Call Groq chat completions with JSON response_format.
 * Server-only — requires GROQ_API_KEY.
 * 429 (rate limited) পেলে exponential backoff দিয়ে নিজে থেকেই retry করে —
 * এই একটা জায়গায় ফিক্স করা মানে agents.functions.ts, arena-judge.functions.ts,
 * live-feed.functions.ts — যে কেউ এই হেল্পার কল করে, সবাই সুরক্ষিত।
 */
export async function groqClassifyJson<T>(args: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await groqClassifyJsonOnce<T>(args);
    } catch (err) {
      const isRateLimited = err instanceof GroqError && err.code === "GROQ_RATE_LIMITED";
      if (!isRateLimited || attempt >= MAX_RATE_LIMIT_RETRIES) {
        throw err;
      }
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      const jitter = Math.random() * 400;
      attempt++;
      console.warn(`[groq] rate limited, retry ${attempt}/${MAX_RATE_LIMIT_RETRIES} in ${Math.round(backoff + jitter)}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }
}

async function groqClassifyJsonOnce<T>(args: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new GroqError("MISSING_GROQ_KEY", "GROQ_API_KEY not configured");

  const timeoutMs = args.timeoutMs ?? 25_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: args.model ?? "llama-3.3-70b-versatile",
        temperature: args.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      throw new GroqError("GROQ_TIMEOUT", `Request exceeded ${timeoutMs}ms`);
    }
    throw new GroqError("GROQ_NETWORK", (err as Error)?.message ?? "fetch failed");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const snippet = body.slice(0, 300);
    console.error("[groq] upstream error", { status: res.status, snippet });
    if (res.status === 401 || res.status === 403) {
      throw new GroqError("GROQ_AUTH", `Groq rejected the API key (${res.status})`, { status: res.status, snippet });
    }
    if (res.status === 429) {
      throw new GroqError("GROQ_RATE_LIMITED", "Groq is rate-limiting requests", { status: res.status, snippet });
    }
    if (res.status === 413 || res.status === 400) {
      throw new GroqError("GROQ_BAD_REQUEST", `Groq rejected the request (${res.status})`, { status: res.status, snippet });
    }
    throw new GroqError("GROQ_SERVER", `Groq upstream error ${res.status}`, { status: res.status, snippet });
  }

  let json: { choices?: Array<{ message?: { content?: string } }> };
  try {
    json = (await res.json()) as typeof json;
  } catch (err) {
    throw new GroqError("GROQ_BAD_JSON", "Could not parse Groq response envelope", {
      snippet: (err as Error)?.message,
    });
  }
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text) throw new GroqError("GROQ_EMPTY", "Groq returned an empty completion");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GroqError("GROQ_BAD_JSON", "Groq completion was not valid JSON", {
      snippet: text.slice(0, 300),
    });
  }
}
