// Separate from quote/release snapshots: minute cron cannot advance the
// routine-source clock or erase the last actual successful intake.
const KEY='news_intake_admission_v1';
const schema='geomacro.news-intake-admission.v1';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function loadNewsIntakePolicy(env){
 const row=await env.DB.prepare('SELECT value_json FROM control_state WHERE key=? LIMIT 1').bind(KEY).first();
 return row?JSON.parse(row.value_json):null;
}
export async function readNewsIntakePolicy(env){return reply({ok:true,schema,policy:await loadNewsIntakePolicy(env)});}
export async function storeNewsIntakePolicy(env,body,now=Date.now()){
 if(!body||body.schema!==schema||![5,10,15,30,60].includes(body.interval_minutes)||![3,5,10,25,50].includes(body.max_new_rows)||!Number.isFinite(Date.parse(body.last_success_at))||Date.parse(body.last_success_at)>now+60000||now-Date.parse(body.last_success_at)>15*60000)
  return reply({ok:false,error:'NEWS_INTAKE_POLICY_INVALID'},400);
 const policy={schema,interval_minutes:body.interval_minutes,max_new_rows:body.max_new_rows,last_success_at:new Date(Math.min(now,Date.parse(body.last_success_at))).toISOString()};
 await env.DB.prepare(`INSERT INTO control_state(key,value_json,version,updated_at) VALUES(?,?,1,?)
 ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,version=control_state.version+1,updated_at=excluded.updated_at
 WHERE excluded.updated_at>=control_state.updated_at`).bind(KEY,JSON.stringify(policy),policy.last_success_at).run();
 return reply({ok:true,schema,policy_saved:true});
}
