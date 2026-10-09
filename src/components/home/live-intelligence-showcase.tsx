import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Clock3, Mail, Radio, Zap } from "lucide-react";
import { useIntelligence } from "@/lib/use-intelligence";
import { selectHomepageShowcase } from "@/lib/homepage-intelligence-showcase";
import { intelligenceDomainPulse } from "@/lib/intelligence-domain-pulse";
import { publicHeadline } from "@/lib/intelligence-editorial";
import { RiskBadge } from "@/components/foundation/risk";

const DOMAINS: Record<string, string> = {
  geopolitics: "Geopolitical",
  macro: "Macro & FX",
  rare_earth: "Critical minerals",
};

const BUSINESS_EMAIL = "contact@geomacro.live";
const MONTHLY_MAIL =
  `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent("Request: Geomacro Monthly Intelligence Plan")}&body=${encodeURIComponent("Hello Geomacro,\n\nI would like to discuss a recurring intelligence plan.\nCompany/team:\nCountries/corridors:\nGeopolitical, Macro/FX or Critical Minerals:\nEstimated API calls per month:\n\nPlease contact me with the suitable plan.")}`;
const ANNUAL_MAIL =
  `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent("Request: Geomacro Enterprise Intelligence")}`;

function eventDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AccessOptions() {
  return (
    <div className="mt-5 border-t border-border/55 pt-5">
      <h3 className="text-sm font-semibold tracking-tight sm:text-base">
        Move from headlines to decisions
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Give your team or AI agents structured severity, dated intelligence and decision context—without processing raw news feeds.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          to="/pricing"
          className="group flex min-h-20 flex-col justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-3 transition-colors hover:border-primary/60 hover:bg-primary/15"
        >
          <span className="flex items-center gap-2 text-xs font-semibold">
            <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Decision-ready API · Pay per call
          </span>
          <span className="inline-flex items-center justify-between gap-2 text-sm font-semibold text-primary">
            From 0.05 USDC / successful call
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
        <a
          href={MONTHLY_MAIL}
          className="group flex min-h-20 flex-col justify-between gap-2 rounded-xl border border-border/70 bg-background/30 px-3.5 py-3 transition-colors hover:border-primary/50"
        >
          <span className="flex items-center gap-2 text-xs font-semibold">
            <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Monthly intelligence · Coming Soon
          </span>
          <span className="inline-flex items-center justify-between gap-2 text-sm font-medium">
            Request a tailored plan
            <ArrowRight className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </a>
      </div>
      <a
        href={ANNUAL_MAIL}
        className="mt-3 inline-flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-xs text-muted-foreground transition-colors hover:text-primary"
      >
        <span className="inline-flex items-center gap-2">
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          Need country, corridor or enterprise coverage? Talk to us
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </a>
    </div>
  );
}

/**
 * A single business-facing glimpse of the existing verified Intelligence feed.
 * Keep proof checks inside the canonical serving/selection layers; the homepage
 * never manufactures causal drivers, historical baselines, or forward impacts.
 */
export function LiveIntelligenceShowcase() {
  const intelligence = useIntelligence(null, 5 * 60_000);
  const winner = intelligence.data
    ? selectHomepageShowcase(intelligence.data.all)
    : null;
  const pulse = intelligenceDomainPulse(intelligence.data?.all ?? []);
  const event = winner?.event;
  const gist = event ? publicHeadline(event.title) : null;

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-xl lg:mx-0 lg:max-w-none">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-primary/5 blur-3xl"
      />
      <div className="relative rounded-[1.5rem] border border-border/65 bg-card/85 p-5 shadow-xl shadow-black/10 backdrop-blur sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            Geomacro Finds
          </p>
          {event && (
            <span className="rounded-full bg-background/65 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {DOMAINS[event.category ?? ""] ?? "Global risk"}
            </span>
          )}
        </div>

        {event && winner && gist ? (
          <div className="mt-5">
            <h2 className="max-w-[34rem] text-[clamp(1.25rem,2vw,1.7rem)] font-semibold leading-snug tracking-[-0.025em]">
              {gist}
            </h2>
            {event.summary && (
              <p className="mt-3 max-w-[34rem] text-sm leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">Geomacro intelligence:</span>{" "}
                {event.summary}
              </p>
            )}
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <time dateTime={winner.observedAt}>{eventDate(winner.observedAt)}</time>
              <span className="ml-2">{winner.isCurrent ? "Verified within 24h" : "Historical verified assessment"}</span>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">Geomacro severity</span>
              {event.severity !== null && <RiskBadge score={event.severity} showScore />}
            </div>

            <Link
              to="/intelligence"
              className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline hover:underline-offset-4"
            >
              Read this intelligence assessment
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border/50 bg-background/25 p-4">
            <p className="text-sm font-medium">
              {intelligence.status === "loading" ? "Checking the verified global intelligence feed…" : "Verified story being prepared"}
            </p>
            <Link
              to="/intelligence"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              Browse scored Intelligence
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        )}

        <div className="mt-5 border-t border-border/55 pt-4" aria-label="Live monitoring coverage">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Evidence freshness · three global domains
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {pulse.map((domain) => (
              <div key={domain.key} className="min-w-0 rounded-lg border border-border/60 bg-background/30 p-2">
                <p className="text-[11px] font-semibold leading-4">{domain.label}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  {domain.state === "current_scored" ? "Current verified score" :
                    domain.state === "current_observed" ? "Fresh signal · unscored" :
                    domain.state === "historical_verified" ? "Historical verified" : "Awaiting verification"}
                </p>
              </div>
            ))}
          </div>
        </div>

        <AccessOptions />
      </div>
    </div>
  );
}
