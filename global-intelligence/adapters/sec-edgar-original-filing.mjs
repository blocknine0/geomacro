import {createHash} from "node:crypto";
const SUBMISSIONS_URL="https://data.sec.gov/submissions/CIK0000320193.json";
const CIK="320193"; // pinned official SEC issuer pilot only
const BASE="https://www.sec.gov/Archives/edgar/data/";
const HEAD_LIMIT=64*1024;
const SUBMISSIONS_LIMIT=768*1024;
const FORM_TYPES=new Set(["8-K","10-Q","10-K"]);
const AGENT="Geomacro Source Integrity contact@geomacro.live";
export function selectSecOriginalFiling(submissions,{now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("SEC_CLOCK_INVALID");
 if(String(submissions?.cik)!==CIK&&String(submissions?.cik)!=="0000320193")
   throw Error("SEC_ISSUER_IDENTITY_MISMATCH");
 const r=submissions?.filings?.recent;
 if(!r||!Array.isArray(r.form)||!Array.isArray(r.accessionNumber)||
    !Array.isArray(r.filingDate)||
    r.form.length!==r.accessionNumber.length||
    r.form.length!==r.filingDate.length)throw Error("SEC_SUBMISSIONS_SHAPE_INVALID");
 const rows=[];
 for(let i=0;i<r.form.length;i++){
   if(!FORM_TYPES.has(r.form[i]))continue;
   const accession=String(r.accessionNumber[i]??"");
   const filed=String(r.filingDate[i]??"");
   if(!/^\d{10}-\d{2}-\d{6}$/.test(accession)||
      !/^20\d{2}-\d{2}-\d{2}$/.test(filed))continue;
   const d=Date.parse(filed+"T00:00:00Z");
   if(!Number.isFinite(d)||new Date(d).toISOString().slice(0,10)!==filed||
      d>now.getTime()+86400000||d<now.getTime()-366*86400000)continue;
   // A complete SEC submission .txt contains a source-native header.
   // Do not infer identity from an unrelated HTML document.
   const digits=accession.replaceAll("-","");
   rows.push({
     issuer_cik:CIK,accession,form:r.form[i],filing_date:filed,
     url:BASE+CIK+"/"+digits+"/"+accession+".txt",
   });
 }
 rows.sort((a,b)=>b.filing_date.localeCompare(a.filing_date));
 if(!rows.length)throw Error("SEC_NO_RECENT_VERIFIABLE_FILING");
 return rows[0];
}
export function verifySecOriginalHeader(filing,prefix){
 if(typeof prefix!=="string"||prefix.length<100||prefix.length>HEAD_LIMIT||
    !prefix.includes("<SEC-DOCUMENT>")||!prefix.includes("<SEC-HEADER>"))
   throw Error("SEC_NATIVE_HEADER_UNVERIFIED");
 const a=prefix.match(/^\s*ACCESSION NUMBER:\s*(\d{10}-\d{2}-\d{6})\s*$/m);
 const t=prefix.match(/^\s*CONFORMED SUBMISSION TYPE:\s*([A-Z0-9/-]+)\s*$/m);
 const d=prefix.match(/^\s*FILED AS OF DATE:\s*(\d{8})\s*$/m);
 if(!a||!t||!d||a[1]!==filing.accession||t[1]!==filing.form||
    d[1]!==filing.filing_date.replaceAll("-",""))
   throw Error("SEC_ORIGINAL_FILING_SCOPE_MISMATCH");
 const header=prefix.split(/<\/SEC-HEADER>/i)[0];
 return {
   schema:"geomacro.sec-original-filing-header.v1",
   issuer_cik:CIK,form:filing.form,filing_date:filing.filing_date,
   header_sha256:createHash("sha256").update(header).digest("hex"),
   original_submission_identity_verified:true,
   full_document_downloaded:false,
   original_publisher_article_clock_verified:false,
   derived_country_impact_verified:false,
   commercial_use_certified:false,
   signed_current_intelligence:false,
 };
}
async function boundedText(url,maxBytes,{fetchImpl=fetch,range=null}={}){
 const response=await fetchImpl(url,{
   method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),
   headers:{"accept":"text/plain,application/json;q=0.8",
     "user-agent":AGENT,...(range?{"range":"bytes=0-"+(maxBytes-1)}:{})}
 });
 if(!response.ok){
   await response.body?.cancel().catch(()=>{});
   throw Error("SEC_HTTP_"+response.status);
 }
 if(!response.body)throw Error("SEC_BODY_MISSING");
 if(!range&&Number(response.headers.get("content-length")??0)>maxBytes)
   throw Error("SEC_BODY_LIMIT");
 const reader=response.body.getReader(),chunks=[];
 let n=0;
 try{
   for(;;){
     const {done,value}=await reader.read();if(done)break;
     if(n+value.byteLength>maxBytes){
       if(!range)throw Error("SEC_BODY_LIMIT");
       const allowed=maxBytes-n;if(allowed>0)chunks.push(value.slice(0,allowed));
       n=maxBytes;break;
     }
     chunks.push(value);n+=value.byteLength;
     if(range&&n>=maxBytes)break;
   }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(n);let offset=0;
 for(const ch of chunks){bytes.set(ch,offset);offset+=ch.byteLength;}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
 catch{throw Error("SEC_CHARSET_UNVERIFIED");}
}
export async function verifySecFilingProduction({
 fetchImpl=fetch,now=new Date(),
}={}){
 let submissions;
 try{submissions=JSON.parse(await boundedText(SUBMISSIONS_URL,SUBMISSIONS_LIMIT,{fetchImpl}));}
 catch(e){if(String(e.message).startsWith("SEC_"))throw e;throw Error("SEC_SUBMISSION_INDEX_UNVERIFIED");}
 const selected=selectSecOriginalFiling(submissions,{now});
 const prefix=await boundedText(selected.url,HEAD_LIMIT,{fetchImpl,range:true});
 return verifySecOriginalHeader(selected,prefix);
}
