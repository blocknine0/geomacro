import {useEffect,useState} from 'react';
type Quote={instrument:string;value:number;observed_at:string;quote_kind:string};
type FxReference={provider:"ECB_DAILY_REFERENCE";reference_date:string;base:"EUR";intraday_live_verified:false;rates:{currency:string;per_eur:number}[]};
type MacroSnapshot={schema:string;category:string;checked_at:string|null;status:string;price_status:string;prices:Quote[];fx_reference?:FxReference|null;scheduled_releases:{kind:string;at:string}[]};
/** One cached snapshot per five-minute desk visit; never a per-card price request. */
export function MacroFastlanePanel(){
 const [snapshot,setSnapshot]=useState<MacroSnapshot|null>(null);
 useEffect(()=>{
  let live=true;const controller=new AbortController();
  const read=async()=>{try{
   const response=await fetch('https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/macro-fastlane',{redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
   if(!response.ok)throw Error('unavailable');
   const s=await response.json() as MacroSnapshot;
   if(s.schema!=='geomacro.macro-fastlane-public.v1'||s.category!=='macro'||!Array.isArray(s.prices))throw Error('invalid');
   if(live)setSnapshot(s);
  }catch{if(live)setSnapshot(null);}};
  void read();const timer=setInterval(read,300000);
  return()=>{live=false;controller.abort();clearInterval(timer);};
 },[]);
 const now=Date.now();
 const quotes=(snapshot?.prices??[]).filter(q=>Number.isFinite(q.value)&&q.value>0&&Date.parse(q.observed_at)<=now&&now-Date.parse(q.observed_at)<=300000);
 const fx=snapshot?.fx_reference;
 const fxDate=fx?Date.parse(fx.reference_date+"T00:00:00Z"):NaN;
 const fxValid=fx?.provider==="ECB_DAILY_REFERENCE"&&fx.base==="EUR"&&fx.intraday_live_verified===false&&
  Number.isFinite(fxDate)&&fxDate<=now&&now-fxDate<=8*86400000&&
  Array.isArray(fx.rates)&&["USD","GBP","JPY"].every(code=>fx.rates.some(rate=>rate.currency===code&&Number.isFinite(rate.per_eur)&&rate.per_eur>0));
 return <section aria-label="Macro Economics Forex and Precious Metals" className="mt-5 rounded-xl border border-border bg-card p-4">
  <h2 className="text-sm font-semibold">Macro Economics · Forex &amp; Precious Metals</h2>
  <p className="mt-1 text-xs text-muted-foreground">Currency policy, inflation, jobs, gold demand and silver supply. Each release keeps one event identity across relevant markets.</p>
  <div className="mt-3 flex flex-wrap gap-4 text-sm">
   {quotes.map(q=><p key={q.instrument}><strong>{q.instrument}</strong> {new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:3}).format(q.value)} <span className="text-xs text-muted-foreground">per troy oz · {new Date(q.observed_at).toLocaleTimeString()} · provider indication</span></p>)}
   {quotes.length<2&&<p className="text-xs text-muted-foreground">Current gold/silver price evidence is incomplete. News continues independently.</p>}
  </div>
  <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground" aria-label="Official daily foreign exchange reference">
   {fxValid&&fx ? <>
    <p className="font-medium text-foreground">ECB daily FX reference · {fx.reference_date}</p>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
     {fx.rates.map(rate=><span key={rate.currency}>1 EUR = {rate.per_eur.toLocaleString("en-US",{maximumFractionDigits:5})} {rate.currency}</span>)}
    </div>
    <p className="mt-1">Official daily reference (not a live executable quote or trading rate). Weekends and holidays may retain the last working-day reference.</p>
   </> : <p>Verified ECB daily FX reference temporarily unavailable.</p>}
  </div>
  <p className="mt-2 text-xs text-muted-foreground">News polling: 5-minute target; scheduled critical releases: 1-minute polling target. Delivery latency is not guaranteed. Intraday live FX quotes are not configured.</p>
 </section>;
}
