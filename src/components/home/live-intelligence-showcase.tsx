import {useEffect,useState} from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Clock3, Mail, Radio, Zap } from "lucide-react";
import { fetchDirectDerivedNews } from "@/lib/public-derived-news-client";
import { findCardFromObservedRelease,type FindCardV1 } from "@/lib/find-card-v1";
import { selectHomepageFreeFind,homeFindsPulse,parseHomepageFindsFeed } from "@/lib/homepage-free-finds";

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
            Exact USDC price by capability
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
 * Free public D1-derived Finds, not paid scored Intelligence. SSR reads the
 * already public derived journal; the client refreshes it without B2 keys,
 * Supabase or x402. Never claim two-source review or a severity score.
 */
export function LiveIntelligenceShowcase({initialFindCards=[]}:{initialFindCards?:FindCardV1[]}) {
  const [cards,setCards]=useState<FindCardV1[]>(initialFindCards);
  const [unavailable,setUnavailable]=useState(false);
  const [checked,setChecked]=useState(initialFindCards.length>0);
  useEffect(()=>{
    let cancelled=false;
    const refresh=async()=>{
      try {
        const response=await fetch("/api/v1/finds",{
          method:"GET",headers:{Accept:"application/json"},
          cache:"no-store",signal:AbortSignal.timeout(8_000),
        });
        if(!response.ok)throw Error("HOME_FINDS_SITE_API_UNAVAILABLE");
        const raw=await response.text();
        if(raw.length>250_000)throw Error("HOME_FINDS_RESPONSE_TOO_LARGE");
        const next=parseHomepageFindsFeed(JSON.parse(raw));
        if(!cancelled){setCards(next);setUnavailable(false);setChecked(true);}
      } catch {
        // This is the established, independently guarded public D1 reader:
        // it bypasses a temporarily unhealthy site RPC/runtime path.
        try {
          const signals=await fetchDirectDerivedNews();
          const now=Date.now();
          const next=signals.map(s=>findCardFromObservedRelease(s,now))
            .filter((v):v is FindCardV1=>v!==null);
          if(!cancelled){setCards(next);setUnavailable(false);setChecked(true);}
        } catch {
          if(!cancelled){setUnavailable(true);setChecked(true);}
        }
      }
    };
    void refresh();
    const interval=setInterval(()=>{void refresh();},5*60_000);
    return ()=>{cancelled=true;clearInterval(interval);};
  },[]);
  const winner=selectHomepageFreeFind(cards);
  const pulse=homeFindsPulse(cards);
  const card=winner?.card;

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-xl lg:mx-0 lg:max-w-none">
      <div aria-hidden="true" className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-primary/5 blur-3xl" />
      <div className="relative rounded-[1.5rem] border border-border/65 bg-card/85 p-5 shadow-xl shadow-black/10 backdrop-blur sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Geomacro Finds
          </p>
          {card&&<span className="rounded-full bg-background/65 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {DOMAINS[card.domain]??"Global risk"}
          </span>}
        </div>
        {card&&winner?(
          <div className="mt-5">
            <h2 className="max-w-[34rem] text-[clamp(1.25rem,2vw,1.7rem)] font-semibold leading-snug tracking-[-0.025em]">
              {card.headline}
            </h2>
            <p className="mt-3 max-w-[34rem] text-sm leading-6 text-muted-foreground">{card.what_changed}</p>
            <p className="mt-3 max-w-[34rem] text-sm leading-6 text-muted-foreground">
              <span className="font-semibold text-foreground">Why it matters: </span>{card.why_it_matters}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <time dateTime={winner.originalAt}>{eventDate(winner.originalAt)} UTC</time>
              <span>{winner.isCurrent?"Original release within 24h":"Earlier original release · not current"}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              First-party release observed · unscored · independent same-event review not established
            </p>
            <Link to="/intelligence" className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline hover:underline-offset-4">
              Explore free Intelligence <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        ):(
          <div className="mt-5 rounded-xl border border-border/50 bg-background/25 p-4">
            <p className="text-sm font-medium">
              {!checked?"Checking current official releases…":unavailable?
                "Free intelligence feed temporarily unavailable":"No eligible public release in the current journal"}
            </p>
            <Link to="/intelligence" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              Open free Intelligence <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        )}
        <div className="mt-5 border-t border-border/55 pt-4" aria-label="Original release coverage">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Original release coverage · three global domains
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {pulse.map(domain=>(
              <div key={domain.key} className="min-w-0 rounded-lg border border-border/60 bg-background/30 p-2">
                <p className="text-[11px] font-semibold leading-4">{DOMAINS[domain.key]}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  {domain.state==="recent_original"?"Recent release · unscored":
                    domain.state==="dated_original"?"Earlier release · unscored":"No eligible release"}
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
