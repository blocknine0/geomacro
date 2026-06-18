import process from "node:process";

/**
 * Call Groq chat completions with JSON response_format.
 * Server-only — requires GROQ_API_KEY.
 */
export async function groqClassifyJson<T>(args: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
}): Promise<T> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
  });
  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Groq: empty response");
  return JSON.parse(text) as T;
}