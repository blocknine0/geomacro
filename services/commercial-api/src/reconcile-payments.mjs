import { pool } from './db.mjs';
import { configurePayments } from './payments/config.mjs';
try{
 const {x402}=configurePayments(pool);
 if(!x402)throw new Error('X402_ENABLED=true is required');
 const outcome=await x402.reconcile();
 const results=Array.isArray(outcome)?outcome:
  Object.entries(outcome).flatMap(([chain,entries])=>entries.map(entry=>({...entry,chain})));
 for(const result of results)console.log(JSON.stringify(result));
 if(results.some(r=>r.state==='pending'))process.exitCode=2;
}catch(error){console.error(error.code??'RECONCILIATION_FAILED');process.exitCode=1;}
finally{await pool.end();}
