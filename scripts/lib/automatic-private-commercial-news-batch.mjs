import {lstatSync,readdirSync,realpathSync,readFileSync,existsSync} from "node:fs";
import {join,resolve,isAbsolute,relative,sep} from "node:path";

/**
 * Account for EVERY private commercial request presented to the trusted
 * machine-commercial qualifier, not every upstream article on the Internet.
 * Each request MUST already contain real dual-signed Facts/Rights evidence:
 * the existing canonical acceptor verifies them against approved pins,
 * rereads source HTML/native clocks and checks scoped B2 legal rights.
 *
 * No raw contents or original URLs/IDs are returned or logged. NO payment,
 * production publication, fabricated licence, remote upload, or signing-key
 * substitution. Existing outputs are NEVER assumed current or payable.
 */
const INPUT_SUFFIX=".machine-commercial-request.json";
const OUTPUT_SUFFIX=".machine-commercial-prepared.json";
const NAME=/^[A-Za-z0-9][A-Za-z0-9_-]{0,70}\.machine-commercial-request\.json$/u;
const MAX_ITEMS=60, MAX_INPUT=1024*1024;
const FAIL="AUTOMATIC_PRIVATE_COMMERCIAL_NEWS_BATCH_REJECTED";
const fail=()=>{throw Error(FAIL)};
const repoRoot=realpathSync(new URL("../../",import.meta.url));
function within(root,target){
 const r=relative(root,target);
 return r===""||(!r.startsWith(".."+sep)&&r!==".."&&!isAbsolute(r));
}
export function discoverPrivateCommercialNewsRequests(root){
 if(typeof root!=="string"||!isAbsolute(root))fail();
 let real;
 try{real=realpathSync(root);}catch{fail()}
 let stat;
 try{stat=lstatSync(root);}catch{fail()}
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||
    typeof process.getuid==="function"&&stat.uid!==process.getuid()||
    within(repoRoot,real))fail();
 const names=readdirSync(real).filter(x=>x.endsWith(INPUT_SUFFIX)).sort();
 if(names.length>MAX_ITEMS||names.some(x=>!NAME.test(x)))fail();
 const requests=[];
 for(const name of names){
  const input=join(real,name),out=join(real,name.slice(0,-INPUT_SUFFIX.length)+OUTPUT_SUFFIX);
  let entry;
  try{entry=lstatSync(input);}catch{fail()}
  if(!entry.isFile()||entry.isSymbolicLink()||entry.size<2||
     entry.size>MAX_INPUT||(entry.mode&0o077)!==0||
     typeof process.getuid==="function"&&entry.uid!==process.getuid()||
     !within(real,resolve(input))||!within(real,resolve(out)))fail();
  if(existsSync(out)){
   let previous;
   try{previous=lstatSync(out);}catch{fail()}
   if(!previous.isFile()||previous.isSymbolicLink()||
      (previous.mode&0o077)!==0||
      typeof process.getuid==="function"&&previous.uid!==process.getuid())fail();
  }
  requests.push({input,out,existing:existsSync(out)});
 }
 return requests;
}
export async function processAutomaticPrivateCommercialNewsBatch({
 root,inspect,qualify,maxItems=MAX_ITEMS,
}={}){
 if(typeof inspect!=="function"||typeof qualify!=="function"||
    !Number.isSafeInteger(maxItems)||maxItems<1||maxItems>MAX_ITEMS)fail();
 const queue=discoverPrivateCommercialNewsRequests(root);
 if(queue.length>maxItems)fail();
 const identities=new Set();
 const summary={
  schema:"geomacro.automatic-private-commercial-news-batch.v1",
  submitted_dual_authority_private_requests:queue.length,
  newly_prepared_canonical_signed_gros:0,
  invalid_or_unverified_private_requests:0,
  preexisting_artifacts_not_revalidated:0,
  repeated_event_requests_rejected:0,
  all_submitted_requests_accounted_for:false,
  all_internet_news_commercially_qualified:false,
  current_paid_delivery_authorized:false,
  current_hot_b2_d1_published:false,
  payments:0,raw_upstream_logged:false,
 };
 for(const record of queue){
  if(record.existing){
   summary.preexisting_artifacts_not_revalidated++;
   continue;
  }
  try{
   const input=readFileSync(record.input,"utf8");
   const parsed=await inspect(input);
   const category=parsed?.category, country=parsed?.country_iso3,
     id=parsed?.event_id;
   if(!["geopolitics","macro","rare_earth"].includes(category)||
      typeof country!=="string"||!/^[A-Z]{3}$/u.test(country)||
      typeof id!=="string"||!/^[a-zA-Z0-9_.:-]{3,190}$/u.test(id))
    fail();
   const unique=[category,country,id].join(":");
   if(identities.has(unique)){
    summary.repeated_event_requests_rejected++;continue;
   }
   // A malformed earlier candidate must not reserve an event forever and
   // starve a later independently valid dual-attested request in this batch.
   // Only successful canonical results reserve a unique event identity.
   const result=await qualify(record.input,record.out);
   if(result?.status!=="MACHINE_COMMERCIAL_SIGNED_PRIVATE_NO_FUNDS"||
      result.country_iso3!==country||result.category!==category||
      !/^[0-9a-f]{64}$/u.test(result.record_sha256??""))
     fail();
   identities.add(unique);
   summary.newly_prepared_canonical_signed_gros++;
  }catch{
   summary.invalid_or_unverified_private_requests++;
  }
 }
 if(queue.length!==summary.newly_prepared_canonical_signed_gros+
    summary.invalid_or_unverified_private_requests+
    summary.preexisting_artifacts_not_revalidated+
    summary.repeated_event_requests_rejected)fail();
 summary.all_submitted_requests_accounted_for=true;
 return Object.freeze(summary);
}
