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
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#080d16;color:#f4f2ea;--line:rgba(255,255,255,.09);--card:rgba(255,255,255,.035);--amber:#ff9d19;--muted:#99a1ad}*{box-sizing:border-box}body{margin:0;background:radial-gradient(1100px 520px at 12% -10%,rgba(255,157,25,.10),rgba(8,13,22,0) 60%),#080d16}main{max-width:1120px;margin:auto;padding:34px 22px 80px}.nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:54px}.brand img{height:38px;width:auto;display:block}.badge{font:12px ui-monospace,monospace;padding:7px 11px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}.hero{max-width:850px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.12em;color:var(--amber)}h1{font-size:50px;line-height:1.04;letter-spacing:-.025em;margin:14px 0 18px}h2{margin:8px 0 10px}.hero p,.muted{color:var(--muted);line-height:1.6}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:34px}.card,.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}.card strong{display:block;font-size:18px;margin-bottom:8px}.card p{color:var(--muted);font-size:14px;line-height:1.55}.panel{margin-top:20px}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.step{border:1px solid var(--line);border-radius:12px;padding:14px;background:rgba(255,255,255,.02)}.n{font:11px ui-monospace,monospace;color:var(--amber)}.step b{display:block;margin:8px 0 5px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}label{font-size:12px;color:var(--muted)}input,select,textarea,button{width:100%;border:1px solid var(--line);background:rgba(255,255,255,.025);color:#f4f2ea;border-radius:10px;padding:11px 12px;font:14px inherit}textarea{resize:vertical;min-height:90px}button{cursor:pointer;font-weight:700;background:var(--amber);color:#0d1117;border-color:transparent}button.secondary{background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.status-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}.status,.notice{border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(255,255,255,.02)}.status span{display:block;font-size:11px;color:var(--muted);margin-bottom:6px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.actions button,.actions a{width:auto}.actions a{display:inline-flex;align-items:center;text-decoration:none;border-radius:10px;padding:11px 14px;font-weight:700;background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.okline{min-height:22px;margin-top:10px;color:var(--muted);font-size:13px}.mono{font:12px ui-monospace,monospace;word-break:break-all;white-space:pre-wrap}.key-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid var(--line);padding:12px 0}.key-row span{display:block;font-size:12px;color:var(--muted);margin-top:4px}.profile-tools{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}.avatar{width:82px;height:82px;border-radius:16px;object-fit:cover;border:1px solid var(--line);background:#0a0f18}.chain-list{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.chain-list span{font-size:12px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}@media(max-width:820px){.grid,.steps,.form-grid,.status-grid{grid-template-columns:1fr}.field.full{grid-column:auto}h1{font-size:39px}}@media(max-width:520px){.profile-tools{grid-template-columns:1fr}}
</style>
<script src="/testnet-access.js" defer></script>
</head>
<body>
<main>
  <div class="nav"><div class="brand"><img src="/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/geomacro-logo.png" alt="Geomacro" /></div><div class="badge">TESTNET · PAY PER CALL</div></div>

  <section class="hero">
    <div class="eyebrow">TESTNET DEVELOPER API</div>
    <h1>Verify once. Pay only for the API call you use.</h1>
    <p>Create a tester profile, verify one EVM wallet with a non-transaction signature, then create an API Key + API Secret. There is no upfront Testnet USDC activation payment. Each API request quotes its own Testnet USDC amount at 0.5 Testnet USDC per credit.</p>
    <div id="globalStatus" class="okline"></div>
  </section>

  <section class="grid">
    <div class="card"><strong>Profile + wallet</strong><p>Create a tester profile and verify one EVM wallet to activate Testnet developer access.</p></div>
    <div class="card"><strong>500-credit usage cap</strong><p>500 credits is the 30-day Testnet usage limit, not a prepaid balance. One credit costs 0.5 Testnet USDC when consumed.</p></div>
    <div class="card"><strong>API Key + API Secret</strong><p>Create a credential pair for a product, AI agent, automation or demo. The secret is shown once and only its hash is stored.</p></div>
  </section>

  <section class="panel">
    <div class="eyebrow">HOW A TESTNET API CALL WORKS</div>
    <div class="steps">
      <div class="step"><span class="n">01</span><b>Call the API</b><div class="muted">Authenticate with your API Key + API Secret.</div></div>
      <div class="step"><span class="n">02</span><b>Receive HTTP 402</b><div class="muted">Geomacro returns the exact call price from its credit cost.</div></div>
      <div class="step"><span class="n">03</span><b>Pay and retry</b><div class="muted">Pay only that Testnet USDC amount and retry the same request_id with proof.</div></div>
    </div>
    <div class="chain-list"><span>Arc Testnet</span><span>Base Sepolia</span><span>Polygon Amoy</span><span>Testnet only · non-revenue</span></div>
  </section>

  <section id="registrationPanel" class="panel">
    <div class="eyebrow">CREATE TESTER PROFILE</div>
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
    <div class="eyebrow">DEVELOPER ACCESS</div>
    <h2>Create your Testnet API credentials</h2>
    <p class="muted">No upfront payment is required. Each metered API call returns an HTTP 402 quote before any Testnet USDC is required.</p>
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
