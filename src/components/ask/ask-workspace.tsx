import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUp, Check, Copy, Loader2, Menu, MessageSquare, PanelLeftClose, Plus, ShieldCheck, Trash2 } from "lucide-react";
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
const MAX_SESSIONS = 10;

type PublicAskResponse =
  | { ok: true; data: AskAnswer; context?: { mode?: string; resolved_question?: string } }
  | { ok: false; error?: { code?: string; message?: string } };

type ChatTurn = {
  id: number;
  question: string;
  answer: AskAnswer;
  resolvedQuestion: string;
};

type ChatSession = { id: number; title: string; turns: ChatTurn[] };

async function requestPublicAsk(
  question: string,
  previousQuestion?: string,
): Promise<{ answer: AskAnswer; resolvedQuestion: string }> {
  const response = await fetch("/api/public-ask", {
    method: "GET",
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

export function AskWorkspace() {
  // Research text lives in React memory only: no account, cookie, URL, or
  // persistent browser storage receives conversation history.
  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: 0, title: "New chat", turns: [] },
  ]);
  const [activeId, setActiveId] = useState(0);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ chatId: number; question: string } | null>(null);
  const [failure, setFailure] = useState<{ chatId: number; question: string; error: UserError } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const sequence = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const active = sessions.find((session) => session.id === activeId) ?? sessions[0];
  const loading = pending !== null;
  const currentPending = pending?.chatId === active.id ? pending.question : null;
  const currentFailure = failure?.chatId === active.id ? failure : null;

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [activeId, sessions, currentPending, currentFailure]);

  const newChat = useCallback(() => {
    if (loading) return;
    const id = ++sequence.current;
    setSessions((current) =>
      [{ id, title: "New chat", turns: [] }, ...current].slice(0, MAX_SESSIONS),
    );
    setActiveId(id);
    setQuery("");
    setFailure(null);
    setCopiedId(null);
    setSidebarOpen(false);
    composerRef.current?.focus();
  }, [loading]);

  const selectChat = (id: number) => {
    setActiveId(id);
    setQuery("");
    setCopiedId(null);
    setSidebarOpen(false);
  };

  const deleteChat = (id: number) => {
    if (loading) return;
    const remaining = sessions.filter((session) => session.id !== id);
    if (remaining.length) {
      setSessions(remaining);
      if (activeId === id) setActiveId(remaining[0].id);
    } else {
      const newId = ++sequence.current;
      setSessions([{ id: newId, title: "New chat", turns: [] }]);
      setActiveId(newId);
    }
    if (failure?.chatId === id) setFailure(null);
    setCopiedId(null);
  };

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (question.length < 4 || question.length > MAX_LEN || pending) return;

      const chatId = active.id;
      const previousQuestion = active.turns.at(-1)?.resolvedQuestion;
      const turnId = ++sequence.current;
      setFailure(null);
      setPending({ chatId, question });
      setQuery("");
      setCopiedId(null);

      try {
        const result = await withPublicRuntimeTimeout(
          requestPublicAsk(question, previousQuestion),
          PUBLIC_ASK_REQUEST_TIMEOUT_MS,
          "Ask Geomacro request timed out.",
        );
        setSessions((current) =>
          current.map((session) =>
            session.id === chatId
              ? {
                  ...session,
                  title: session.turns.length === 0 ? question.slice(0, 52) : session.title,
                  turns: [
                    ...session.turns.slice(-(MAX_VISIBLE_TURNS - 1)),
                    { id: turnId, question, answer: result.answer, resolvedQuestion: result.resolvedQuestion },
                  ],
                }
              : session,
          ),
        );
      } catch (err) {
        setFailure({ chatId, question, error: reportError("ask-geomacro", err, "research query") });
      } finally {
        setPending(null);
      }
    },
    [active, pending],
  );

  const copyAnswer = async (turn: ChatTurn) => {
    const { answer } = turn;
    const body = [
      answer.summary,
      answer.what_changed,
      answer.why_it_matters,
      answer.geomacro_view,
    ].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(body);
      setCopiedId(turn.id);
    } catch {
      setCopiedId(null);
    }
  };

  const canSubmit = query.trim().length >= 4 && !loading;

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-5.5rem)] min-h-[30rem] w-full max-w-[1600px] overflow-hidden border-x border-border/50 bg-background">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close conversation menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/55 md:hidden"
        />
      ) : null}

      <aside
        aria-label="Conversation history"
        className={
          "fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-border/70 bg-card p-3 shadow-xl md:static md:z-auto md:w-64 md:shadow-none " +
          (sidebarOpen ? "flex" : "hidden md:flex")
        }
      >
        <div className="flex items-center justify-between gap-2 px-1 py-2">
          <span className="text-sm font-semibold tracking-tight">Ask Geomacro</span>
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={newChat}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-muted/50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
        <p className="mb-2 mt-6 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Recent chats
        </p>
        <nav aria-label="Chats in this tab" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={
                "group flex min-w-0 items-center rounded-xl " +
                (session.id === activeId ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60")
              }
            >
              <button
                type="button"
                onClick={() => selectChat(session.id)}
                aria-current={session.id === activeId ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left text-sm"
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span className="truncate">{session.title}</span>
              </button>
              <button
                type="button"
                aria-label={"Delete chat: " + session.title}
                title="Delete chat"
                disabled={loading}
                onClick={() => deleteChat(session.id)}
                className="mr-1 shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </nav>
        <p className="border-t border-border/70 px-2 py-3 text-[11px] leading-5 text-muted-foreground">
          Chats stay in this tab only. They are not saved to an account.
        </p>
        <Link to="/pricing" className="rounded-lg px-2 py-2 text-xs text-primary hover:bg-muted">
          API &amp; integrations
        </Link>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col" aria-label="Ask Geomacro chat">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border/60 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open conversation menu"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold sm:text-base">Ask Geomacro</h1>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-primary" /> Evidence-grounded intelligence
              </p>
            </div>
          </div>
          <span className="hidden rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:inline-flex">
            Geopolitics · Macro/FX · Minerals
          </span>
          <button
            type="button"
            onClick={newChat}
            disabled={loading}
            aria-label="New chat"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 md:hidden"
          >
            <Plus className="h-5 w-5" />
          </button>
        </header>

        <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
          <div role="log" aria-live="polite" aria-label="Chat messages" className="mx-auto w-full max-w-3xl space-y-8">
            {active.turns.length === 0 && !currentPending && !currentFailure ? (
              <div className="flex min-h-[48vh] flex-col items-center justify-center py-8 text-center">
                <span className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <ShieldCheck className="h-7 w-7 text-primary" />
                </span>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  What would you like to understand?
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                  Explore geopolitical developments, macro/FX and critical minerals.
                  Each response is grounded in available evidence, with uncertainty stated clearly.
                </p>
                <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={loading}
                      onClick={() => void ask(suggestion)}
                      className="min-h-16 rounded-xl border border-border/75 bg-card/40 px-4 py-3 text-left text-sm leading-6 text-foreground transition hover:border-primary/50 hover:bg-muted/50 disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {active.turns.map((turn) => (
              <div key={turn.id} className="space-y-4">
                <UserBubble>{turn.question}</UserBubble>
                <div className="min-w-0">
                  <AssistantAnswer answer={turn.answer} />
                  <button
                    type="button"
                    aria-label="Copy Geomacro answer"
                    onClick={() => void copyAnswer(turn)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {copiedId === turn.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === turn.id ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            ))}

            {currentPending ? (
              <div className="space-y-4">
                <UserBubble>{currentPending}</UserBubble>
                <div role="status" className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking available evidence…
                </div>
              </div>
            ) : null}

            {currentFailure ? (
              <div className="space-y-3">
                <UserBubble>{currentFailure.question}</UserBubble>
                <ErrorState
                  title="Ask Geomacro unavailable"
                  error={currentFailure.error}
                  onRetry={() => void ask(currentFailure.question)}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-border/40 bg-background/95 px-3 pb-3 pt-3 sm:px-6 sm:pb-5">
          <div className="mx-auto w-full max-w-3xl">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void ask(query);
              }}
              className="rounded-2xl border border-border/80 bg-card/80 p-2 shadow-sm focus-within:border-primary/50"
            >
              <label htmlFor="ask-geomacro-input" className="sr-only">
                Ask Geomacro a question
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  ref={composerRef}
                  id="ask-geomacro-input"
                  value={query}
                  maxLength={MAX_LEN}
                  disabled={loading}
                  rows={2}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      if (canSubmit) void ask(query);
                    }
                  }}
                  placeholder="Message Ask Geomacro…"
                  className="min-h-12 max-h-36 flex-1 resize-y bg-transparent px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
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
            <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">
              Enter to send · Shift+Enter for a new line · Follow-ups use bounded context, not previous answers as evidence.
            </p>
            <p className="text-center text-[11px] leading-5 text-muted-foreground">
              Public chat is free; signed structured API products use separate x402 pricing.{" "}
              <Link to="/intelligence" className="hover:text-foreground hover:underline">Intelligence</Link>
              {" · "}
              <Link to="/global-risk" className="hover:text-foreground hover:underline">Risk Indices</Link>
            </p>
          </div>
        </div>
      </section>
    </div>
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
    <div className="max-w-2xl min-w-0 px-1">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
        <span>Geomacro</span>
        <span className="text-muted-foreground">· {evidenceLabel}</span>
        {answer.low_confidence ? <span className="text-muted-foreground">· Limited confidence</span> : null}
      </div>
      <p className="mt-2 break-words text-[15px] leading-7 text-foreground sm:text-base">{answer.summary}</p>
      {answer.what_changed && answer.what_changed !== answer.summary ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">What changed</h3>
          <p className="mt-1 break-words text-sm leading-7 text-foreground/90">{answer.what_changed}</p>
        </div>
      ) : null}
      {answer.why_it_matters ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Why it matters</h3>
          <p className="mt-1 break-words text-sm leading-7 text-foreground/90">{answer.why_it_matters}</p>
        </div>
      ) : null}
      {answer.geomacro_view ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Geomacro view</h3>
          <p className="mt-1 break-words text-sm leading-7 text-foreground/90">{answer.geomacro_view}</p>
        </div>
      ) : null}

      {evidence.length > 0 ? (
        <details className="mt-3 min-w-0 rounded-xl border border-border/60 bg-card/25 px-3 py-2">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
            Evidence ({evidence.length})
          </summary>
          <ul className="mt-3 space-y-2 border-t border-border/60 pt-3">
            {evidence.map((item) => (
              <li key={item.eventId} className="min-w-0 break-words text-xs leading-5 text-muted-foreground">
                {isNavigableEvidence(item.eventId) ? (
                  <Link
                    to="/event/$eventId"
                    params={{ eventId: item.eventId }}
                    className="break-words text-primary underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <span className="break-words">{item.title}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {answer.insufficient_evidence ? (
        <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
          Geomacro will not fill an evidence gap with a synthetic claim.
        </p>
      ) : null}
    </div>
  );
}

function isNavigableEvidence(eventId: string) {
  return !eventId.startsWith("live:") && !eventId.startsWith("web:");
}
