import { defineEventHandler, setResponseHeaders } from "h3";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'",
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Geomacro Testnet Intelligence Console</title>
<meta name="description" content="Run Geomacro governed structural country and corridor intelligence with live severity context." />
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#080d16;color:#f4f2ea;--line:rgba(255,255,255,.08);--card:rgba(255,255,255,.035);--amber:#ff9d19;--muted:#979fab}*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 460px at 10% -10%,rgba(255,157,25,.09) 0,rgba(8,13,22,0) 60%),#080d16}main{max-width:980px;margin:auto;padding:36px 22px 80px}.nav{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:48px}.brand img{display:block;height:40px;width:auto}.badge{font:12px ui-monospace,monospace;padding:7px 11px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:var(--card)}.hero h1{font-size:42px;margin:10px 0 14px;letter-spacing:-.02em}.muted{color:var(--muted);line-height:1.55;font-size:14px}.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-top:22px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.12em;color:var(--amber)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}label{font-size:12px;color:var(--muted)}input,select,button{width:100%;border:1px solid var(--line);background:rgba(255,255,255,.02);color:#f4f2ea;border-radius:10px;padding:11px 12px;font:14px inherit}button{cursor:pointer;font-weight:700;background:var(--amber);color:#0d1117;border-color:transparent}button:hover{filter:brightness(1.06)}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.actions button{width:auto}.secondary{background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.notice{margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.02);border:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.55}.okline{min-height:22px;margin-top:10px;color:var(--muted);font-size:13px}a{color:var(--amber)}@media(max-width:720px){.form-grid{grid-template-columns:1fr}.field.full{grid-column:auto}.hero h1{font-size:34px}}
</style>
<script src="/testnet-console.js" defer></script>
</head>
<body>
<main>
  <div class="nav"><div class="brand"><img src="/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/geomacro-logo.png" alt="Geomacro" height="40" /></div><div class="badge">TESTNET INTELLIGENCE</div></div>
  <section class="hero">
    <div class="eyebrow">STRUCTURAL DATA + LIVE SEVERITY</div>
    <h1>Test the governed Geomacro data layer.</h1>
    <p class="muted">This console is available to active Testnet tester accounts. It returns governed country or corridor structural observations, coverage metadata, and actual live severity context from Geomacro's structured-event pipeline.</p>
    <p class="muted"><a href="/testnet-access">Back to Testnet account and API access</a></p>
  </section>
  <section id="consoleAnchor" class="panel">
    <div class="eyebrow">ACCOUNT CHECK</div>
    <p class="muted">If your tester access is active, the query console will appear below automatically. Otherwise complete your Testnet account activation first.</p>
  </section>
</main>
</body>
</html>`;
});