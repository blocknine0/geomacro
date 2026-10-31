import {useEffect,useState} from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock3, Radio, Globe2, TrendingUp, Gem } from "lucide-react";
import { fetchHomeDerivedNews } from "@/lib/home-derived-news-client";
import { findCardFromObservedRelease,type FindCardV1 } from "@/lib/find-card-v1";
import { selectHomepageFreeFind,homeFindsPulse,eligibleHomeFindCards,parseHomepageFindsFeed,mergeHomepageFindCards,publicHomeFindCopy } from "@/lib/homepage-free-finds";
import {isConcreteHomeFind} from "@/lib/intelligence-concrete-publication";

const DOMAINS: Record<string, string> = {
  geopolitics: "Geopolitical",
  macro: "Macro & FX",
  rare_earth: "Critical minerals",
};

function eventDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
        if(!cancelled){setCards(previous=>mergeHomepageFindCards(previous,next));setUnavailable(false);setChecked(true);}
      } catch {
        // This is the established, independently guarded public D1 reader:
        // it bypasses a temporarily unhealthy site RPC/runtime path.
        try {
          const signals=await fetchHomeDerivedNews();
          const now=Date.now();
          const next=signals.map(s=>findCardFromObservedRelease(s,now))
            .filter((v):v is FindCardV1=>v!==null);
          if(!cancelled){setCards(previous=>mergeHomepageFindCards(previous,next));setUnavailable(false);setChecked(true);}
        } catch {
          if(!cancelled){setUnavailable(true);setChecked(true);}
        }
      }
    };
    void refresh();
    const interval=setInterval(()=>{void refresh();},5*60_000);
    return ()=>{cancelled=true;clearInterval(interval);};
  },[]);
  const visibleCards=eligibleHomeFindCards(cards).filter(isConcreteHomeFind);
  const winner=selectHomepageFreeFind(visibleCards);
  const pulse=homeFindsPulse(visibleCards);
  const domainCards=pulse.map(domain=>({
    ...domain,
    winner:selectHomepageFreeFind(visibleCards.filter(card=>card.domain===domain.key)),
  }));
  const card=winner?.card;
  const display=card?publicHomeFindCopy(card):null;
  // Only genuine, distinct findings become story tiles. Quiet categories
  // stay navigable without manufacturing a story or repeating empty cards.
  const relatedDomains=domainCards.filter(domain=>domain.winner && domain.winner.card.id!==card?.id);
  const browseDomains=[
    {key:"geopolitics",name:"Geopolitics"},
    {key:"macro",name:"Macro / FX"},
    {key:"rare_earth",name:"Critical Minerals"},
  ] as const;

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
              {display?.headline}
            </h2>
            <p className="mt-3 max-w-[34rem] text-sm leading-6 text-muted-foreground">{display?.what_changed}</p>
            <p className="mt-3 max-w-[34rem] text-sm leading-6 text-muted-foreground">
              <span className="font-semibold text-foreground">Why it matters: </span>{card.why_it_matters}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <time dateTime={winner.originalAt}>{eventDate(winner.originalAt)} UTC</time>
              <span>{winner.isCurrent?"Original release within 24h":"Earlier original release · not current"}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Geomacro / Intelligence
            </p>
            <Link to="/intelligence" className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline hover:underline-offset-4">
              Explore free Intelligence <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        ):(
          <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-border/50 bg-background/25 p-4">
            <p className="text-sm font-medium">
              {!checked?"Loading Geomacro findings…":unavailable?
                "Highlights are temporarily unavailable.":"No highlights to show right now."}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Explore the intelligence desk for available country and topic coverage.</p>
            <Link to="/intelligence" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              Open free Intelligence <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        )}
        <div className="mt-5 border-t border-border/55 pt-4" aria-label="Three domain Intelligence showcase">
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Browse by topic</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {relatedDomains.map(domain=>{
              const story=domain.winner?.card;
              const copy=story?publicHomeFindCopy(story):null;
              const look=domain.key==="geopolitics"
                ? {line:"bg-rose-500",label:"text-rose-500",name:"Geopolitics",Icon:Globe2}
                : domain.key==="macro"
                ? {line:"bg-sky-500",label:"text-sky-500",name:"Macro / FX",Icon:TrendingUp}
                : {line:"bg-amber-500",label:"text-amber-500",name:"Critical Minerals",Icon:Gem};
              return (
                <section key={domain.key} className="overflow-hidden rounded-xl border border-border/60 bg-background/30">
                  <div className={look.line+" h-1"} aria-hidden="true" />
                  <div className="space-y-2 p-3">
                    <p className={"flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide "+look.label}>
                      <look.Icon className="h-3.5 w-3.5" aria-hidden />{look.name}
                    </p>
                    <p className="text-xs font-semibold leading-5 text-foreground">{copy?.headline}</p>
                    {copy?<p className="text-[11px] leading-5 text-muted-foreground">{copy.what_changed}</p>:null}
                    {story?<time dateTime={story.published_at} className="block text-[10px] text-muted-foreground">{eventDate(story.published_at)} UTC</time>:null}
                  </div>
                </section>
              );
            })}
          </div>
          <nav aria-label="Browse intelligence topics" className="mt-3 flex flex-wrap gap-2">
            {browseDomains.map(({key,name})=>(
              <Link key={key} to="/intelligence" search={{category:key}}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {name}<ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
