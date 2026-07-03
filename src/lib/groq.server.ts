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

/**
 * Call Groq chat completions with JSON response_format.
 * Server-only — requires GROQ_API_KEY.
 */
export async function groqClassifyJson<T>(args: {
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