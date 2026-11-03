/**
 * Safe diagnostics for specifically identified code scanning alerts.
 * Prints only public repository source paths, rules, line numbers and
 * short finding messages. No token or original source content is emitted.
 */
const REPO="blocknine0/geomacro";
const alerts=[115,120,107];
if (process.env.GITHUB_REPOSITORY!==REPO || !process.env.GH_TOKEN)
 throw Error("CODEQL_DIAGNOSTIC_SCOPE_INVALID");
for(const n of alerts){
 const response=await fetch(
   "https://api.github.com/repos/"+REPO+"/code-scanning/alerts/"+n,
   {method:"GET",redirect:"error",headers:{
     authorization:"Bearer "+process.env.GH_TOKEN,
     accept:"application/vnd.github+json",
     "X-GitHub-Api-Version":"2022-11-28"
    },signal:AbortSignal.timeout(15000)}
 );
 if(response.status!==200)throw Error("CODEQL_ALERT_FETCH_HTTP_"+response.status);
 const a=await response.json();
 if(a.number!==n)throw Error("CODEQL_ALERT_ID_MISMATCH");
 const x=a.most_recent_instance??{};
 const loc=x.location??{};
 const msg=String(x.message?.text??a.rule?.description??"").slice(0,500);
 console.log(JSON.stringify({alert:n,state:a.state,rule:a.rule?.id??null,
   path:loc.path??null,start_line:loc.start_line??null,
   end_line:loc.end_line??null,message:msg,tool:a.tool?.name??null}));
}
