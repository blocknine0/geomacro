import { useCallback, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ExternalLink,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/foundation/async-states";
import { askGeomacro, type AskAnswer } from "@/lib/ask-geomacro.functions";
import { reportError, type UserError } from "@/lib/user-errors";

const SUGGESTIONS = [
  "What changed today?",
  "Why did the GRI change?",
  "What are the biggest emerging risks?",
  "What is driving geopolitical risk?",
  "What is driving macro risk?",
  "What is changing in critical minerals?",
] as const;

const MAX_LEN = 300;

export function AskWorkspace() {
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
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <header className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            <Search className="h-3.5 w-3.5" /> Grounded research · Live
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Stored evidence + canonical GRI
          </span>
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Ask Geomacro</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
          Ask about current geopolitical, macro and critical-mineral risk. Geomacro searches its own stored intelligence, uses the same verified GRI shown elsewhere on the site, and exposes the evidence behind the answer.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          It does not search the open web at question time and it does not invent outside evidence when Geomacro's own record is weak.
        </p>
      </header>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 rounded-2xl border border-border/70 bg-card/50 p-5 sm:p-6">
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
                placeholder="Ask about current risk, a domain, or why the GRI moved"
                className="h-12"
              />
            </div>
            <Button type="submit" className="h-12 gap-2" disabled={!canSubmit}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Checking evidence" : "Ask"}
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

          <div role="status" aria-live="polite" className="mt-6 border-t border-border/60 pt-6">
            {loading ? (
              <div className="rounded-xl border border-border/60 bg-background/25 p-5">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking stored intelligence and the current GRI…
                </p>
              </div>
            ) : error ? (
              <ErrorState
                title="Research unavailable"
                error={error}
                onRetry={asked ? () => void ask(asked) : undefined}
              />
            ) : answer ? (
              <AnswerView answer={answer} question={asked} />
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 p-6">
                <p className="font-medium text-foreground">Start with a real risk question.</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Broad current-risk questions, GRI movement questions and domain-specific questions are handled differently so a general prompt is not forced through a narrow keyword match.
                </p>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">What it uses</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Stored Geomacro intelligence events</li>
              <li>Current verified GRI context</li>
              <li>Stored severity, confidence and movement</li>
              <li>Source links and event-level evidence</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Grounded by design</p>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Weak evidence stays weak evidence. Geomacro can withhold interpretation instead of filling gaps with uncited claims.
                </p>
              </div>
            </div>
          </div>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link to="/intelligence">Browse Risk Intelligence <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link to="/global-risk">Open Global Risk Index <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </aside>
      </section>
    </main>
  );
}

function AnswerView({ answer, question }: { answer: AskAnswer; question: string | null }) {
  if (answer.insufficient_evidence && answer.evidence.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-background/25 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Evidence threshold not met</p>
        <p className="mt-3 text-base font-medium text-foreground">
          Geomacro does not have enough relevant stored evidence to answer this confidently.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{answer.what_changed}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/intelligence">Open Risk Intelligence</Link>
          </Button>
          {question ? (
            <span className="self-center text-xs text-muted-foreground">Question: {question}</span>
          ) : null}
        </div>
      </div>
    );
  }

  const meanPct = answer.mean_relevance !== null ? Math.round(answer.mean_relevance * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Geomacro answer</p>
        <p className="mt-2 text-lg leading-7 text-foreground">{answer.summary}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Block label="What changed" body={answer.what_changed} />
        <Block label="Why it matters" body={answer.why_it_matters} />
      </div>

      {answer.low_confidence ? (
        <div className="rounded-xl border border-dashed border-border/70 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Interpretation withheld</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer.geomacro_view}</p>
        </div>
      ) : (
        <Block label="Geomacro view · interpretation" body={answer.geomacro_view} />
      )}

      {answer.evidence.length > 0 ? (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Evidence</p>
              <p className="mt-1 text-sm font-medium">Records supporting this answer</p>
            </div>
            {meanPct !== null ? <span className="text-xs text-muted-foreground">Mean relevance {meanPct}%</span> : null}
          </div>
          <ul className="mt-3 space-y-3">
            {answer.evidence.map((evidence) => (
              <li key={evidence.eventId} className="rounded-xl border border-border/60 bg-background/25 p-4">
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
                  Open original source <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-border/60 pt-4 text-xs leading-6 text-muted-foreground">
        Stored Geomacro evidence only{answer.gri !== null ? ` · Canonical GRI ${answer.gri}` : " · GRI unavailable"}. This is risk intelligence, not financial advice.
      </p>
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/20 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm leading-7 text-foreground/90">{body}</p>
    </div>
  );
}
