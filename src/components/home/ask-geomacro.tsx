import { useCallback, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { HomeSection } from "@/components/home/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/foundation/async-states";
import { askGeomacro, type AskAnswer } from "@/lib/ask-geomacro.functions";
import { reportError, type UserError } from "@/lib/user-errors";

const SUGGESTIONS = [
  "Why is risk rising?",
  "What changed today?",
  "What are the biggest emerging risks?",
  "Why did the GRI change?",
] as const;

const MAX_LEN = 300;

/**
 * Public research surface grounded only in Geomacro's stored intelligence.
 * It is intentionally not presented as a general-purpose chatbot.
 */
export function AskGeomacroSection({ standalone = false }: { standalone?: boolean }) {
  const run = useServerFn(askGeomacro);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
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
      setAnswer(null);
      setAsked(question);

      try {
        const result = await run({ data: { question: question.slice(0, MAX_LEN) } });
        if (seq.current === id) setAnswer(result);
      } catch (err) {
        if (seq.current === id) {
          setError(reportError("ask-geomacro", err, "research query"));
        }
      } finally {
        if (seq.current === id) setLoading(false);
      }
    },
    [loading, run],
  );

  const canSubmit = query.trim().length >= 4 && !loading;

  return (
    <HomeSection
      id={standalone ? undefined : "ask-geomacro"}
      eyebrow="Grounded research"
      title="Ask Geomacro"
      subtitle="Ask geopolitical and macro risk questions using Geomacro's stored intelligence, evidence, confidence and canonical Global Risk Index."
      className={standalone ? "py-10 sm:py-14" : undefined}
    >
      <div className="rounded-2xl border border-border/70 bg-card/50 p-5 sm:p-6">
        <div className="mb-5 rounded-xl border border-border/60 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
          Answers are generated from Geomacro's scored event store. This surface does not perform external web search or silently add outside evidence.
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(query);
          }}
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div className="min-w-0">
            <label htmlFor="ask-geomacro-input" className="sr-only">
              Ask a question about global risk
            </label>
            <Input
              id="ask-geomacro-input"
              value={query}
              maxLength={MAX_LEN}
              disabled={loading}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Why is global risk rising?"
              className="h-11"
            />
          </div>
          <Button type="submit" className="gap-2" disabled={!canSubmit}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Search className="h-4 w-4" aria-hidden />
            )}
            {loading ? "Researching" : "Ask"}
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={loading}
              onClick={() => {
                setQuery(suggestion);
                void ask(suggestion);
              }}
              className="min-h-10 rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div role="status" aria-live="polite" className="mt-5 border-t border-border/60 pt-5">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Researching stored Geomacro intelligence…
            </p>
          ) : error ? (
            <ErrorState
              title="Research unavailable"
              error={error}
              onRetry={asked ? () => void ask(asked) : undefined}
            />
          ) : answer ? (
            <AnswerView answer={answer} />
          ) : (
            <p className="text-sm text-muted-foreground">
              If the stored evidence does not clear the relevance threshold, Geomacro will say so instead of forcing an interpretation.
            </p>
          )}
        </div>
      </div>
    </HomeSection>
  );
}

function AnswerView({ answer }: { answer: AskAnswer }) {
  if (answer.insufficient_evidence && answer.evidence.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Geomacro does not have enough relevant stored evidence to answer that confidently.
        </p>
        <p className="text-sm text-muted-foreground">
          {answer.what_changed}{" "}
          <Link to="/intelligence" className="text-primary underline-offset-4 hover:underline">
            Open Risk Intelligence
          </Link>
          .
        </p>
      </div>
    );
  }

  const meanPct =
    answer.mean_relevance !== null ? Math.round(answer.mean_relevance * 100) : null;

  return (
    <div className="space-y-5">
      <p className="text-base leading-relaxed text-foreground">{answer.summary}</p>
      <div className="grid gap-5 md:grid-cols-2">
        <Block label="What changed" body={answer.what_changed} />
        <Block label="Why it matters" body={answer.why_it_matters} />
      </div>

      {answer.low_confidence ? (
        <div className="rounded-xl border border-dashed border-border/70 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Geomacro interpretation withheld
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{answer.geomacro_view}</p>
        </div>
      ) : (
        <Block label="Geomacro view · interpretation" body={answer.geomacro_view} />
      )}

      {answer.evidence.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Evidence</p>
          <ul className="mt-3 space-y-3">
            {answer.evidence.map((evidence) => (
              <li key={evidence.eventId} className="rounded-xl border border-border/60 bg-background/25 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    to="/event/$eventId"
                    params={{ eventId: evidence.eventId }}
                    className="min-w-0 flex-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {evidence.title}
                  </Link>
                  <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {evidence.relevance}% relevance
                  </span>
                </div>
                <a
                  href={evidence.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Open source <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
        Stored evidence only{answer.gri !== null ? ` · Canonical GRI ${answer.gri}` : " · GRI unavailable"}
        {meanPct !== null ? ` · Mean relevance ${meanPct}%` : ""}. This is risk intelligence, not financial advice.
      </p>
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground/90">{body}</p>
    </div>
  );
}
