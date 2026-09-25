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
<title>Geomacro Testnet Developer Access</title>
<meta name="description" content="Verify one wallet, create Testnet API credentials, and pay only for each Geomacro API call in Testnet USDC." />
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#080d16;color:#f4f2ea;--line:rgba(255,255,255,.09);--card:rgba(255,255,255,.035);--amber:#ff9d19;--muted:#99a1ad}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 500px at 10% -10%,rgba(255,157,25,.10),transparent 60%),#080d16}
main{max-width:1080px;margin:auto;padding:30px 22px 80px}.nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:72px;gap:18px}.nav-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.brand img{height:38px}.badge,.nav-link{font:12px ui-monospace,monospace;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);text-decoration:none}.hero{max-width:790px}.eyebrow{font:11px ui-monospace,monospace;letter-spacing:.13em;color:var(--amber)}h1{font-size:54px;line-height:1.03;letter-spacing:-.035em;margin:14px 0 20px}h2{margin:7px 0 10px;font-size:26px}.hero p,.muted{color:var(--muted);line-height:1.65}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.actions button,.actions a{width:auto}.actions a{display:inline-flex;align-items:center;text-decoration:none;border-radius:10px;padding:11px 14px;font-weight:700;background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.actions a.primary,button{background:var(--amber);color:#0d1117;border-color:transparent}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:44px}.card,.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}.card strong{display:block;font-size:17px;margin-bottom:7px}.card p{color:var(--muted);font-size:14px;line-height:1.55;margin:0}.panel{margin-top:18px}.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.step{border:1px solid var(--line);border-radius:12px;padding:14px;background:rgba(255,255,255,.02)}.n{font:11px ui-monospace,monospace;color:var(--amber)}.step b{display:block;margin:8px 0 5px}.api-strip{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.api-line{padding:12px;border-radius:9px;background:#080d14;border:1px solid var(--line);font:12px ui-monospace,monospace;word-break:break-all}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}label{font-size:12px;color:var(--muted)}input,select,textarea,button{width:100%;border:1px solid var(--line);background:rgba(255,255,255,.025);color:#f4f2ea;border-radius:10px;padding:11px 12px;font:14px inherit}textarea{resize:vertical;min-height:90px}button{cursor:pointer;font-weight:700}.status-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}.status,.notice{border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(255,255,255,.02)}.status span{display:block;font-size:11px;color:var(--muted);margin-bottom:6px}.okline{min-height:22px;margin-top:10px;color:var(--muted);font-size:13px}.mono{font:12px ui-monospace,monospace;word-break:break-all;white-space:pre-wrap}.profile-tools{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}.avatar{width:82px;height:82px;border-radius:16px;object-fit:cover;border:1px solid var(--line);background:#0a0f18}.footer-note{margin-top:22px;color:var(--muted);font-size:12px;line-height:1.6}
@media(max-width:820px){.grid,.steps,.form-grid,.status-grid,.api-strip{grid-template-columns:1fr}h1{font-size:42px}.field.full{grid-column:auto}}@media(max-width:520px){.profile-tools{grid-template-columns:1fr}.nav{align-items:flex-start}}
</style>
<script src="/testnet-wallet-first-v2.js" defer></script>
<script src="/testnet-access.js" defer></script>
</head>
<body>
<main>
  <div class="nav">
    <div class="brand"><img src="/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/geomacro-logo.png" alt="Geomacro" /></div>
    <div class="nav-actions"><a class="nav-link" href="/data-api">Data & API</a><a class="nav-link" href="/docs">Docs</a><div class="badge">TESTNET · PAY PER CALL</div></div>
  </div>

  <section class="hero">
    <div class="eyebrow">TESTNET API ACCESS</div>
    <h1>Put Geomacro intelligence into your product.</h1>
    <p>Build and test with machine-readable geopolitical and macro intelligence through a simple pay-per-call API. Create access once, then pay only when you make a request.</p>
    <div class="actions"><a class="primary" href="#registrationPanel">Get Testnet access</a><a href="/testnet-console">Try the live console</a><a href="/docs">Read docs</a></div>
    <div id="globalStatus" class="okline"></div>
  </section>

  <section class="grid">
    <div class="card"><strong>Pay per request</strong><p>Each request returns its own Testnet USDC quote. No prepaid balance and no upfront activation payment.</p></div>
    <div class="card"><strong>Machine-ready</strong><p>Use structured intelligence designed for products, automations and AI agents.</p></div>
    <div class="card"><strong>Testnet only</strong><p>Use Arc Testnet, Base Sepolia or Polygon Amoy while you validate the integration.</p></div>
  </section>

  <section class="panel">
    <div class="eyebrow">THE FLOW</div>
    <h2>From API call to intelligence in a few steps.</h2>
    <div class="steps">
      <div class="step"><span class="n">01</span><b>Create access</b><div class="muted">Verify one wallet and create your developer credentials.</div></div>
      <div class="step"><span class="n">02</span><b>Make a request</b><div class="muted">Call the Testnet API with your credentials.</div></div>
      <div class="step"><span class="n">03</span><b>Approve payment</b><div class="muted">Receive an HTTP 402 quote and pay that request only.</div></div>
      <div class="step"><span class="n">04</span><b>Get the result</b><div class="muted">Retry the same request and receive the intelligence response.</div></div>
    </div>
  </section>

  <section id="developer-api" class="panel">
    <div class="eyebrow">FOR BUILDERS</div>
    <h2>One endpoint to start. More intelligence behind it.</h2>
    <p class="muted">Discover the available capabilities and pricing from the machine-readable manifest, then use the intelligence endpoint for your integration.</p>
    <div class="api-strip">
      <div><div class="muted" style="margin-bottom:7px">Discovery</div><div class="api-line">GET /api/testnet/manifest</div></div>
      <div><div class="muted" style="margin-bottom:7px">Intelligence</div><div class="api-line">POST /api/testnet/intelligence</div></div>
    </div>
    <div class="footer-note">Available Testnet intelligence includes GRI reads, intelligence queries, structural country/corridor analysis, signed Risk Objects and Risk Gate bundles. See the manifest for the current machine-readable surface.</div>
  </section>

  <section id="registrationPanel" class="panel">
    <div class="eyebrow">CREATE TESTER PROFILE</div>
    <h2>Start developer access</h2>
    <p class="muted">Profile name and one verified wallet are the only identity steps for the current Testnet program.</p>
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
    <h2>Create your Testnet API Key + API Secret</h2>
    <p class="muted">Your verified wallet activates this form. No upfront payment is required. Each metered API call returns an HTTP 402 quote before any Testnet USDC is required.</p>
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
    <div class="eyebrow">HELP SHAPE THE TESTNET</div>
    <h2>Tell us what worked and what blocked you.</h2>
    <p class="muted">After testing, share the most useful part of the experience and any friction you found.</p>
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
