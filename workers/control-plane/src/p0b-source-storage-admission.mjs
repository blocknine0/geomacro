/** Read the global durability circuit before source leases or upstream fetches.
 * A held storage backend cannot accept a source cursor, so polling it creates
 * only repeated D1 lease/checkpoint writes. No source state is mutated here.
 */
export async function admitP0bSourceStorage(env,now=Date.now()){
 if(env?.GEOMACRO_P0B_ADMISSION_ACTIVE!=='1')return {admitted:true};
 if(!Number.isSafeInteger(now)||!env?.DB?.prepare)
  return {admitted:false,reason:'P0B_STORAGE_CIRCUIT_UNAVAILABLE'};
 try{
  const row=await env.DB.prepare(
   'SELECT hold_until FROM p0b_storage_circuit WHERE singleton=1').first();
  if(row?.hold_until!==null&&row?.hold_until!==undefined){
   const until=Date.parse(row.hold_until);
   if(!Number.isFinite(until))throw Error('INVALID_CIRCUIT_CLOCK');
   if(until>now)return {admitted:false,reason:'P0B_STORAGE_CIRCUIT_HELD',
    retry_at:new Date(until).toISOString()};
  }
  return {admitted:true};
 }catch{return {admitted:false,reason:'P0B_STORAGE_CIRCUIT_UNAVAILABLE'}}
}
