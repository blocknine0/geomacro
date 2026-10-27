import type { AskAnswer } from "@/lib/ask-geomacro.functions";

const MAX_LEN = 300;

type PublicAskResponse =
  | { ok: true; data: AskAnswer; context?: { mode?: string; resolved_question?: string } }
  | { ok: false; error?: { code?: string; message?: string } };

export async function requestPublicAsk(
  question: string,
  previousQuestion?: string,
  signal?: AbortSignal,
): Promise<{ answer: AskAnswer; resolvedQuestion: string }> {
  const response = await fetch("/api/public-ask", {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
      "X-Geomacro-Question": question.slice(0, MAX_LEN),
      ...(previousQuestion ? { "X-Geomacro-Previous-Question": previousQuestion.slice(0, MAX_LEN) } : {}),
    },
    cache: "no-store",
    credentials: "same-origin",
  });

  const payload = (await response.json().catch(() => null)) as PublicAskResponse | null;
  if (!response.ok || !payload || payload.ok !== true) {
    const message =
      payload && payload.ok === false && payload.error?.message
        ? payload.error.message
        : `Ask Geomacro request failed (${response.status}).`;
    throw new Error(message);
  }

  const resolved = payload.context?.resolved_question;
  return {
    answer: payload.data,
    resolvedQuestion: typeof resolved === "string" && resolved.length > 0 && resolved.length <= MAX_LEN
      ? resolved
      : question,
  };
}

