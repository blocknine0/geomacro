/**
 * Ten deterministic concurrent partitions for 195 countries + 12 corridors.
 * Chunking is bounded and each task failure is isolated with allSettled.
 */
export const RISK_GATE_PARTITIONS=10;
export function partitionRiskGateSubjects(subjects){
 if(!Array.isArray(subjects)||subjects.length>207||
   subjects.some(s=>!s||!["COUNTRY","CORRIDOR"].includes(s.type)||typeof s.id!=="string"))
  throw Error("RISK_GATE_PARTITION_SCOPE_INVALID");
 const groups=Array.from({length:RISK_GATE_PARTITIONS},()=>[]);
 const base=Math.floor(subjects.length/RISK_GATE_PARTITIONS),extra=subjects.length%RISK_GATE_PARTITIONS;
 let at=0;
 for(let i=0;i<RISK_GATE_PARTITIONS;i++){
  const length=base+(i<extra?1:0);
  groups[i]=subjects.slice(at,at+length);
  at+=length;
 }
 if(at!==subjects.length||Math.max(...groups.map(x=>x.length))>21)
  throw Error("RISK_GATE_PARTITION_LENGTH_INVALID");
 return groups;
}
export async function runRiskGatePartitioned(subjects,handler){
 if(typeof handler!=="function")throw Error("RISK_GATE_PARTITION_HANDLER_REQUIRED");
 const groups=partitionRiskGateSubjects(subjects);
 const batches=await Promise.allSettled(groups.map(async (chunk,partition)=>{
  const receipts=[];
  for(const subject of chunk){
   try{receipts.push({subject,ok:true,value:await handler(subject,partition)});}
   catch(error){receipts.push({subject,ok:false,error:String(error?.message??"RISK_GATE_TASK_FAILED").slice(0,100)});}
  }
  return receipts;
 }));
 const receipts=batches.flatMap((r,i)=>r.status==="fulfilled"?r.value:
  groups[i].map(subject=>({subject,ok:false,error:"RISK_GATE_PARTITION_FAILED"})));
 return {partition_count:RISK_GATE_PARTITIONS,subject_count:subjects.length,
  succeeded:receipts.filter(x=>x.ok).length,failed:receipts.filter(x=>!x.ok).length,
  receipts};
}
