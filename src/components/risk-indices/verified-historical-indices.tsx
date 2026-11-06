import {useEffect,useState} from "react";
import {Clock3,Archive,ShieldAlert} from "lucide-react";
import type {PublicRiskIndices} from "@/lib/risk-indices.types";

/**
 * Separate read-only archival surface. NEVER feeds the current GRI hook,
 * signed current API, billing, or numerical scoring. The original signed
 * snapshot date is retained; archived values are not current signals.
 */
type ArchiveState={status:"loading"|"available"|"unavailable";data:PublicRiskIndices|null};
const empty:ArchiveState={status:"loading",data:null};

export function VerifiedHistoricalRiskIndices(){
 const [state,setState]=useState<ArchiveState>(empty);
 useEffect(()=>{
  const controller=new AbortController();
  let active=true;
  async function read(){
   try{
    const response=await fetch("/api/public/risk-indices-history",{
     method:"GET",redirect:"error",cache:"no-store",
     headers:{Accept:"application/json"},signal:controller.signal});
    if(response.status!==200||response.redirected)throw Error("ARCHIVE_UNAVAILABLE");
    const result=await response.json();
    const data=result?.data as PublicRiskIndices|undefined;
    if(result?.ok!==true||result?.meta?.display_status!=="last_verified"||
      result?.meta?.current!==false||
      result?.meta?.customer_chargeable!==false||
      result?.meta?.source_as_of!==data?.snapshotAsOf||
      data?.verificationStatus!=="verified"||
      data?.parentMethodologyVersion!=="gri-v1.2.0"||
      data?.proofScope!=="verified-category-projection"||
      !Array.isArray(data.indices)||data.indices.length!==3||
      data.indices.some(index=>index.status!=="available"||
       typeof index.score!=="number"||!Number.isFinite(index.score)||
       !Number.isFinite(Date.parse(index.readingAsOf??""))))
       throw Error("ARCHIVE_UNTRUSTED");
    if(active)setState({status:"available",data});
   }catch{
    if(active)setState({status:"unavailable",data:null});
   }
  }
  void read();
  return ()=>{active=false;controller.abort();};
 },[]);
 if(state.status==="loading")return <section aria-label="Historical Risk Indices" className="mt-10 text-sm text-muted-foreground">
  Checking historical snapshot availability…
 </section>;
 if(state.status==="unavailable"||!state.data)return <section aria-label="Historical Risk Indices" className="mt-10 rounded-2xl border border-border/70 bg-card/40 p-5 text-sm text-muted-foreground">
  <div className="flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4"/>Previously verified history unavailable</div>
  <p className="mt-2">The archive could not be authenticated. No numeric values have been substituted.</p>
 </section>;
 const data=state.data;
 return <section aria-label="Archived historical Risk Indices — not live" className="mt-10 border-t border-border/70 pt-8">
  <h2 className="flex items-center gap-2 text-lg font-semibold"><Archive className="h-5 w-5"/>Last verified historical snapshot — not live</h2>
  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
   Archived GRI v1.2 readings shown at their original source timestamps. These figures are not a current risk assessment, independent re-review, trade signal, or paid output. Current certification is unavailable.
  </p>
  <div className="mt-5 grid gap-4 lg:grid-cols-3">
   {data.indices.map(index=><article key={index.key} className="rounded-2xl border border-border/70 bg-card/50 p-5">
    <p className="text-sm font-semibold">{index.name}</p>
    <p className="mt-4 text-4xl font-semibold tabular-nums">{index.score}<span className="ml-1 text-sm font-normal text-muted-foreground">/ 100</span></p>
    <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
     <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
     <span>Source recorded: {index.readingAsOf?new Date(index.readingAsOf).toLocaleString():"Unavailable"}</span>
    </p>
   </article>)}
  </div>
  <p className="mt-4 text-xs text-muted-foreground">
   Original publication: {new Date(data.snapshotAsOf).toLocaleString()} · Historical only · No timestamps refreshed
  </p>
 </section>;
}
