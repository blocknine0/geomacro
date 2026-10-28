import { useState, type ReactNode } from "react";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Fingerprint, Globe2, Layers3, Radio, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/foundation/risk";
import { useRiskIndices } from "@/lib/use-risk-indices";
import type { NewsSeverityWindow, PublicRiskIndex, PublicRiskIndices } from "@/lib/risk-indices.types";

const WINDOWS: readonly NewsSeverityWindow[] = ["24H", "48H", "72H"];
const SIX_HOURS = 6 * 60 * 60_000;
const TONE = {
  geopolitics: { number: "01", color: "text-rose-400", surface: "from-rose-500/10 via-card/80 to-card/65", dot: "bg-rose-400" },
  macro: { number: "02", color: "text-sky-400", surface: "from-sky-500/10 via-card/80 to-card/65", dot: "bg-sky-400" },
  critical_minerals: { number: "03", color: "text-amber-400", surface: "from-amber-500/10 via-card/80 to-card/65", dot: "bg-amber-400" },
} as const;

export function RiskIndicesWorkspace() {
  const risk = useRiskIndices();
  const [window, setWindow] = useState<NewsSeverityWindow>("72H");
  if (!risk.data) return <main className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div>
        <Eyebrow>GEOMACRO / RISK INTELLIGENCE</Eyebrow>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Three risks. Three separate indices.</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          {risk.status === "error" ? "The latest GeoMacro news-severity calculation is temporarily unavailable." : "Verifying current news-severity readings from GeoMacro."}
        </p>
      </div>
      <Button variant="outline" onClick={risk.retry}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
    </div>
    {risk.status === "error" ? <div className="mt-10 rounded-2xl border border-border/70 bg-card/40 p-6 text-sm">
      <p className="font-medium">No unrelated GRI or invented severity fallback is being displayed.</p>
      <p className="mt-2 text-muted-foreground">No zero-risk estimate is inferred. Try again once qualified sources are available.</p>
    </div> : <div className="mt-10 grid gap-4 lg:grid-cols-3">{[0,1,2].map(x=><div key={x} className="h-64 animate-pulse rounded-3xl border border-border/70 bg-card/40" />)}</div>}
  </main>;

  const data = risk.data;
  const latest = data.indices.filter(index => index.readingAsOf).map(index => Date.parse(index.readingAsOf ?? "")).filter(Number.isFinite);
  const latestObserved = latest.length ? new Date(Math.max(...latest)).toISOString() : null;
  const qualified = data.indices.filter(index => index.status === "available").length;
  const count = data.indices.reduce((n, index) => n + index.eventCount, 0);
  const official = data.indices.reduce((n, index) => n + (index.sourceMix?.public_news ?? 0), 0);
  const osint = data.indices.reduce((n, index) => n + (index.sourceMix?.osint ?? 0), 0);

  return <main className="relative isolate overflow-hidden pb-24">
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(ellipse_at_18%_8%,hsl(var(--primary)/0.13),transparent_55%)]" />
    <div className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:pt-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>GEOMACRO / INTELLIGENCE MONITOR / 01</Eyebrow>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {qualified}/3 indexed
          </span>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-2 rounded-full" onClick={risk.retry} disabled={risk.status === "updating"}>
            <RefreshCw className={"h-3.5 w-3.5 " + (risk.status === "updating" ? "animate-spin" : "")} /> Refresh
          </Button>
        </div>
      </div>

      <section aria-label="GeoMacro risk dashboard overview" className="grid gap-7 border-b border-border/70 pb-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> GeoMacro Certified GRI
          </div>
          <h1 aria-label="Three risks. Three separate indices." className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
            Three risks.<span className="block text-muted-foreground">Three separate indices.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            The world moves in three directions. Track news-driven geopolitical, macroeconomic and critical-minerals severity, with original observation times and source-aware confidence.
          </p>
          <p className="mt-3 max-w-2xl text-xs leading-6 text-muted-foreground">
            A GeoMacro self-certified calculation—not independently certified event facts, probabilities or investment advice.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Observation horizon</span>
            <Clock3 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 flex items-baseline gap-2"><span className="text-5xl font-semibold tabular-nums tracking-tight">72</span><span className="text-sm text-muted-foreground">hours max</span></div>
          <div className="mt-4 border-t border-border/70 pt-4 text-xs leading-6 text-muted-foreground">
            Latest qualified release: <span className="font-medium text-foreground">{latestObserved ? formatDate(latestObserved) : "Not available"}</span>.
            No simulated history outside the retained source window.
          </div>
        </div>
      </section>

      <section aria-label="Source overview" className="grid grid-cols-2 gap-3 py-7 md:grid-cols-4">
        <OverviewValue label="Qualified signals" value={count.toLocaleString()} icon={<Activity className="h-4 w-4" />} />
        <OverviewValue label="Public news" value={official.toLocaleString()} icon={<Globe2 className="h-4 w-4" />} />
        <OverviewValue label="GeoMacro OSINT" value={osint.toLocaleString()} icon={<Radio className="h-4 w-4" />} />
        <OverviewValue label="Domains available" value={qualified + " / 3"} icon={<Layers3 className="h-4 w-4" />} />
      </section>

      <section aria-labelledby="risk-domain-heading" id="risk-domains" className="pt-3">
        <SectionHeader eyebrow="01 / LIVE RISK READINGS" title="Signals by domain" copy="Each index is calculated independently. A missing qualifying signal is marked unavailable, never interpreted as zero risk." />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {data.indices.map(index=><IndexCard key={index.key} index={index} />)}
        </div>
      </section>

      <section aria-labelledby="history-heading" id="history" className="mt-16 border-t border-border/70 pt-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeader eyebrow="02 / OBSERVED HISTORY" title="The past 72 hours, without guesswork" copy="Actual qualified news-severity observations, grouped in 6-hour bins. These bars are observed event severity—not retrospective certified GRI index scores." />
          <div className="inline-flex rounded-xl border border-border/70 bg-card/65 p-1" role="group" aria-label="Choose history window">
            {WINDOWS.map(item=><button key={item} type="button" aria-pressed={window===item} onClick={()=>setWindow(item)}
              className={"min-w-16 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                (window===item ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{item}</button>)}
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {data.indices.map(index=><article key={index.key} className="rounded-3xl border border-border/70 bg-card/55 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold">{index.name}</p><p className="mt-1 text-[11px] text-muted-foreground">6-hour observed severity · 0–100</p></div>
              <span className={"h-2.5 w-2.5 rounded-full " + TONE[index.key].dot} />
            </div>
            <ObservedBars index={index} window={window} snapshotAsOf={data.snapshotAsOf} />
          </article>)}
        </div>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          Historical backfill uses only observations still present in the existing 72-hour canonical journal. Empty time slots remain empty. Older legacy GRI v1.2 snapshots are not mixed with this distinct methodology.
        </p>
      </section>

      <section id="methodology" className="mt-16 border-t border-border/70 pt-12">
        <SectionHeader eyebrow="03 / HOW TO INTERPRET" title="Transparency built into the score" copy="Every reading is tied to a frozen rubric, native observation timestamps and an issuer-attested payload." />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MethodCard icon={<Globe2 className="h-5 w-5" />} title="Public releases" body="Eligible original-dated public news enters the category severity calculation with ordinary rubric weight." />
          <MethodCard icon={<Radio className="h-5 w-5" />} title="GeoMacro OSINT" body="Monitored, unverified observations contribute at 0.22 weight with bounded potential severity. They are not confirmed incidents or independent corroboration." />
          <MethodCard icon={<ShieldCheck className="h-5 w-5" />} title="Self-certified calculation" body="GeoMacro authenticates its calculation and input fingerprints. It does not assert independent third-party certification of real-world facts." />
        </div>
      </section>

      <section id="integrity" className="mt-16 border-t border-border/70 pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader eyebrow="04 / PROOF & INTEGRITY" title="Evidence you can inspect" copy="Cryptographic fingerprints identify the exact calculation and inputs. The HMAC is verified by GeoMacro's server-held issuer key—not by an external auditor." />
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-primary" /> GeoMacro self-certified</span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <OverviewValue label="Calculated at" value={formatDate(data.snapshotAsOf)} compact />
          <OverviewValue label="Methodology" value={data.parentMethodologyVersion} compact />
          <OverviewValue label="Proof scope" value={data.proofScope} compact />
        </div>
        <details className="group mt-4 rounded-2xl border border-border/70 bg-card/40 p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-primary" /> View calculation fingerprints</span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-5 grid gap-3 border-t border-border/70 pt-5 md:grid-cols-2">
            <HashLine label="Proof hash" value={data.proofHash} />
            <HashLine label="Methodology hash" value={data.methodologyHash} />
            <HashLine label="Input hash" value={data.inputHash} />
            <HashLine label="Evidence hash" value={data.evidenceHash} />
            <HashLine label="Calculation hash" value={data.calculationHash} />
            <HashLine label="Disposition hash" value={data.dispositionHash} />
            <HashLine label="Change hash" value={data.changeHash} />
            <HashLine label="Snapshot ID" value={data.snapshotId} />
          </div>
        </details>
        <p className="mt-5 text-xs leading-6 text-muted-foreground">
          GeoMacro Certified GRI represents source-weighted potential severity, not independently certified event facts, financial forecasts, market probabilities or trading instructions.
        </p>
      </section>
    </div>
  </main>;
}

function Eyebrow({children}:{children:ReactNode}){return <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">{children}</p>;}
function SectionHeader({eyebrow,title,copy}:{eyebrow:string;title:string;copy:string}){
  return <div className="max-w-3xl"><Eyebrow>{eyebrow}</Eyebrow><h2 id={eyebrow.startsWith("02")?"history-heading":eyebrow.startsWith("01")?"risk-domain-heading":undefined} className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{copy}</p></div>;
}
function OverviewValue({label,value,icon,compact=false}:{label:string;value:string;icon?:ReactNode;compact?:boolean}){
 return <div className="min-w-0 rounded-2xl border border-border/65 bg-card/50 px-4 py-4 sm:px-5">
  <div className="flex items-center justify-between gap-2 text-muted-foreground"><span className="text-[10px] font-medium uppercase tracking-[0.13em]">{label}</span>{icon}</div>
  <p className={"mt-3 break-words font-semibold tabular-nums tracking-tight "+(compact?"text-xs sm:text-sm":"text-2xl sm:text-3xl")}>{value}</p>
 </div>;
}
function IndexCard({index}:{index:PublicRiskIndex}){
 const tone=TONE[index.key],valid=index.status==="available" && index.score!==null;
 return <article className={"relative overflow-hidden rounded-3xl border border-border/75 bg-gradient-to-br p-5 shadow-sm sm:p-6 "+tone.surface}>
  <div className="flex items-start justify-between gap-3">
   <div><p className="font-mono text-[10px] uppercase tracking-[0.17em] text-muted-foreground">DOMAIN / {tone.number}</p><h3 className="mt-3 text-lg font-semibold leading-tight">{index.name}</h3></div>
   <span className={"inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/40 font-mono text-xs "+tone.color}>{tone.number}</span>
  </div>
  {valid?<div className="mt-9 flex flex-wrap items-end gap-3">
    <span className="text-6xl font-semibold leading-none tabular-nums tracking-tight">{index.score}</span>
    <span className="mb-1 text-sm text-muted-foreground">/ 100</span>
    <RiskBadge score={index.score!}/>
   </div>:<div className="mt-9 min-h-20"><p className="text-2xl font-semibold">Unavailable</p><p className="mt-2 text-sm text-muted-foreground">No qualifying observed signal. No zero-risk estimate is inferred.</p></div>}
  <p className="mt-5 flex items-center gap-2 border-b border-border/60 pb-5 text-[11px] text-muted-foreground">
    <Clock3 className="h-3.5 w-3.5" /> {index.readingAsOf ? (index.readingStatus==="current"?"Recent observation · ":"Last observed · ")+formatDate(index.readingAsOf) : "No original release date"}
  </p>
  <dl className="grid grid-cols-2 gap-x-4 gap-y-5 pt-5">
    <Metric label="Public news" value={index.sourceMix?.public_news.toLocaleString() ?? "—"} />
    <Metric label="GeoMacro OSINT" value={index.sourceMix?.osint.toLocaleString() ?? "—"} />
    <Metric label="Confidence" value={index.confidence===null?"—":Math.round(index.confidence)+"%"} />
    <Metric label="Source count" value={index.eventCount ? index.sourceCount.toLocaleString():"—"} />
  </dl>
  {index.topEvent?<div className="mt-6 rounded-xl border border-border/60 bg-background/35 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Latest observed signal</p><p className="mt-2 line-clamp-3 text-sm font-medium leading-6">{index.topEvent.title}</p></div>:null}
 </article>;
}
function Metric({label,value}:{label:string;value:string}){return <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt><dd className="mt-1.5 text-lg font-semibold tabular-nums">{value}</dd></div>;}
function ObservedBars({index,window,snapshotAsOf}:{index:PublicRiskIndex;window:NewsSeverityWindow;snapshotAsOf:string}){
 const frame=index.observedSeverity?.[window];
 const buckets=frame?.buckets;
 const end=Date.parse(snapshotAsOf);
 if(!Number.isFinite(end)||!buckets?.length) return <div className="mt-5 flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 px-5 text-center text-xs leading-6 text-muted-foreground">No observed severity points in this window. Missing data is not zero risk.</div>;
 const start=Math.floor((end-Number.parseInt(window,10)*3600000)/SIX_HOURS)*SIX_HOURS;
 const ticks=Array.from({length:Math.ceil((end-start)/SIX_HOURS)},(_,i)=>start+i*SIX_HOURS);
 const byTime=new Map(buckets.map(b=>[b.t,b]));
 const tone=TONE[index.key];
 return <div className="mt-6">
  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
   <span className="text-xs text-muted-foreground">{buckets.reduce((n,b)=>n+b.count,0)} observations in {buckets.length} active bins</span>
   <span className="text-xs font-medium tabular-nums">{frame.low?.toFixed(0)}–{frame.high?.toFixed(0)} observed</span>
  </div>
  <div className="relative flex h-40 items-end gap-1 border-b border-border/80 pb-1" role="img" aria-label={index.name+", "+window+": "+buckets.length+" observed six-hour severity buckets, empty bins indicate no observations"}>
   {ticks.map(t=>{
    const bucket=byTime.get(t);
    return <div key={t} className="flex h-full min-w-0 flex-1 items-end" title={bucket?new Date(t).toISOString()+" · severity "+bucket.avg+" · "+bucket.count+" observations":"No observation recorded in this interval"}>
      {bucket?<div className={"w-full rounded-t-sm opacity-80 transition-opacity hover:opacity-100 "+tone.dot} style={{height:Math.max(2,Math.min(100,bucket.avg))+"%"}} />:
        <div className="h-px w-full bg-border/50" />}
    </div>;
   })}
  </div>
  <div className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>{formatShort(start)}</span><span>{formatShort(end)}</span></div>
 </div>;
}
function MethodCard({icon,title,body}:{icon:ReactNode;title:string;body:string}){return <article className="rounded-2xl border border-border/70 bg-card/50 p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p></article>;}
function HashLine({label,value}:{label:string;value:string|null}){return <div className="min-w-0 rounded-xl bg-muted/30 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 break-all font-mono text-xs">{value??"Not recorded"}</p></div>;}
function formatDate(input:string){const time=Date.parse(input);return Number.isFinite(time)?new Date(time).toLocaleString(undefined,{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}):"Not recorded";}
function formatShort(time:number){return new Date(time).toLocaleDateString(undefined,{day:"numeric",month:"short"});}
