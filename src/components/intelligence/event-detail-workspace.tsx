import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskTrend } from "@/components/foundation/risk";
import {
  getPublicEventDetail,
  type PublicEventDetail,
} from "@/lib/public-event.functions";

export function EventDetailWorkspace({ eventId }: { eventId: string }) {
  const loadEvent = useServerFn(getPublicEventDetail);
  const [event, setEvent] = useState<PublicEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await loadEvent({ data: { eventId } });
        if (cancelled) return;
        if (!result) {
          setEvent(null);
          setError("This intelligence event is unavailable or no longer public.");
          return;
        }
        setEvent(result);
        document.title = `${result.source_title ?? "Intelligence event"} · Geomacro`;
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
  }, [eventId, loadEvent]);

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
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Risk Intelligence</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Event unavailable</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{error ?? "This intelligence event is unavailable."}</p>
        <Button asChild variant="outline" className="mt-6 gap-2">
          <Link to="/intelligence"><ArrowLeft className="h-4 w-4" /> Back to Risk Intelligence</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/intelligence" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Risk Intelligence
        </Link>
        <span className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Public stored intelligence</span>
      </div>

      <article className="mt-8">
        <header className="border-b border-border pb-8">
          <div className="flex flex-wrap items-center gap-2">
            {event.category ? <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{prettyCategory(event.category)}</span> : null}
            {event.severity !== null ? <RiskBadge score={event.severity} showScore /> : null}
            {event.delta !== null && event.delta !== 0 ? <RiskTrend delta={Math.round(event.delta)} /> : null}
          </div>

          <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">{event.source_title ?? "Untitled intelligence event"}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">{event.summary ?? event.narrative ?? "No public summary is stored for this event."}</p>
        </header>

        <section className="grid gap-4 border-b border-border py-8 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Event risk score" value={formatNumber(event.severity)} />
          <Metric label="Confidence" value={formatPercent(event.confidence)} />
          <Metric label="Risk movement" value={formatSigned(event.delta)} />
          <Metric label="Recorded" value={formatDate(event.created_at)} />
        </section>

        <section className="border-b border-border py-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Evidence and provenance</p>
          <div className="mt-4 grid gap-4 rounded-2xl border border-border/70 bg-card/40 p-5 sm:grid-cols-2">
            <Metric label="Published" value={formatDate(event.published_at)} />
            <Metric label="Stored event ID" value={event.id} mono />
          </div>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            Upstream publisher identities and direct source URLs are retained internally for provenance, audit and licensing controls, but are not exposed on public Geomacro surfaces.
          </p>
        </section>

        {event.narrative && event.narrative !== event.summary ? (
          <section className="border-b border-border py-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Structured context</p>
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
                  Event severity is not a market probability and does not authorize a financial or operational action. Confidence, timestamps and stored identifiers remain visible while upstream source identity stays private. No wallet is required to read this page.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild><Link to="/ask-geomacro">Ask Geomacro about current risk</Link></Button>
            <Button asChild variant="outline"><Link to="/global-risk">Open the Global Risk Index</Link></Button>
          </div>
        </section>
      </article>
    </main>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-sm text-foreground ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</p>
    </div>
  );
}

function prettyCategory(value: string) {
  if (value === "rare_earth") return "Critical minerals";
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
