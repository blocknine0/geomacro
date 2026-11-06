// Read-only CI diagnostic. Never accesses secret values, appends or dismisses alerts.
import {readFileSync} from "node:fs";
const REPO="blocknine0/geomacro";
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,"utf8"));
// A pull_request workflow checks out a synthetic merge SHA, but CodeQL check
// results are attached to the actual PR head SHA.
const sha=String(event.pull_request?.head?.sha??process.env.GITHUB_SHA??"");
const token=String(process.env.GH_TOKEN??"");
if(process.env.GITHUB_REPOSITORY!==REPO||!/^[a-f0-9]{40}$/.test(sha)||token.length<20)
 throw Error("CODEQL_PR_ANNOTATION_SCOPE_INVALID");
async function github(path){
 const r=await fetch("https://api.github.com/repos/"+REPO+path,{
  headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28"},
  redirect:"error",signal:AbortSignal.timeout(15000)});
 if(r.status!==200)throw Error("CODEQL_PR_ANNOTATION_HTTP_"+r.status);
 return r.json();
}
for(let attempt=0;attempt<20;attempt++){
 const checks=await github("/commits/"+sha+"/check-runs?per_page=100");
 const codeql=checks.check_runs?.filter(c=>c.name==="CodeQL"&&c.head_sha===sha)
   .sort((a,b)=>b.id-a.id)[0];
 if(codeql?.status==="completed"){
  const total=Number(codeql.output?.annotations_count??0),rows=[];
  for(let page=1;page<=Math.ceil(total/100);page++){
   const anns=await github("/check-runs/"+codeql.id+"/annotations?per_page=100&page="+page);
   if(!Array.isArray(anns))throw Error("CODEQL_ANNOTATIONS_INVALID");
   for(const a of anns)rows.push({path:a.path,line:a.start_line,
    level:a.annotation_level,title:String(a.title??"").slice(0,180),
    message:String(a.message??"").slice(0,320)});
  }
  console.log(JSON.stringify({schema:"geomacro.codeql-pr-annotations.v1",sha,
   status:codeql.conclusion,annotations:rows}));
  process.exit(0);
 }
 await new Promise(resolve=>setTimeout(resolve,5000));
}
throw Error("CODEQL_PR_CHECK_NOT_YET_PROCESSED");
