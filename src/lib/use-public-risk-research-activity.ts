import {useCallback,useEffect,useState} from "react";
import {fetchDirectDerivedNews} from "./public-derived-news-client";
import {summarizePublicRiskResearch,type PublicRiskResearchActivity} from "./risk-indices-public-research";

type State={status:"loading"|"ready"|"unavailable";rows:PublicRiskResearchActivity[]|null};
const REFRESH_MS=5*60_000;
/** Public immutable archive only. Private signed per-news scores are never fetched. */
export function usePublicRiskResearchActivity(){
 const [state,setState]=useState<State>({status:"loading",rows:null});
 const [cycle,setCycle]=useState(0);
 const retry=useCallback(()=>setCycle(v=>v+1),[]);
 useEffect(()=>{
  let cancelled=false;
  async function load(){
   try{
    const now=Date.now();
    const signals=await fetchDirectDerivedNews(fetch,now);
    const rows=summarizePublicRiskResearch(signals,now);
    if(!cancelled)setState({status:"ready",rows});
   }catch{
    // A transport failure is unknown, not proof of zero activity.
    if(!cancelled)setState({status:"unavailable",rows:null});
   }
  }
  void load();
  const timer=window.setInterval(()=>void load(),REFRESH_MS);
  return ()=>{cancelled=true;window.clearInterval(timer)};
 },[cycle]);
 return {...state,retry};
}
