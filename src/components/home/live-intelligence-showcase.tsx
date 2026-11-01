import {useEffect,useMemo,useState} from "react";
import {Link} from "@tanstack/react-router";
import {ArrowRight,Clock3,Radio,Globe2,TrendingUp,Gem,RefreshCw} from "lucide-react";
import {fetchDirectDerivedNews} from "@/lib/public-derived-news-client";
import {fetchDailyOfficialFinds,selectDailyOfficialFinds,type DailyOfficialFind} from "@/lib/home-daily-official-finds";
import type {StatelessIntelligenceSignal} from "@/lib/stateless-intelligence-model";
import type {FindCardV1} from "@/lib/find-card-v1";
import {eligibleHomeFindCards,publicHomeFindCopy,selectHomepageFreeFind} from "@/lib/homepage-free-finds";
import {isConcreteHomeFind} from "@/lib/intelligence-concrete-publication";

const DOMAINS=[
  {key:"geopolitics",name:"Geopolitics",Icon:Globe2,color:"text-rose-400",line:"bg-rose-400"},
  {key:"macro",name:"Macro / FX",Icon:TrendingUp,color:"text-sky-400",line:"bg-sky-400"},
  {key:"rare_earth",name:"Critical Minerals",Icon:Gem,color:"text-amber-400",line:"bg-amber-400"},
] as const;

function originalDate(value:string,datePrecision:"exact"|"day"){
 const date=new Date(value);
 const formatted=date.toLocaleDateString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",year:"numeric"});
 return datePrecision==="day"?formatted+" · publisher date":formatted+" · UTC";
}
function DailyStory({item,featured=false}:{item:DailyOfficialFind;featured?:boolean}){
 const look=DOMAINS.find(d=>d.key===item.signal.category)!;
 const {signal}=item;
 return (
  <article className="relative min-w-0 overflow-hidden rounded-xl border border-border/65 bg-background/45 p-4 sm:p-5">
   <div aria-hidden className={"absolute inset-y-0 left-0 w-0.5 "+look.line}/>
   <div className="flex flex-wrap items-center gap-2">
    <look.Icon aria-hidden className={"h-3.5 w-3.5 "+look.color}/>
    <span className={"font-mono text-[10px] font-semibold uppercase tracking-wider "+look.color}>{look.name}</span>
    <span className="text-[10px] text-muted-foreground">{item.isCurrent?"Last 24h":"Earlier verified release"}</span>
   </div>
   <h3 className={"mt-2 font-semibold tracking-tight text-foreground "+(featured?"text-lg sm:text-xl":"text-sm sm:text-base")}>
    <Link to="/intelligence" search={{category:signal.category}} className="gm-heading-link">
     {item.headline} <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden/>
    </Link>
   </h3>
   <p className="mt-2 text-xs leading-5 text-muted-foreground">
    <strong className="font-semibold text-foreground">What changed: </strong>{item.whatChanged}
   </p>
   <p className="mt-2 text-xs leading-5 text-muted-foreground">
    <strong className="font-semibold text-foreground">Why it matters: </strong>{item.whyItMatters}
   </p>
   <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-4 text-muted-foreground">
    <Clock3 className="h-3 w-3" aria-hidden/>
    <time dateTime={item.originalAt}>{originalDate(item.originalAt,signal.date_precision)}</time>
   </div>
   {signal.sources_credited.length>0&&
    <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
     Source attribution: {signal.sources_credited.join(" · ")}
    </p>}
  </article>
 );
}
/**
 * Public verified-original Finds; sources are existing free immutable
 * archive assets. No paid scores, raw source URLs or independently unverified
 * OSINT stories are elevated to official news. Any older item keeps its date.
 */
export function LiveIntelligenceShowcase({
 initialFindCards=[],initialDailyHighlights=[],
}:{initialFindCards?:FindCardV1[];initialDailyHighlights?:StatelessIntelligenceSignal[]}){
 const [signals,setSignals]=useState<StatelessIntelligenceSignal[]>(initialDailyHighlights);
 const [checked,setChecked]=useState(initialDailyHighlights.length>0);
 const [unavailable,setUnavailable]=useState(false);
 const [observedNow,setObservedNow]=useState(()=>Date.now());
 const [legacy,setLegacy]=useState<FindCardV1[]>(initialFindCards);
 const [cycle,setCycle]=useState(0);
 useEffect(()=>{
  let cancelled=false;
  const refresh=async()=>{
   try{
    // Primary static asset contains credited official releases across all
    // three domains, independent of the OSINT-heavy capped latest.json.
    const incoming=await fetchDailyOfficialFinds();
    if(!cancelled){
     setSignals(previous=>incoming.length?incoming:previous);
     setUnavailable(false);setChecked(true);setObservedNow(Date.now());
    }
   }catch{
    // Read-only, bounded fallback to the same existing static archive.
    // No D1 hit, no payment or source disclosure on homepage navigation.
    try{
     const incoming=await fetchDirectDerivedNews();
     if(!cancelled){
      setSignals(previous=>incoming.length?incoming:previous);
      setUnavailable(false);setChecked(true);setObservedNow(Date.now());
     }
    }catch{
     if(!cancelled){setUnavailable(true);setChecked(true);setObservedNow(Date.now());}
    }
   }
  };
  void refresh();
  const interval=window.setInterval(()=>void refresh(),5*60_000);
  const onFocus=()=>void refresh();
  window.addEventListener("focus",onFocus);
  return ()=>{cancelled=true;window.clearInterval(interval);window.removeEventListener("focus",onFocus);};
 },[cycle]);
 const stories=useMemo(()=>selectDailyOfficialFinds(signals,observedNow,4),[signals,observedNow]);
 // Retain the previously approved no-credit Find Card path only for genuine
 // explicit, concrete events when the new official static asset is empty.
 const fallback=selectHomepageFreeFind(eligibleHomeFindCards(legacy,observedNow).filter(isConcreteHomeFind),observedNow);
 const first=fallback?.card;
 const firstCopy=first?publicHomeFindCopy(first):null;
 const latest=stories.length?stories.reduce((best,v)=>v.originalAt>best?v.originalAt:best,stories[0].originalAt):null;
 const fresh=stories.some(s=>s.isCurrent);
 return (
  <div className="relative mx-auto w-full min-w-0 max-w-xl lg:mx-0 lg:max-w-none">
   <div aria-hidden className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-primary/5 blur-3xl"/>
   <div className="relative rounded-[1.5rem] border border-border/65 bg-card/85 p-5 shadow-xl shadow-black/10 backdrop-blur sm:p-6 lg:p-7">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <p className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
      <Radio className="h-3.5 w-3.5" aria-hidden/> Geomacro Finds
     </p>
     <span className="rounded-full border border-border/65 bg-background/65 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
      {stories.length?(fresh?"Fresh original releases":"Latest verified originals"):"Official-source desk"}
     </span>
    </div>
    {stories.length>0?(
      <section aria-label="Geomacro important original-dated news" className="mt-5 space-y-3">
       <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
         Important developments · Geomacro analysis
        </p>
        {latest&&<span className="text-[10px] text-muted-foreground">Latest original: {originalDate(latest,"exact")}</span>}
       </div>
       {stories.map((story,index)=><DailyStory key={story.signal.id} item={story} featured={index===0}/>)}
       <p className="text-[10px] leading-4 text-muted-foreground">
        Automatically updated as qualified publisher releases arrive. Unverified OSINT is not presented as verified news; quiet days retain the actual earlier publication dates.
       </p>
       <Link to="/intelligence" className="gm-text-link text-xs">Read full Intelligence <ArrowRight className="h-3.5 w-3.5" aria-hidden/></Link>
      </section>
    ):first&&firstCopy?(
      <article className="mt-5 rounded-xl border border-border/65 bg-background/45 p-4">
       <p className="font-mono text-[10px] text-primary">Latest available original · {originalDate(first.published_at,first.date_precision)}</p>
       <h3 className="mt-2 text-lg font-semibold">{firstCopy.headline}</h3>
       <p className="mt-2 text-sm text-muted-foreground"><strong className="text-foreground">What changed: </strong>{firstCopy.what_changed}</p>
       <p className="mt-2 text-sm text-muted-foreground"><strong className="text-foreground">Why it matters: </strong>{first.why_it_matters}</p>
       <Link to="/intelligence" className="gm-text-link mt-3 text-xs">Open Intelligence <ArrowRight className="h-3.5 w-3.5" aria-hidden/></Link>
      </article>
    ):(
      <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-border/50 bg-background/25 p-4">
       <p className="text-sm font-medium">{!checked?"Loading verified official findings…":
        unavailable?"Official highlights temporarily unavailable.":"No eligible original-dated official highlights in the retained window."}</p>
       <p className="mt-2 text-xs leading-5 text-muted-foreground">
        No headlines, source dates, outcomes or scores are invented when original evidence is unavailable.
       </p>
       <Link to="/intelligence" className="gm-text-link mt-3 text-xs">Open free Intelligence <ArrowRight className="h-3.5 w-3.5" aria-hidden/></Link>
      </div>
    )}
    <div className="mt-5 border-t border-border/55 pt-4">
     <div className="flex items-center justify-between gap-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Browse by topic</p>
      <button type="button" onClick={()=>setCycle(v=>v+1)} aria-label="Refresh Geomacro Finds"
       className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[11px] text-primary hover:bg-background/60">
       <RefreshCw className="h-3 w-3" aria-hidden/> Refresh
      </button>
     </div>
     <nav className="mt-3 flex flex-wrap gap-2" aria-label="Browse intelligence topics">
      {DOMAINS.map(({key,name})=><Link key={key} to="/intelligence" search={{category:key}}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {name}<ArrowRight className="h-3 w-3" aria-hidden/>
       </Link>)}
     </nav>
    </div>
   </div>
  </div>
 );
}
