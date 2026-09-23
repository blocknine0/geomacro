import {probePublicSource,publicSources} from "../adapters/public-sources.mjs";

const sourceIds=Object.keys(publicSources);
let failures=0;
for(const sourceId of sourceIds){
  try{
    const result=await probePublicSource(sourceId);
    if(!result?.observations) throw new Error("No observations returned");
    console.log(JSON.stringify({...result,status:"PASS"}));
  }catch(error){
    failures++;
    console.error(JSON.stringify({source_id:sourceId,status:"FAIL",error:String(error.message||error)}));
  }
}
process.exitCode=failures?1:0;
