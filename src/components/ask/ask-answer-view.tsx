import { Link } from "@tanstack/react-router";
import type { AskAnswer } from "@/lib/ask-geomacro.functions";

export function UserBubble({ children }: { children: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] break-words rounded-2xl rounded-br-md bg-muted px-4 py-3 text-sm leading-6 text-foreground sm:max-w-[78%]">
        {children}
      </div>
    </div>
  );
}

export function AssistantAnswer({ answer }: { answer: AskAnswer }) {
  const evidence = answer.evidence.slice(0, 5);
  const evidenceLabel = answer.answer_kind === "explainer" ? "General explanation" :
    answer.answer_kind === "guidance" ? "Three-category research assistant" :
    answer.insufficient_evidence ? "Evidence unavailable" :
    answer.intelligence_tier === "index_observation_unverified" ? "Provisional observations" :
    answer.intelligence_tier === "official_observation_unscored" ? "Official observations" :
    answer.data_mode === "permanent" ? "Stored evidence" : "Retrieved evidence";
  const originalDate = answer.latest_original_published_at;
  const displayDate = originalDate && Number.isFinite(Date.parse(originalDate))
    ? (answer.latest_original_date_precision === "day" ? originalDate.slice(0, 10) :
      new Date(originalDate).toISOString().replace("T", " ").slice(0, 16) + " UTC") : null;

  return (
    <div className="max-w-2xl min-w-0 px-1">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
        <span>Geomacro</span>
        <span className="text-muted-foreground">· {evidenceLabel}</span>
        {answer.low_confidence ? <span className="text-muted-foreground">· Limited confidence</span> : null}
      </div>
      {displayDate ? <p className="mt-2 text-xs text-muted-foreground">Latest original release: <time dateTime={originalDate}>{displayDate}</time></p> : null}
      <p className="mt-2 break-words text-[15px] leading-7 text-foreground sm:text-base">{answer.summary}</p>
      {answer.what_changed && answer.what_changed !== answer.summary ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">What changed</h3>
          <p className="mt-1 break-words text-sm leading-7 text-foreground/90">{answer.what_changed}</p>
        </div>
      ) : null}
      {answer.why_it_matters && answer.why_it_matters !== answer.summary ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">{answer.answer_kind === "explainer" ? "How it works" : "Why it matters"}</h3>
          <p className="mt-1 break-words text-sm leading-7 text-foreground/90">{answer.why_it_matters}</p>
        </div>
      ) : null}
      {answer.geomacro_view && answer.geomacro_view !== answer.summary && answer.geomacro_view !== answer.why_it_matters ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">{answer.answer_kind === "explainer" ? "What to watch" : "Geomacro view"}</h3>
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
