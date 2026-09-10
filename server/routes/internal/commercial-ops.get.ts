import { defineEventHandler, setResponseHeaders } from "h3";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Geomacro Commercial Operations</title>
<style>
:root{color-scheme:dark;background:#07090d;color:#f3f5f7;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:#07090d}main{max-width:1500px;margin:0 auto;padding:28px 22px 70px}.top{display:flex;gap:18px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.13em;color:#8ea0b6}.title{font-size:30px;margin:7px 0 4px}.muted{color:#8f9baa;font-size:13px;line-height:1.5}.panel{border:1px solid #222936;background:#0d1118;border-radius:14px;padding:16px;margin-top:18px}.controls{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.field{display:flex;flex-direction:column;gap:5px;min-width:160px}.field.grow{flex:1;min-width:280px}label{font-size:11px;color:#8f9baa}input,select,button{border:1px solid #303949;background:#111722;color:#eef2f6;border-radius:9px;padding:10px 11px;font:13px inherit}button{cursor:pointer;font-weight:600}button:hover{background:#17202d}.danger{color:#f0b6b6}.ok{color:#a9dfbd}.grid{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px;margin-top:18px}.card{border:1px solid #222936;background:#0d1118;border-radius:12px;padding:14px}.card .k{font-size:11px;color:#8f9baa}.card .v{font-size:24px;font-weight:650;margin-top:7px;word-break:break-word}.section-title{font-size:17px;margin:0}.table-wrap{overflow:auto;max-height:560px;margin-top:12px;border:1px solid #202734;border-radius:10px}table{border-collapse:collapse;width:100%;font-size:11px;white-space:nowrap}th,td{text-align:left;padding:8px 9px;border-bottom:1px solid #1c2430;border-right:1px solid #151c25}th{position:sticky;top:0;background:#111722;z-index:2;color:#aab5c2}td{color:#d9e0e7}.badge{display:inline-block;padding:3px 7px;border:1px solid #364155;border-radius:999px;font:10px ui-monospace,monospace}.notice{padding:11px 13px;border:1px solid #273144;border-radius:10px;background:#0a1018;font-size:12px;color:#aab5c2}.hidden{display:none}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(130px,1fr))}}
</style>
</head>
<body>
<main>
  <div class="top">
    <div><div class="eyebrow">GEOMACRO · OWNER-ONLY</div><h1 class="title">Commercial Operations & Proof</h1><div class="muted">Usage, entitlements, payments, settlement, testnet/mainnet separation, delivery evidence and shareable proof. Upstream news-source identities are never exposed here.</div></div>
    <div class="badge">execution_authorized = false</div>
  </div>

  <div class="panel">
    <div class="controls">
      <div class="field grow"><label>Owner token</label><input id="token" type="password" autocomplete="off" placeholder="COMMERCIAL_OPS_ADMIN_TOKEN" /></div>
      <div class="field"><label>Window</label><select id="days"><option>7</option><option selected>30</option><option>90</option><option>180</option><option>365</option></select></div>
      <button id="load">Load dashboard</button>
      <button id="forget">Forget token</button>
    </div>
    <div id="status" class="muted" style="margin-top:10px">Token stays in this page memory only. It is not stored in localStorage, cookies or the URL.</div>
  </div>

  <div id="content" class="hidden">
    <div id="cards" class="grid"></div>

    <div class="panel">
      <div class="top"><div><h2 class="section-title">Recent data usage</h2><div class="muted">Exact product/capability/subject, credits, result, latency, delivered counts and audit hash.</div></div></div>
      <div id="usageTable" class="table-wrap"></div>
    </div>

    <div class="panel">
      <div class="top"><div><h2 class="section-title">Recent payments & settlements</h2><div class="muted">Provider, rail, environment, asset/currency, status, tx/reference, fees, reconciliation and revenue classification.</div></div></div>
      <div id="paymentTable" class="table-wrap"></div>
    </div>

    <div class="panel">
      <div class="top"><div><h2 class="section-title">Daily usage rollup</h2></div></div>
      <div id="usageRollup" class="table-wrap"></div>
    </div>

    <div class="panel">
      <div class="top"><div><h2 class="section-title">Daily payment rollup</h2></div></div>
      <div id="paymentRollup" class="table-wrap"></div>
    </div>

    <div class="panel">
      <h2 class="section-title">Publish redacted live proof</h2>
      <div class="muted" style="margin:7px 0 12px">Creates an immutable aggregate snapshot. Customer identity, raw requests, credentials and upstream news-source identities are excluded. Testnet remains non-revenue.</div>
      <div class="controls">
        <div class="field grow"><label>Title</label><input id="proofTitle" value="Geomacro Commercial & Technical Activity Proof" /></div>
        <div class="field"><label>Environments</label><select id="proofEnv" multiple size="5"><option selected>testnet</option><option selected>mainnet</option><option selected>fiat</option><option>sandbox</option><option>internal</option></select></div>
        <button id="publish">Publish proof snapshot</button>
      </div>
      <div id="proofStatus" class="muted" style="margin-top:10px"></div>
    </div>

    <div class="notice" style="margin-top:18px">Internal detail is owner-only. Public proof is a separately generated redacted snapshot, never a direct public view of internal ledger tables.</div>
  </div>
</main>
<script>
let opsToken = '';
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
function num(v){ const n=Number(v??0); return Number.isFinite(n)?n:0 }
function table(rows){
  if(!Array.isArray(rows)||!rows.length)return '<div class="muted" style="padding:12px">No records in this window.</div>';
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  return '<table><thead><tr>'+keys.map(k=>'<th>'+esc(k)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+keys.map(k=>'<td>'+esc(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
function summarize(data){
  const usage=data.recent_usage||[], pay=data.recent_payments||[];
  const req=usage.length, ok=usage.filter(x=>x.success).length;
  const credits=usage.reduce((a,x)=>a+num(x.credits_charged),0);
  const settled=pay.filter(x=>x.payment_status==='settled').length;
  const revenue=pay.filter(x=>x.commercial_revenue===true).length;
  const testnet=pay.filter(x=>x.environment==='testnet').length;
  const cards=[['Requests shown',req],['Success rate',req?((ok/req)*100).toFixed(1)+'%':'0%'],['Credits charged',credits],['Settled payments',settled],['Revenue-classified payments',revenue],['Testnet payments',testnet]];
  $('cards').innerHTML=cards.map(([k,v])=>'<div class="card"><div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div></div>').join('');
}
async function load(){
  opsToken=$('token').value.trim();
  if(opsToken.length<32){$('status').innerHTML='<span class="danger">Enter the owner token.</span>';return}
  $('status').textContent='Loading…';
  try{
    const r=await fetch('/api/internal/commercial-ops?days='+encodeURIComponent($('days').value),{headers:{'x-geomacro-ops-token':opsToken,'accept':'application/json'},cache:'no-store'});
    const j=await r.json(); if(!r.ok||!j.ok)throw new Error(j?.error?.message||'Load failed');
    summarize(j.data); $('usageTable').innerHTML=table(j.data.recent_usage); $('paymentTable').innerHTML=table(j.data.recent_payments); $('usageRollup').innerHTML=table(j.data.usage_rollup); $('paymentRollup').innerHTML=table(j.data.payment_rollup);
    $('content').classList.remove('hidden'); $('status').innerHTML='<span class="ok">Loaded '+esc(j.data.generated_at)+'</span>';
  }catch(e){$('status').innerHTML='<span class="danger">'+esc(e.message)+'</span>'}
}
async function publishProof(){
  if(!opsToken){$('proofStatus').textContent='Load the dashboard first.';return}
  const now=new Date(), days=num($('days').value), start=new Date(now.getTime()-days*86400000);
  const environments=[...$('proofEnv').selectedOptions].map(o=>o.value);
  $('proofStatus').textContent='Publishing redacted snapshot…';
  try{
    const r=await fetch('/api/internal/commercial-proof',{method:'POST',headers:{'content-type':'application/json','x-geomacro-ops-token':opsToken},body:JSON.stringify({title:$('proofTitle').value,period_started_at:start.toISOString(),period_ends_at:now.toISOString(),environment_scope:environments})});
    const j=await r.json(); if(!r.ok||!j.ok)throw new Error(j?.error?.message||'Publish failed');
    const url=location.origin+j.public_path; $('proofStatus').innerHTML='<span class="ok">Published:</span> <a style="color:#b8cdf2" target="_blank" rel="noopener" href="'+esc(url)+'">'+esc(url)+'</a>';
  }catch(e){$('proofStatus').innerHTML='<span class="danger">'+esc(e.message)+'</span>'}
}
$('load').addEventListener('click',load); $('publish').addEventListener('click',publishProof); $('forget').addEventListener('click',()=>{opsToken='';$('token').value='';$('content').classList.add('hidden');$('status').textContent='Token cleared from page memory.'});
</script>
</body>
</html>`;
});
