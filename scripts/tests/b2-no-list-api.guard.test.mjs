import test from "node:test";
import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import {join,relative} from "node:path";

const roots=["scripts","workers","src","server"];
const forbidden=/\b(?:ListObjects(?:V2)?|b2_list_file_names|b2_list_file_versions|b2_list_buckets)\b|list-type=2/iu;

async function sourceFiles(path){
 const out=[];
 for(const entry of await readdir(path,{withFileTypes:true})){
  const child=join(path,entry.name);
  if(entry.isDirectory()) out.push(...await sourceFiles(child));
  else if(/\.(?:mjs|cjs|js|ts|tsx)$/u.test(entry.name)&&!/\.test\.(?:mjs|cjs|js|ts|tsx)$/u.test(entry.name)) out.push(child);
 }
 return out;
}

test("production source contains no B2 object or version listing API",async()=>{
 const files=(await Promise.all(roots.map(sourceFiles))).flat();
 const violations=[];
 for(const file of files){
  const path=relative(process.cwd(),file).replaceAll("\\","/");
  let text=await readFile(file,"utf8");
  // A Cloudflare R2 analytics classifier must enumerate the documented
  // Class A action name as DATA. This is not a B2 list API invocation. Only
  // this exact static string inside the R2 Class A catalog is exempt; any
  // extra invocation, import, or listing string elsewhere still fails.
  if(path==="scripts/ops/read-cloudflare-r2-kv-account-analytics.mjs"){
   const actionCatalog='"PutBucket","ListObjects","ListObjectsV1"';
   if(!text.includes(actionCatalog)||text.split(actionCatalog).length!==2)
    violations.push(path);
   else text=text.replace(actionCatalog,
    '"PutBucket","R2_CLASS_A_ACTION_NAME","ListObjectsV1"');
  }
  if(forbidden.test(text)) violations.push(path);
 }
 assert.deepEqual(violations,[]);
});

test("R2 action-name data exception never authorizes executable B2 listing",async()=>{
 const path="scripts/ops/read-cloudflare-r2-kv-account-analytics.mjs";
 const source=await readFile(path,"utf8");
 assert.match(source,/r2OperationsAdaptiveGroups/u);
 assert.match(source,/const A=new Set/u);
 assert.doesNotMatch(source,/\b(?:ListObjectsCommand|ListObjectsV2Command|b2_list_file_names|b2_list_file_versions)\b/u);
 assert.doesNotMatch(source,/\b(?:listObjects|list_objects|list-type=2)\s*\(/iu);
});
