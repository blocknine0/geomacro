import type {OnDemandCategory} from "./on-demand-global-discovery.server";

/**
 * Optional Jev Engineering priority decision, never an evidence verifier.
 * Default ZERO additional cost: no call without BOTH an explicit opt-in flag
 * and a privately provisioned TypeSafe key.
 * Only category counts go to Jev; no user question, feed name, article text,
 * article URL, identity, publisher ID, source hash or risk output.
 */
export type JevSourcePriorityInput=Readonly<{
  category:OnDemandCategory;
  first_party_native_dated_count:number;
  first_party_index_only_count:number;
}>;
const CATEGORIES=new Set<OnDemandCategory>(["geopolitics","macro","rare_earth"]);
const ORIGIN="https://api.typesafe.ai/v1/systemone";
const MAX_RESPONSE_BYTES=4*1024;

export async function chooseJevSourceReviewPriority(
  input:readonly JevSourcePriorityInput[],
  options:{fetchImpl?:typeof fetch;key?:string|null;enabled?:boolean}={},
):Promise<OnDemandCategory|null>{
  const key=options.key??(typeof process==="undefined"?"":
    process.env.TYPESAFE_API_KEY??"");
  const enabled=options.enabled??(typeof process!=="undefined" &&
    process.env.GEOMACRO_JEV_SOURCE_ROUTING==="enabled");
  // No default network traffic, no API key or card required for free launch.
  if(!enabled || typeof key!=="string" || !key.trim() ||
    !Array.isArray(input) || input.length<2 || input.length>3 ||
    new Set(input.map(x=>x.category)).size!==input.length ||
    input.some(x=>!CATEGORIES.has(x.category)||
      !Number.isSafeInteger(x.first_party_native_dated_count)||
      x.first_party_native_dated_count<0||x.first_party_native_dated_count>16||
      !Number.isSafeInteger(x.first_party_index_only_count)||
      x.first_party_index_only_count<0||x.first_party_index_only_count>16))
    return null;
  const criteria=Object.fromEntries(input.map(x=>[
    x.category,
    "Prioritize independent original article publication-date verification for "+x.category,
  ]));
  try{
    const response=await (options.fetchImpl??fetch)(ORIGIN,{
      method:"POST",redirect:"error",cache:"no-store",
      headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"jev-latest",
        state:{purpose:"bounded source review order, NOT factual verification",
          categories:input.map(x=>({
            category:x.category,native_dated_count:x.first_party_native_dated_count,
            index_only_count:x.first_party_index_only_count,
          }))},
        questions:{next_category:{
          type:"choice",
          instructions:"Which available category should receive the next limited original-publisher article check? Prefer undercovered categories. This is only routing, never a factual judgment.",
          criteria,
        }},
      }),
      signal:AbortSignal.timeout(1200),
    });
    if(!response.ok || Number(response.headers.get("content-length")||0)>MAX_RESPONSE_BYTES)
      return null;
    const body=await response.text();
    if(body.length>MAX_RESPONSE_BYTES)return null;
    const parsed:unknown=JSON.parse(body);
    if(!parsed || typeof parsed!=="object")return null;
    const responseObject=parsed as {answers?:{next_category?:{
      type?:unknown;choice?:unknown;confidence?:unknown;
      probabilities?:Record<string,unknown>}}};
    const answer=responseObject.answers?.next_category;
    if(!answer || answer.type!=="choice" ||
      typeof answer.choice!=="string" ||
      !input.some(x=>x.category===answer.choice)||
      typeof answer.confidence!=="number"||answer.confidence<0.65||
      answer.confidence>1||
      typeof answer.probabilities?.[answer.choice]!=="number"||
      (answer.probabilities[answer.choice] as number)<0.65||
      (answer.probabilities[answer.choice] as number)>1)return null;
    return answer.choice as OnDemandCategory;
  }catch{
    // 401/402/403/429/5xx or transport errors never lead to a retry,
    // unapproved provider, lost existing evidence or payment authorization.
    return null;
  }
}
