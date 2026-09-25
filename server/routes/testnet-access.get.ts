import { defineEventHandler, setResponseHeaders } from "h3";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Geomacro Testnet Access</title>
<meta name="description" content="Try Geomacro's machine-readable geopolitical and macro risk intelligence through a real Testnet pay-per-call flow." />
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#080d16;color:#f4f2ea;--line:rgba(255,255,255,.09);--card:rgba(255,255,255,.035);--amber:#ff9d19;--muted:#99a1ad}*{box-sizing:border-box}body{margin:0;background:radial-gradient(1100px 520px at 12% -10%,rgba(255,157,25,.10),rgba(8,13,22,0) 60%),#080d16}main{max-width:1120px;margin:auto;padding:34px 22px 80px}.nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:54px;gap:14px}.nav-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.brand img{height:38px;width:auto;display:block}.badge{font:12px ui-monospace,monospace;padding:7px 11px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}.nav-link{font:12px ui-monospace,monospace;color:var(--muted);text-decoration:none;padding:7px 10px;border:1px solid var(--line);border-radius:999px}.nav-link:hover{color:#f4f2ea}.language-wrap{position:relative}.language-select{width:auto;min-width:132px;padding:7px 28px 7px 10px;border-radius:999px;font:12px ui-monospace,monospace;color:#f4f2ea;background:#0d131d}.hero{max-width:900px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.12em;color:var(--amber)}h1{font-size:50px;line-height:1.04;letter-spacing:-.025em;margin:14px 0 18px}h2{margin:8px 0 10px}.hero p,.muted{color:var(--muted);line-height:1.6}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:34px}.card,.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}.card strong{display:block;font-size:18px;margin-bottom:8px}.card p{color:var(--muted);font-size:14px;line-height:1.55}.panel{margin-top:20px}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.step{border:1px solid var(--line);border-radius:12px;padding:14px;background:rgba(255,255,255,.02)}.n{font:11px ui-monospace,monospace;color:var(--amber)}.step b{display:block;margin:8px 0 5px}.api-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.api-card{border:1px solid var(--line);border-radius:12px;padding:14px;background:rgba(255,255,255,.02)}.api-card b{display:block;margin-bottom:8px}.method{display:inline-block;font:11px ui-monospace,monospace;color:var(--amber);margin-right:8px}.api-line{margin-top:8px;padding:10px;border-radius:9px;background:#080d14;border:1px solid var(--line);font:12px ui-monospace,monospace;word-break:break-all}.capabilities{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.capabilities span{font:11px ui-monospace,monospace;padding:7px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}label{font-size:12px;color:var(--muted)}input,select,textarea,button{width:100%;border:1px solid var(--line);background:rgba(255,255,255,.025);color:#f4f2ea;border-radius:10px;padding:11px 12px;font:14px inherit}textarea{resize:vertical;min-height:90px}button{cursor:pointer;font-weight:700;background:var(--amber);color:#0d1117;border-color:transparent}button.secondary{background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.status-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}.status,.notice{border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(255,255,255,.02)}.status span{display:block;font-size:11px;color:var(--muted);margin-bottom:6px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.actions button,.actions a{width:auto}.actions a{display:inline-flex;align-items:center;text-decoration:none;border-radius:10px;padding:11px 14px;font-weight:700;background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.actions a.primary{background:var(--amber);color:#0d1117;border-color:transparent}.okline{min-height:22px;margin-top:10px;color:var(--muted);font-size:13px}.mono{font:12px ui-monospace,monospace;word-break:break-all;white-space:pre-wrap}.key-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid var(--line);padding:12px 0}.key-row span{display:block;font-size:12px;color:var(--muted);margin-top:4px}.profile-tools{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}.avatar{width:82px;height:82px;border-radius:16px;object-fit:cover;border:1px solid var(--line);background:#0a0f18}.chain-list{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.chain-list span{font-size:12px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}@media(max-width:820px){.grid,.steps,.api-grid,.form-grid,.status-grid{grid-template-columns:1fr}.field.full{grid-column:auto}h1{font-size:39px}}@media(max-width:520px){.profile-tools{grid-template-columns:1fr}.nav{align-items:flex-start}.nav-actions{max-width:220px}}
</style>
<script src="/testnet-wallet-first-v2.js" defer></script>
<script src="/testnet-access.js" defer></script>
<script>
document.getElementById("languageSelect")?.addEventListener("change",function(){
  const lang=this.value;
  if(lang==="en"){ location.reload(); return; }
  location.href="https://translate.google.com/translate?sl=auto&tl="+encodeURIComponent(lang)+"&u="+encodeURIComponent(location.href);
});
</script>
</head>
<body>
<main>
  <div class="nav">
    <div class="brand"><img src="/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/geomacro-logo.png" alt="Geomacro" /></div>
    <div class="nav-actions"><a class="nav-link" href="/data-api">Data & API</a><a class="nav-link" href="/docs">Docs</a><div class="language-wrap"><select id="languageSelect" class="language-select" aria-label="Language"><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="pt">Português</option><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="ja">日本語</option><option value="ko">한국어</option><option value="hi">हिन्दी</option><option value="bn">বাংলা</option><option value="ar">العربية</option><option value="ru">Русский</option><option value="tr">Türkçe</option><option value="id">Bahasa Indonesia</option></select></div><div class="badge">TESTNET · PAY PER CALL</div></div>
  </div>

  <section class="hero">
    <div class="eyebrow">PUBLIC TESTNET · MACHINE-READABLE RISK INTELLIGENCE</div>
    <h1>Put Geomacro risk intelligence into your product or AI agent.</h1>
    <p>Run a real Testnet integration against the same governed intelligence foundation used across Geomacro. Start with a wallet, make a metered request, receive the x402 quote, pay only that call, and get a machine-readable result.</p>
    <div class="actions"><a class="primary" href="#registrationPanel">Start Testnet</a><a href="/testnet-console">See the live x402 flow</a><a href="#developer-api">For builders</a></div>
    <div id="globalStatus" class="okline"></div>
  </section>

  <section class="grid">
    <div class="card"><strong>Ask real risk questions</strong><p>Query geopolitical and macro intelligence, GRI context, structural risk, signed Risk Objects, or governed Risk Gate outputs.</p></div>
    <div class="card"><strong>Pay per call</strong><p>No upfront activation payment. Each metered request returns its own Testnet USDC quote before payment.</p></div>
    <div class="card"><strong>Built for machines</strong><p>Use the same contract from a product, API workflow, or AI agent and inspect the structured result directly.</p></div>
  </section>

  <section id="developer-api" class="panel">
    <div class="eyebrow">DEVELOPER API</div>
    <h2>Build on the Geomacro contract.</h2>
    <p class="muted">The live manifest is the source of truth for capabilities, pricing and payment configuration. Use it when you are ready to integrate.</p>
    <div class="api-grid">
      <div class="api-card"><b>Discover</b><div class="api-line">GET /api/testnet/manifest</div><p class="muted">Live machine-readable contract.</p></div>
      <div class="api-card"><b>Request</b><div class="api-line">POST /api/testnet/intelligence</div><p class="muted">Metered intelligence delivery.</p></div>
      <div class="api-card"><b>Payment loop</b><div class="api-line">402 → pay → retry</div><p class="muted">Exact request, verified payment proof, result.</p></div>
    </div>
    <div class="notice" style="margin-top:14px"><b>Developer authentication</b><div class="api-line">Authorization: GeomacroTest &lt;API_KEY&gt;.&lt;API_SECRET&gt;</div><p class="muted">Create the key pair below after verifying your wallet. Never put the API Secret in public source code or screenshots.</p></div>
    <div class="capabilities"><span>Geopolitical intelligence</span><span>GRI</span><span>Structural risk</span><span>Signed Risk Objects</span><span>Risk Gate</span></div>
  </section>

  <section class="panel">
    <div class="eyebrow">THE COMMERCIAL PATTERN</div>
    <div class="steps">
      <div class="step"><span class="n">01</span><b>Request</b><div class="muted">Send a normal intelligence request.</div></div>
      <div class="step"><span class="n">02</span><b>402 quote</b><div class="muted">See exactly what that call costs.</div></div>
      <div class="step"><span class="n">03</span><b>Pay → retry → receive</b><div class="muted">Payment is verified before the same request delivers intelligence.</div></div>
    </div>
    <div class="chain-list"><span>Arc Testnet</span><span>Base Sepolia</span><span>Polygon Amoy</span><span>Testnet only</span></div>
  </section>

  <section id="registrationPanel" class="panel">
    <div class="eyebrow">CREATE TESTER PROFILE</div>
    <h2>Start with a wallet. Build from there.</h2>
    <p class="muted">Create a tester profile and verify one EVM wallet. No seed phrase, private key, or upfront Testnet payment is required.</p>
    <form id="registrationForm" class="form-grid">
      <div class="field full"><label for="profileNameInput">Profile name</label><input id="profileNameInput" maxlength="64" required autocomplete="name" /></div>
      <div class="field full"><button type="submit">Create tester profile</button></div>
    </form>
    <div id="registrationStatus" class="okline"></div>
    <div class="notice muted">Never enter a seed phrase or private key. Wallet verification is a message signature only and does not authorize funds.</div>
  </section>

  <section id="accountPanel" class="panel" hidden>
    <div class="eyebrow">YOUR TESTER ACCOUNT</div>
    <h2 id="profileStatus">Tester</h2>
    <div class="status-grid">
      <div class="status"><span>Wallet</span><strong id="walletStatus">Pending</strong></div>
      <div class="status"><span>Access</span><strong id="accessStatus">Pending</strong></div>
    </div>
    <div class="actions"><button id="walletConnect" type="button" class="secondary">Connect & verify wallet</button></div>
    <div id="walletActionStatus" class="okline"></div>
    <div class="profile-tools">
      <img id="avatarPreview" class="avatar" alt="Tester profile image" hidden />
      <form id="avatarForm" class="form-grid" enctype="multipart/form-data">
        <div class="field full"><label for="avatarInput">Optional profile image · PNG, JPEG or WebP · max 2 MB</label><input id="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" /></div>
        <div class="field full"><button type="submit" class="secondary">Upload profile image</button></div>
        <div id="avatarStatus" class="okline field full"></div>
      </form>
    </div>
  </section>

  <section id="developerPanel" class="panel" hidden>
    <div class="eyebrow">CREATE DEVELOPER API</div>
    <h2>Connect your product or AI agent</h2>
    <p class="muted">Create private API credentials after wallet verification. The API Secret is shown once. Keep it server-side and use the live manifest as the integration contract.</p>
    <form id="developerKeyForm" class="form-grid">
      <div class="field"><label for="keyLabelInput">Credential label</label><input id="keyLabelInput" maxlength="80" value="Default test integration" /></div>
      <div class="field"><label for="integrationTypeSelect">Integration type</label><select id="integrationTypeSelect"><option value="product_api">Product API</option><option value="ai_agent">AI agent</option><option value="automation">Automation</option><option value="demo">Demo</option></select></div>
      <div class="field full"><button type="submit">Create Testnet API credentials</button></div>
    </form>
    <div id="developerStatus" class="okline"></div>
    <div id="issuedKeyBox" class="notice" hidden><b>Copy both values now</b><div id="issuedKey" class="mono" style="margin-top:7px"></div><div class="actions"><button id="copyIssuedKey" type="button" class="secondary">Copy API Key + Secret</button></div></div>
    <div id="developerKeyList" style="margin-top:12px"></div>
  </section>

  <section id="feedbackPanel" class="panel" hidden>
    <div class="eyebrow">TEST → X → FEEDBACK</div>
    <h2>Run a real intelligence test, share one result, and tell us what blocked you.</h2>
    <p class="muted">Use the Testnet Console and run an eligible request. After a successful result, create the Geomacro result card and open one X post with the public result link. Then send structured feedback. Feedback storage excludes your IP address and wallet address.</p>
    <div class="actions"><a href="/testnet-console">Open Testnet Console</a></div>
    <form id="testerFeedbackForm" class="form-grid">
      <div class="field"><label for="feedbackTesterType">Testing as</label><select id="feedbackTesterType"><option value="builder">Builder</option><option value="agent_project">AI agent project</option><option value="institution">Institution</option><option value="researcher">Researcher</option><option value="other">Other</option></select></div>
      <div class="field"><label for="feedbackRating">Rating</label><select id="feedbackRating"><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select></div>
      <div class="field"><label for="feedbackOutcome">Outcome</label><select id="feedbackOutcome"><option value="worked">Worked</option><option value="partly_worked">Partly worked</option><option value="blocked">Blocked</option><option value="exploring">Exploring</option></select></div>
      <div class="field"><label for="feedbackWouldIntegrate">Would integrate?</label><select id="feedbackWouldIntegrate"><option value="yes">Yes</option><option value="unsure">Unsure</option><option value="no">No</option></select></div>
      <div class="field full"><label for="feedbackMostValuable">Most valuable</label><textarea id="feedbackMostValuable" maxlength="1000"></textarea></div>
      <div class="field full"><label for="feedbackFriction">Friction or confusion</label><textarea id="feedbackFriction" maxlength="1000"></textarea></div>
      <div class="field full"><label for="feedbackMissingCapability">Missing capability</label><textarea id="feedbackMissingCapability" maxlength="1000"></textarea></div>
      <div class="field full"><button type="submit">Send feedback</button></div>
    </form>
    <div id="testerFeedbackStatus" class="okline"></div>
  </section>
</main>
</body>
</html>`;
});
