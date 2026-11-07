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
  else if(/\.(?:mjs|cjs|js|ts|tsx|py|sh)$/u.test(entry.name)&&!/\.test\.(?:mjs|cjs|js|ts|tsx|py)$/u.test(entry.name)) out.push(child);
 }
 return out;
}

test("production source contains no B2 object or version listing API",async()=>{
 const files=(await Promise.all(roots.map(sourceFiles))).flat();
 const violations=[];
 for(const file of files){
  const text=await readFile(file,"utf8");
  if(forbidden.test(text)) violations.push(relative(process.cwd(),file));
 }
 assert.deepEqual(violations,[]);
});
