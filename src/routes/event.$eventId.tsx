import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import { supabaseFeed } from "@/lib/supabase-feed";

type EventDetail = {
  id: string;
  title: string;
  summary: string | null;
  narrative: string | null;
  category: string | null;
  severity: number | null;
  confidence: number | null;
  delta: number | null;
  sourceName: string | null;
  sourceDomain: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export const Route = createFileRoute("/event/$eventId")({
  head: ({ params }) => {
    const canonical = `https://geomacro.live/event/${encodeURIComponent(params.eventId)}`;
    return {
      meta: [
        { title: "Intelligence Event · Geomacro" },
        {
          name: "description",
          content:
            "Stored Geomacro intelligence event with source context, risk score, confidence and provenance timestamps.",
        },
        { property: "og:title", content: "Intelligence Event · Geomacro" },
        {
          property: "og:description",
          content:
            "Inspect the stored evidence and risk context behind a Geomacro intelligence event.",
        },
        { property: "og:url", content: canonical },
        { property: "og:type", content: "article" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: EventDetailPage,
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(eventId)) {
        setError("This intelligence event identifier is invalid.");
        setLoading(false);
        return;
      }

      try {
        const { data, error: queryError } = await supabaseFeed
          .from("events")
          .select(
            "id,source_title,summary,narrative,category,severity,confidence,delta,source_name,source_domain,source_url,published_at,created_at",
          )
          .eq("id", eventId)
          .maybeSingle();

        if (queryError) throw queryError;
        if (cancelled) return;

        if (!data) {
          setEvent(null);
          setError("This intelligence event is unavailable or no longer public.");
          return;
        }

        const row = data as Record<string, unknown>;
        const next: EventDetail = {
          id: String(row.id),
          title: asText(row.source_title) ?? "Untitled intelligence event",
          summary: asText(row.summary),
          narrative: asText(row.narrative),
          category: asText(row.category),
          severity: asNumber(row.severity),
          confidence: asNumber(row.confidence),
          delta: asNumber(row.delta),
          sourceName: asText(row.source_name),
          sourceDomain: asText(row.source_domain),
          sourceUrl: safeExternalUrl(asText(row.source_url)),
          publishedAt: asText(row.published_at),
          createdAt: String(row.created_at),
        };

        setEvent(next);
        document.title = `${next.title} · Geomacro Intelligence`;
      } catch (err) {
        if (cancelled) return;
        console.error("[event-detail] load failed", err);
        setEvent(null);
        setError("The stored intelligence event could not be loaded right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6 md:py-20">
        <p className="text-sm text-muted-foreground">Loading stored intelligence…</p>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6 md:py-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Risk Intelligence
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Event unavailable</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {error ?? "This intelligence event is unavailable."}
        </p>
        <Button asChild variant="outline" className="mt-6 gap-2">
          <Link to="/intelligence">
            <ArrowLeft className="h-4 w-4" /> Back to Risk Intelligence
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/intelligence"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Risk Intelligence
        </Link>
        <span className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          Public stored intelligence
        </span>
      </div>

      <article className="mt-8">
        <header className="border-b border-border pb-8">
          <div className="flex flex-wrap items-center gap-2">
            {event.category ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {prettyCategory(event.category)}
              </span>
            ) : null}
            {event.severity !== null ? <RiskBadge score={event.severity} showScore /> : null}
            {event.delta !== null && event.delta !== 0 ? (
              <RiskTrend delta={Math.round(event.delta)} />
            ) : null}
          </div>

          <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">
            {event.title}
          </h1>

          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
            {event.summary ?? event.narrative ?? "No public summary is stored for this event."}
          </p>
        </header>

        <section className="grid gap-4 border-b border-border py-8 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Event risk score" value={formatNumber(event.severity)} />
          <Metric label="Confidence" value={formatPercent(event.confidence)} />
          <Metric label="Risk movement" value={formatSigned(event.delta)} />
          <Metric label="Recorded" value={formatDate(event.createdAt)} />
        </section>

        <section className="border-b border-border py-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Evidence and provenance
          </p>
          <div className="mt-4 grid gap-4 rounded-2xl border border-border/70 bg-card/40 p-5 sm:grid-cols-2">
            <Metric label="Source" value={event.sourceName ?? event.sourceDomain ?? "Source recorded"} />
            <Metric label="Published" value={formatDate(event.publishedAt)} />
            <Metric label="Stored event ID" value={event.id} mono />
            <Metric label="Source domain" value={event.sourceDomain ?? "Unavailable"} mono />
          </div>

          {event.sourceUrl ? (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open original source <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              A public source URL is not available for this stored event.
            </p>
          )}
        </section>

        {event.narrative && event.narrative !== event.summary ? (
          <section className="border-b border-border py-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Structured context
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-foreground/90">{event.narrative}</p>
          </section>
        ) : null}

        <section className="py-8">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Interpret this event as risk intelligence</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Event severity is not a market probability and does not authorize a financial or operational action.
                  Confidence and source context are shown separately so the evidence can be judged directly. No wallet is required to read this page.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/ask-geomacro">Ask Geomacro about current risk</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/global-risk">Verify the Global Risk Index</Link>
            </Button>
          </div>
        </section>
      </article>
    </main>
  );
}

function Metric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-sm text-foreground ${mono ? "font-mono text-xs" : "font-medium"}`}>
        {value}
      </p>
    </div>
  );
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function prettyCategory(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatNumber(value: number | null) {
  return value === null ? "Unavailable" : value.toFixed(1);
}

function formatPercent(value: number | null) {
  if (value === null) return "Unavailable";
  const normalized = value > 1 ? value : value * 100;
  return `${Math.round(normalized)}%`;
}

function formatSigned(value: number | null) {
  if (value === null) return "Unavailable";
  if (value === 0) return "No recorded change";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function formatDate(value: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}
