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
<meta name="description" content="Verify one EVM wallet and receive a fixed 500-credit Geomacro Testnet quota." />
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#080d16;color:#f4f2ea;--line:rgba(255,255,255,.08);--card:rgba(255,255,255,.035);--amber:#ff9d19;--muted:#979fab}*{box-sizing:border-box}body{margin:0;background:radial-gradient(1100px 520px at 12% -10%,rgba(255,157,25,.10) 0,rgba(8,13,22,0) 60%),#080d16}main{max-width:1180px;margin:auto;padding:36px 22px 80px}.nav{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:64px}.brand img{display:block;height:40px;width:auto}.badge{font:12px ui-monospace,monospace;padding:7px 11px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:var(--card)}.hero{max-width:860px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.12em;color:var(--amber)}.hero h1{font-size:52px;line-height:1.03;margin:15px 0 18px;letter-spacing:-.02em}.hero p{font-size:19px;line-height:1.65;color:var(--muted);max-width:780px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:36px}.card,.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}.card strong{display:block;font-size:19px;margin-bottom:8px}.card p,.muted{color:var(--muted);line-height:1.55;font-size:14px}.panel{margin-top:22px}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.step{border:1px solid var(--line);background:rgba(255,255,255,.02);border-radius:12px;padding:14px;min-height:96px}.n{font:11px ui-monospace,monospace;color:var(--amber)}.step b{display:block;margin-top:9px;font-size:14px}.notice{margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.02);border:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.55}.faucets{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.faucet{border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(255,255,255,.02);display:flex;flex-direction:column;gap:9px}.faucet b{font-size:14px;font-weight:650}.faucet a{display:inline-block;text-align:center;text-decoration:none;font-size:13px;font-weight:700;border-radius:10px;padding:8px 10px;border:1px solid rgba(255,157,25,.35);background:rgba(255,157,25,.10);color:var(--amber)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}label{font-size:12px;color:var(--muted)}input,select,button{width:100%;border:1px solid var(--line);background:rgba(255,255,255,.02);color:#f4f2ea;border-radius:10px;padding:11px 12px;font:14px inherit}button{cursor:pointer;font-weight:700;background:var(--amber);color:#0d1117;border-color:transparent}button.secondary{background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.status-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.status{border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(255,255,255,.02)}.status span{display:block;font-size:11px;color:var(--muted);margin-bottom:6px}.status strong{font-size:13px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.actions button,.actions a{width:auto}.actions a{display:inline-flex;align-items:center;text-decoration:none;border-radius:10px;padding:11px 14px;font-weight:700;background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.mono{font:12px ui-monospace,monospace;word-break:break-all;color:#e6e3da}.okline{min-height:22px;margin-top:10px;color:var(--muted);font-size:13px}.key-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid var(--line);padding:12px 0}.key-row:first-child{border-top:0}.key-row strong,.key-row span{display:block}.key-row span{font-size:12px;color:var(--muted);margin-top:4px}.key-row button{width:auto;background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.profile-tools{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}.avatar{width:82px;height:82px;border-radius:16px;object-fit:cover;border:1px solid var(--line);background:#0a0f18}@media(max-width:850px){.grid,.form-grid,.faucets{grid-template-columns:1fr}.field.full{grid-column:auto}.steps,.status-grid{grid-template-columns:1fr}.hero h1{font-size:40px}}@media(max-width:520px){.profile-tools{grid-template-columns:1fr}.avatar{width:72px;height:72px}}
</style>
<script src="/testnet-access.js" defer></script>
</head>
<body>
<main>
  <div class="nav"><div class="brand"><img src="/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/geomacro-logo.png" alt="Geomacro" height="40" /></div><div class="badge">TESTNET · WALLET ACCESS</div></div>
  <section class="hero">
    <div class="eyebrow">GEOPOLITICAL + MACRO RISK INTELLIGENCE</div>
    <h1>Verify one wallet. Get 500 Testnet credits.</h1>
    <p>Create a tester profile and verify an EVM wallet with a non-transaction signature. A successful verification activates one fixed 500-credit, 30-day Testnet quota. No email, X, Discord or payment is required.</p>
    <div id="globalStatus" class="okline"></div>
  </section>

  <section class="grid">
    <div class="card"><strong>Wallet-only identity</strong><p>One verified EVM wallet maps to one tester identity and one fixed quota.</p></div>
    <div class="card"><strong>500 Testnet credits</strong><p>Credits activate immediately after wallet verification. Testnet access is free and non-revenue.</p></div>
    <div class="card"><strong>Structured intelligence</strong><p>Queries return a concise answer, structural data and current severity from Geomacro's governed data sources.</p></div>
  </section>

  <section class="panel">
    <div class="eyebrow">HOW IT WORKS</div>
    <div class="steps">
      <div class="step"><span class="n">01</span><b>Create profile</b><div class="muted">Profile name + optional image</div></div>
      <div class="step"><span class="n">02</span><b>Verify wallet</b><div class="muted">Safe message signature, no funds authorized</div></div>
      <div class="step"><span class="n">03</span><b>Test Geomacro</b><div class="muted">500 credits become active immediately</div></div>
    </div>
  </section>

  <section id="registrationPanel" class="panel">
    <div class="eyebrow">CREATE TESTER PROFILE</div>
    <form id="registrationForm" class="form-grid">
      <div class="field full"><label for="profileNameInput">Profile name</label><input id="profileNameInput" maxlength="64" required autocomplete="name" /></div>
      <div class="field full"><button type="submit">Create tester profile</button></div>
    </form>
    <div id="registrationStatus" class="okline"></div>
    <div class="notice">Never enter a seed phrase or private key. Geomacro only requests a non-transaction wallet signature for identity verification.</div>
  </section>

  <section id="accountPanel" class="panel" hidden>
    <div class="eyebrow">YOUR TESTER ACCOUNT</div>
    <h2 id="profileStatus">Tester</h2>
    <div class="status-grid">
      <div class="status"><span>Wallet</span><strong id="walletStatus">Pending</strong></div>
      <div class="status"><span>Access</span><strong id="accessStatus">pending</strong></div>
      <div class="status"><span>Credits</span><strong id="creditStatus">0 / 500</strong></div>
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

  <section class="panel">
    <div class="eyebrow">OPTIONAL TESTNET RESOURCES</div>
    <p class="muted">These faucets are for users who also want to test integrations on supported networks. They are not required to activate Geomacro credits.</p>
    <div class="faucets">
      <div class="faucet"><b>Arc Testnet</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>Base Sepolia</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>Polygon Amoy</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
    </div>
  </section>

  <section id="developerPanel" class="panel" hidden>
    <div class="eyebrow">DEVELOPER ACCESS</div>
    <h2>Use Geomacro in your product or AI agent</h2>
    <form id="developerKeyForm" class="form-grid">
      <div class="field"><label for="keyLabelInput">Key label</label><input id="keyLabelInput" maxlength="80" value="Default test integration" /></div>
      <div class="field"><label for="integrationTypeSelect">Integration type</label><select id="integrationTypeSelect"><option value="product_api">Product API</option><option value="ai_agent">AI agent</option><option value="automation">Automation</option><option value="demo">Demo</option></select></div>
      <div class="field full"><button type="submit">Create Testnet API key</button></div>
    </form>
    <div id="developerStatus" class="okline"></div>
    <div id="issuedKeyBox" class="notice" hidden><b>Copy this key now</b><div id="issuedKey" class="mono" style="margin-top:7px"></div><div class="actions"><button id="copyIssuedKey" type="button" class="secondary">Copy API key</button></div></div>
    <div id="developerKeyList" style="margin-top:12px"></div>
  </section>

  <section id="feedbackPanel" class="panel" hidden>
    <div class="eyebrow">TEST → CARD → X</div>
    <h2>Run a real intelligence test, then publish the result.</h2>
    <p class="muted">Open the Testnet Console, run an eligible metered intelligence request, create the professional Geomacro social card, then use “Share result on X”.</p>
    <div class="actions"><a href="/testnet-console">Open Testnet Console</a></div>
  </section>
</main>
</body>
</html>`;
});
