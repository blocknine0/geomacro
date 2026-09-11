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
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07090d;color:#f4f6f8}*{box-sizing:border-box}body{margin:0;background:#07090d}main{max-width:980px;margin:auto;padding:36px 22px 80px}.nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:48px}.brand{font-size:20px;font-weight:750}.badge{font:12px ui-monospace,monospace;padding:7px 11px;border:1px solid #33425c;border-radius:999px;color:#b9c8dd}.hero h1{font-size:42px;margin:10px 0 14px}.muted{color:#93a1b4;line-height:1.55;font-size:14px}.panel{background:#0d121b;border:1px solid #202a3a;border-radius:18px;padding:20px;margin-top:22px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.12em;color:#91a8c8}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}label{font-size:12px;color:#aab7c8}input,select,button{width:100%;border:1px solid #2a3549;background:#0a1018;color:#eef3f8;border-radius:11px;padding:11px 12px;font:14px inherit}button{cursor:pointer;font-weight:700;background:#edf3ff;color:#0a1020}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.actions button{width:auto}.secondary{background:#111a29;color:#dbe7f8}.notice{margin-top:14px;padding:12px 14px;border-radius:12px;background:#0a1018;border:1px solid #25324a;color:#91a0b5;font-size:13px;line-height:1.55}.okline{min-height:22px;margin-top:10px;color:#9fb0c5;font-size:13px}a{color:#cbdcff}@media(max-width:720px){.form-grid{grid-template-columns:1fr}.field.full{grid-column:auto}.hero h1{font-size:34px}}
</style>
<script src="/testnet-console.js" defer></script>
</head>
<body>
<main>
  <div class="nav"><div class="brand">Geomacro</div><div class="badge">TESTNET INTELLIGENCE</div></div>
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
