import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getPublicEventDetail,
  type PublicEventDetail,
} from "@/lib/public-event.functions";
import {
  PUBLIC_DATA_REQUEST_TIMEOUT_MS,
  withPublicRuntimeTimeout,
} from "@/lib/public-runtime-timeout";

export function EventDetailWorkspace({
  eventId,
  initialEvent,
}: {
  eventId: string;
  initialEvent?: PublicEventDetail | null;
}) {
  const loadEvent = useServerFn(getPublicEventDetail);
  const hasInitialEventState = initialEvent !== undefined;
  const [event, setEvent] = useState<PublicEventDetail | null>(initialEvent ?? null);
  const [loading, setLoading] = useState(!hasInitialEventState);
  const [error, setError] = useState<string | null>(
    hasInitialEventState && !initialEvent
      ? "This intelligence event is unavailable or no longer public."
      : null,
  );

  useEffect(() => {
    // Route loaders now provide the public event for first-request SSR. Avoid a
    // second browser request when that canonical loader result is available.
    if (initialEvent !== undefined) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await withPublicRuntimeTimeout(
          loadEvent({ data: { eventId } }),
          PUBLIC_DATA_REQUEST_TIMEOUT_MS,
          "Intelligence event request timed out.",
        );
        if (cancelled) return;
        if (!result) {
          setEvent(null);
          setError("This intelligence event is unavailable or no longer public.");
          return;
        }
        setEvent(result);
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
  }, [eventId, initialEvent, loadEvent]);

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
          </div>

          <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">{event.source_title ?? "Untitled intelligence event"}</h1>
          <p className="mt-4 text-xs text-muted-foreground">Published {formatDate(event.published_at)} · Recorded {formatDate(event.created_at)}</p>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
            A current public alert is available here. No wallet is required to read this page. Signed decision guidance, market transmission analysis and quantified watch levels are available through the Risk Gate API.
          </p>
        </header>

        <section className="py-8">
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Paid Risk Gate Intelligence</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">Turn this alert into a signed decision brief</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Get the actionable risk score, 7-day movement, affected corridors and assets, market-impact analysis, and 24–72h watch triggers with Ed25519 proof, an agent_decision, and an analyst_brief.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Tier name="BASIC" price="$0.15" />
                  <Tier name="STANDARD" price="$0.20" />
                  <Tier name="COMPLEX" price="$0.30" />
                </div>
                <Button asChild className="mt-6">
                  <Link to="/risk-gate">Unlock Signed Risk Gate ($0.15–$0.30) →</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}

function Tier({ name, price }: { name: string; price: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{name}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{price}</p>
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
