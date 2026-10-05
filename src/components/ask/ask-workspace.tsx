import { useCallback, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUp, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/foundation/async-states";
import type { AskAnswer } from "@/lib/ask-geomacro.functions";
import { reportError, type UserError } from "@/lib/user-errors";
import {
  PUBLIC_ASK_REQUEST_TIMEOUT_MS,
  withPublicRuntimeTimeout,
} from "@/lib/public-runtime-timeout";

const SUGGESTIONS = [
  "What changed today?",
  "What is driving geopolitical risk?",
  "What is driving macro risk?",
  "What is changing in critical minerals?",
] as const;

const MAX_LEN = 300;
const MAX_VISIBLE_TURNS = 12;

type PublicAskResponse =
  | { ok: true; data: AskAnswer }
  | { ok: false; error?: { code?: string; message?: string } };

type ChatTurn = {
  id: number;
  question: string;
  answer: AskAnswer;
};

async function requestPublicAsk(question: string): Promise<AskAnswer> {
  const response = await fetch("/api/public-ask", {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Geomacro-Question": question.slice(0, MAX_LEN),
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

  return payload.data;
}

export function AskWorkspace() {
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [asked, setAsked] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UserError | null>(null);
  const seq = useRef(0);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || question.length < 4 || loading) return;

      const id = ++seq.current;
      setLoading(true);
      setError(null);
      setAsked(question);
      setPendingQuestion(question);
      setQuery("");

      try {
        const result = await withPublicRuntimeTimeout(
          requestPublicAsk(question),
          PUBLIC_ASK_REQUEST_TIMEOUT_MS,
          "Ask Geomacro request timed out.",
        );
        if (seq.current === id) {
          setTurns((current) => [
            ...current.slice(-(MAX_VISIBLE_TURNS - 1)),
            { id, question, answer: result },
          ]);
        }
      } catch (err) {
        if (seq.current === id) {
          setError(reportError("ask-geomacro", err, "research query"));
        }
      } finally {
        if (seq.current === id) {
          setPendingQuestion(null);
          setLoading(false);
        }
      }
    },
    [loading],
  );

  const canSubmit = query.trim().length >= 4 && !loading;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-12">
      <header className="mx-auto max-w-3xl text-center">
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified risk intelligence
          </span>
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Ask Geomacro</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Ask one clear question. Geomacro answers the point you asked, using verified risk context and approved intelligence evidence.
        </p>
      </header>

      <section className="mx-auto mt-8 max-w-3xl">
        <div role="log" aria-live="polite" className="space-y-7">
          {turns.length === 0 && !pendingQuestion && !error ? (
            <div className="rounded-2xl border border-border/70 bg-card/35 p-5 sm:p-6">
              <p className="text-sm font-medium text-foreground">Ask about geopolitical, macroeconomic or critical-mineral risk.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={loading}
                    onClick={() => void ask(suggestion)}
                    className="rounded-full border border-border/70 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-4">
              <UserBubble>{turn.question}</UserBubble>
              <AssistantAnswer answer={turn.answer} />
            </div>
          ))}

          {pendingQuestion ? (
            <div className="space-y-4">
              <UserBubble>{pendingQuestion}</UserBubble>
              <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking verified evidence…
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="space-y-3">
              {asked && !pendingQuestion ? <UserBubble>{asked}</UserBubble> : null}
              <ErrorState
                title="Ask Geomacro unavailable"
                error={error}
                onRetry={asked ? () => void ask(asked) : undefined}
              />
            </div>
          ) : null}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(query);
          }}
          className="mt-8 rounded-2xl border border-border/80 bg-card/70 p-2 shadow-sm"
        >
          <label htmlFor="ask-geomacro-input" className="sr-only">
            Ask Geomacro a question
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="ask-geomacro-input"
              value={query}
              maxLength={MAX_LEN}
              disabled={loading}
              rows={1}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (canSubmit) void ask(query);
                }
              }}
              placeholder="Ask Geomacro…"
              className="min-h-12 max-h-40 flex-1 resize-y bg-transparent px-3 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              className="mb-0.5 h-10 w-10 shrink-0 rounded-xl"
              disabled={!canSubmit}
              aria-label="Send question"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] leading-5 text-muted-foreground">
          <span>Direct answers only · Shift+Enter for a new line</span>
          <span>
            <Link to="/intelligence" className="hover:text-foreground">Intelligence</Link>
            {" · "}
            <Link to="/global-risk" className="hover:text-foreground">Risk Indices</Link>
          </span>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-5 text-muted-foreground">
          Raw source content, provider details and internal retrieval payloads are not exposed in the answer.
        </p>
      </section>
    </main>
  );
}

function UserBubble({ children }: { children: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] break-words rounded-2xl rounded-br-md bg-muted px-4 py-3 text-sm leading-6 text-foreground sm:max-w-[78%]">
        {children}
      </div>
    </div>
  );
}

function AssistantAnswer({ answer }: { answer: AskAnswer }) {
  const evidence = answer.evidence.slice(0, 5);
  const evidenceLabel = answer.data_mode === "permanent" ? "Verified context" : "Live checked";

  return (
    <div className="max-w-2xl min-w-0 break-words px-1">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
        <span>Geomacro</span>
        <span className="text-muted-foreground">· {evidenceLabel}</span>
        {answer.low_confidence ? <span className="text-muted-foreground">· Limited confidence</span> : null}
      </div>
      <p className="mt-2 text-[15px] leading-7 text-foreground sm:text-base">{answer.summary}</p>

      {evidence.length > 0 ? (
        <details className="mt-3 rounded-xl border border-border/60 bg-card/25 px-3 py-2">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
            Evidence ({evidence.length})
          </summary>
          <ul className="mt-3 space-y-2 border-t border-border/60 pt-3">
            {evidence.map((item) => (
              <li key={item.eventId} className="text-xs leading-5 text-muted-foreground">
                {isNavigableEvidence(item.eventId) ? (
                  <Link
                    to="/event/$eventId"
                    params={{ eventId: item.eventId }}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <span>{item.title}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {answer.insufficient_evidence ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Geomacro will not fill an evidence gap with a synthetic claim.
        </p>
      ) : null}
    </div>
  );
}

function isNavigableEvidence(eventId: string) {
  return !eventId.startsWith("live:") && !eventId.startsWith("web:");
}
