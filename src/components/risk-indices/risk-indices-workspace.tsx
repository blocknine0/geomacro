import { type ReactNode } from "react";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Fingerprint, Globe2, Layers3, Radio, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/foundation/risk";
import { useRiskIndices } from "@/lib/use-risk-indices";
import {VerifiedHistoricalRiskIndices} from "./verified-historical-indices";
import type { PublicRiskIndex } from "@/lib/risk-indices.types";

const TONE = {
  geopolitics: { number: "01", color: "text-rose-400", surface: "from-rose-500/10 via-card/80 to-card/65", dot: "bg-rose-400" },
  macro: { number: "02", color: "text-sky-400", surface: "from-sky-500/10 via-card/80 to-card/65", dot: "bg-sky-400" },
  critical_minerals: { number: "03", color: "text-amber-400", surface: "from-amber-500/10 via-card/80 to-card/65", dot: "bg-amber-400" },
} as const;

export function RiskIndicesWorkspace() {
  const risk = useRiskIndices();
  if (!risk.data) return <main className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div>
        <Eyebrow>GEOMACRO / RISK INTELLIGENCE</Eyebrow>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Three risks. Three separate indices.</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          {risk.status === "error" ? "Current independently reviewed signed GRI values unavailable" : "Checking genuine reviewer-signed GRI v1.2 inputs"}
        </p>
      </div>
      <Button variant="outline" onClick={risk.retry}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
    </div>
    <div className="mt-10 grid gap-4 lg:grid-cols-3">
      {["Geopolitical Risk Index","Macroeconomic Risk Index","Critical Minerals Risk Index"].map(name=>
        <article key={name} className="min-h-52 rounded-3xl border border-border/70 bg-card/50 p-6">
          <h2 className="text-lg font-semibold">{name}</h2>
          <p className="mt-6 text-5xl font-semibold tabular-nums" aria-label="No verified current reading">—</p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">Authentic independent reviewer certificates and a current signed GRI v1.2 publication are required. No triage, cached historic or artificial zero score is substituted.</p>
        </article>)}
    </div>
    <VerifiedHistoricalRiskIndices />
  </main>;

  const data = risk.data;
  const selfCertified=data.proofScope==="geomacro-news-severity";
  const latest = data.indices.filter(index => index.readingAsOf).map(index => Date.parse(index.readingAsOf ?? "")).filter(Number.isFinite);
  const latestObserved = latest.length ? new Date(Math.max(...latest)).toISOString() : null;
  const qualified = data.indices.filter(index => index.status === "available").length;
  const count = data.indices.reduce((n, index) => n + index.eventCount, 0);

  return <main className="relative isolate overflow-hidden pb-24">
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(ellipse_at_18%_8%,hsl(var(--primary)/0.13),transparent_55%)]" />
    <div className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:pt-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Eyebrow>Geomacro Risk Indices</Eyebrow>
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
            <ShieldCheck className="h-3.5 w-3.5" /> {selfCertified?"Self-certified 72h news-severity proxy":"Reviewer-gated GRI v1.2"}
          </div>
          <h1 aria-label="Three risks. Three separate indices." className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
            Three risks.<span className="block text-muted-foreground">Three separate indices.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            {selfCertified
              ?"Current 72-hour journal-derived indicators. GeoMacro signs calculation integrity; observed OSINT facts are not independently verified."
              :"Current numerical geopolitical, macroeconomic and critical-mineral readings from authentic independent review and canonical signed GRI v1.2."}
          </p>
          <p className="mt-3 max-w-2xl text-xs leading-6 text-muted-foreground">
            {selfCertified
              ?"The Ed25519 signature verifies the exact GeoMacro calculation payload. It does not prove event facts or independent review. 7D and 30D history is unavailable from this 72-hour journal."
              :"The Ed25519 delivery signature proves issuer integrity; genuine reviewer input is verified separately."} Not investment advice.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Current source clock limit</span>
            <Clock3 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 flex items-baseline gap-2"><span className="text-5xl font-semibold tabular-nums tracking-tight">60</span><span className="text-sm text-muted-foreground">minutes max</span></div>
          <div className="mt-4 border-t border-border/70 pt-4 text-xs leading-6 text-muted-foreground">
            {selfCertified?"Journal snapshot clock: ":"Verified source clock: "}<span className="font-medium text-foreground">{latestObserved ? formatDate(latestObserved) : "Not available"}</span>.
            {selfCertified?"Self-certified calculation only; facts remain unverified.":"No review certificate, no certified score."}
          </div>
        </div>
      </section>

      <section aria-label="Source overview" className="grid grid-cols-2 gap-3 py-7 md:grid-cols-4">
        <OverviewValue label="Qualified signals" value={count.toLocaleString()} icon={<Activity className="h-4 w-4" />} />
        <OverviewValue label="Verification" value={data.verificationStatus} icon={<ShieldCheck className="h-4 w-4" />} />
        <OverviewValue label="Methodology" value={data.parentMethodologyVersion} compact icon={<Radio className="h-4 w-4" />} />
        <OverviewValue label="Domains available" value={qualified + " / 3"} icon={<Layers3 className="h-4 w-4" />} />
      </section>

      <section aria-labelledby="risk-domain-heading" id="risk-domains" className="pt-3">
        <SectionHeader eyebrow="01 / LIVE RISK READINGS" title={selfCertified?"72-hour news-severity indicators by domain":"Reviewed signed scores by domain"} copy={selfCertified?"Signals are weighted by provenance; monitored OSINT remains explicitly unverified and is not event corroboration. Empty categories remain unavailable, never zero risk.":"Verified and independently reviewed GRI v1.2 scores only; missing evidence cannot become a numerical risk level."} />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {data.indices.map(index=><IndexCard key={index.key} index={index} selfCertified={selfCertified} />)}
        </div>
      </section>

      <section aria-labelledby="history-heading" id="history" className="mt-16 border-t border-border/70 pt-12">
        <SectionHeader eyebrow="02 / VERIFIED HISTORY" title={selfCertified?"Journal history window":"Verified GRI history"} copy={selfCertified?"Only source-native 24H, 48H, and 72H observations are available. 7D and 30D reviewed history is not inferred from this 72-hour dataset.":"7-day and 30-day reviewed snapshot series only. No unreviewed 72-hour severity observations appear as certified history."} />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {data.indices.map(index=><article key={index.key} className="rounded-3xl border border-border/70 bg-card/55 p-6">
            <h3 className="font-semibold">{index.name}</h3>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Metric label={selfCertified?"7D available buckets":"7D reviewed buckets"} value={String(index.series?.["7D"]?.buckets?.length??0)} />
              <Metric label={selfCertified?"30D available buckets":"30D reviewed buckets"} value={String(index.series?.["30D"]?.buckets?.length??0)} />
            </div>
          </article>)}
        </div>
      </section>

      <section id="methodology" className="mt-16 border-t border-border/70 pt-12">
        <SectionHeader eyebrow="03 / HOW TO INTERPRET" title={selfCertified?"Self-certified calculation and signed delivery":"Reviewer-gated evidence and signed delivery"} copy={selfCertified?"GeoMacro's Ed25519 signature authenticates the calculation payload only. It does not imply reviewer authorization, independent event verification, commercial source rights, or a full 7-day/30-day history.":"Authentic reviewer authorization, source-native timestamps, verified B2 storage and canonical D1 readback are prerequisites."} />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MethodCard icon={<Globe2 className="h-5 w-5" />} title="Public releases" body="Independent original-source corroboration and source-rights eligibility are enforced by the canonical reviewed publisher." />
          <MethodCard icon={<Radio className="h-5 w-5" />} title="GeoMacro OSINT" body="Authentic owner and independent reviewer certificates are mandatory; triage never substitutes for signed review." />
          <MethodCard icon={<ShieldCheck className="h-5 w-5" />} title="Self-certified calculation" body="A separate Ed25519 delivery signature authenticates the published payload; its key does not replace reviewer signatures." />
        </div>
      </section>

      <section id="integrity" className="mt-16 border-t border-border/70 pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader eyebrow="04 / PROOF & INTEGRITY" title="Evidence you can inspect" copy="Cryptographic fingerprints identify the exact calculation and inputs. The Ed25519 delivery signature is publicly verifiable; independent reviewer certification is checked by the protected issuer workflow." />
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-primary" /> {selfCertified?"Issuer-signed self-certified proxy":"Issuer-signed reviewed GRI"}</span>
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
          {selfCertified?"A self-certified news-severity score is not an independently reviewed GRI, probability, forecast, trading instruction or execution authorization.":"A reviewed GRI score is not a probability, forecast, trading instruction or execution authorization."}
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
function IndexCard({index,selfCertified=false}:{index:PublicRiskIndex;selfCertified?:boolean}){
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
  </div>:<div className="mt-9 min-h-20"><p className="text-2xl font-semibold">Unavailable</p><p className="mt-2 text-sm text-muted-foreground">{selfCertified?"No eligible journal evidence; no zero score is inferred.":"No current reviewed GRI; no numeric replacement is inferred."}</p></div>}
  <p className="mt-5 flex items-center gap-2 border-b border-border/60 pb-5 text-[11px] text-muted-foreground">
    <Clock3 className="h-3.5 w-3.5" /> {index.readingAsOf ? (selfCertified?"Journal observation · ":index.readingStatus==="current"?"Current reviewed source · ":"Previously reviewed source · ")+formatDate(index.readingAsOf) : "No certified source clock"}
  </p>
  <dl className="grid grid-cols-2 gap-x-4 gap-y-5 pt-5">
    <Metric label={selfCertified?"Observed events":"Reviewed events"} value={index.eventCount.toLocaleString()} />
    <Metric label="Independent stories" value={index.independentStoryCount.toLocaleString()} />
    <Metric label="Confidence" value={index.confidence===null?"—":Math.round(index.confidence)+"%"} />
    <Metric label="Source count" value={index.eventCount ? index.sourceCount.toLocaleString():"—"} />
  </dl>
  {index.topEvent?<div className="mt-6 rounded-xl border border-border/60 bg-background/35 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{selfCertified?"Top derived observation":"Reviewed input"}</p><p className="mt-2 line-clamp-3 text-sm font-medium leading-6">{index.topEvent.title}</p></div>:null}
 </article>;
}
function Metric({label,value}:{label:string;value:string}){return <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt><dd className="mt-1.5 text-lg font-semibold tabular-nums">{value}</dd></div>;}
function MethodCard({icon,title,body}:{icon:ReactNode;title:string;body:string}){return <article className="rounded-2xl border border-border/70 bg-card/50 p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p></article>;}
function HashLine({label,value}:{label:string;value:string|null}){return <div className="min-w-0 rounded-xl bg-muted/30 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 break-all font-mono text-xs">{value??"Not recorded"}</p></div>;}
function formatDate(input:string){const time=Date.parse(input);return Number.isFinite(time)?new Date(time).toLocaleString(undefined,{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}):"Not recorded";}
