import { useEffect, useState } from "react";
import { GEOMACRO_USDC_NATIVE_RAILS } from "@/lib/usdc-native-rail-identities";
import { encodeUsdcPackTransferCalldata, USDC_PACK_RECIPIENT } from "@/lib/usdc-pack-checkout";
import { Bot, ShieldCheck, Wallet } from "lucide-react";
import { GEOMACRO_AGENT_MICROPAYMENT } from "@/lib/low-barrier-pricing";

export type CheckoutSelection = {
  id: string;
  name: string;
  amountUsd: number;
  credits: number;
  kind: "monthly_plan" | "one_time_pack";
};

type Eip1193Provider = { request(args:{method:string;params?:unknown[]|object}):Promise<unknown> };
type WalletProvider = { name:string; rdns:string; provider:Eip1193Provider };

const RAILS={
  base:{...GEOMACRO_USDC_NATIVE_RAILS.base,chainName:"Base Mainnet",rpc:"https://mainnet.base.org",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18}},
  polygon:{...GEOMACRO_USDC_NATIVE_RAILS.polygon,chainName:"Polygon PoS Mainnet",rpc:"https://polygon-bor-rpc.publicnode.com",nativeCurrency:{name:"POL",symbol:"POL",decimals:18}},
  arc:{...GEOMACRO_USDC_NATIVE_RAILS.arc,chainName:"Arc Mainnet",rpc:"https://rpc.mainnet.arc.io",nativeCurrency:{name:"USDC",symbol:"USDC",decimals:6}},
} as const;
type Network=keyof typeof RAILS;
type ApiResult={ok?:boolean;code?:string;error?:string;checkout_enabled?:boolean;user?:{email:string};api_key?:string;credits_funded?:number;receipt_id?:string;payment_funded?:boolean};

function errorCode(value:unknown){return value instanceof Error?value.message:"REQUEST_FAILED";}
/** Mainnet-only, customer-authenticated USDC checkout. The server readiness
 * gate must pass before a send button or manual transfer instructions appear. */
export function LockedDualRailCheckout({ selection }: { selection: CheckoutSelection }) {
  const [rail,setRail]=useState<"usdc"|"agent_x402">("usdc");
  const [network,setNetwork]=useState<Network>("base");
  const [wallets,setWallets]=useState<WalletProvider[]>([]);
  const [walletIndex,setWalletIndex]=useState(0);
  const [walletAddress,setWalletAddress]=useState("");
  const [email,setEmail]=useState("");
  const [otp,setOtp]=useState("");
  const [user,setUser]=useState("");
  const [checkoutEnabled,setCheckoutEnabled]=useState(false);
  const [statusMessage,setStatusMessage]=useState("Checking secure payment readiness…");
  const [busy,setBusy]=useState(false);
  const [txHash,setTxHash]=useState("");
  const [apiKey,setApiKey]=useState("");
  const [notice,setNotice]=useState("");
  const chain=RAILS[network];
  const connectedProvider=wallets[walletIndex]?.provider;

  useEffect(()=>{
    let active=true;
    void fetch("/api/v1/payments/usdc-pack-activate",{cache:"no-store",credentials:"same-origin"})
      .then(async response=>({response,value:await response.json() as ApiResult}))
      .then(({response,value})=>{
        if(!active)return;
        const ready=response.ok&&value.ok===true&&value.checkout_enabled===true;
        setCheckoutEnabled(ready);
        setStatusMessage(ready?"Mainnet USDC checkout is ready.":"Checkout is paused until the production ledger acceptance gates are enabled.");
      }).catch(()=>{if(active){setCheckoutEnabled(false);setStatusMessage("Payment readiness could not be verified. Do not send funds.");}});
    return ()=>{active=false;};
  },[]);

  useEffect(()=>{
    const found=new Map<string,WalletProvider>();
    const injected=(window as unknown as {ethereum?:Eip1193Provider}).ethereum;
    const add=(name:string,rdns:string,provider:Eip1193Provider)=>{
      const key=rdns||name;
      if(!found.has(key))found.set(key,{name:name||"EVM wallet",rdns:key,provider});
      setWallets([...found.values()]);
    };
    const announce=(event:Event)=>{
      const detail=(event as CustomEvent<{info?:{name?:string;rdns?:string};provider?:Eip1193Provider}>).detail;
      if(detail?.provider)add(detail.info?.name??"EVM wallet",detail.info?.rdns??"injected",detail.provider);
    };
    window.addEventListener("eip6963:announceProvider",announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if(injected)add("Browser wallet","injected",injected);
    return ()=>window.removeEventListener("eip6963:announceProvider",announce);
  },[]);

  useEffect(()=>{
    let active=true;
    void fetch("/api/v1/customer/auth",{cache:"no-store",credentials:"same-origin"})
      .then(async response=>({response,value:await response.json() as ApiResult}))
      .then(({response,value})=>{if(active&&response.ok&&value.user?.email){setUser(value.user.email);setEmail(value.user.email);}})
      .catch(()=>{});
    return ()=>{active=false;};
  },[]);

  async function customerAction(payload:Record<string,string>){
    const response=await fetch("/api/v1/customer/auth",{method:"POST",credentials:"same-origin",
      headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const value=await response.json() as ApiResult;
    if(!response.ok||value.ok!==true)throw Error(value.code??"CUSTOMER_REQUEST_FAILED");
    return value;
  }
  async function startEmailVerification(){
    setBusy(true);setNotice("");
    try{await customerAction({action:"start",email:email.trim().toLowerCase()});setNotice("Check your email for the six-digit verification code.");}
    catch(error){setNotice(errorCode(error));}finally{setBusy(false);}
  }
  async function verifyEmail(){
    setBusy(true);setNotice("");
    try{const result=await customerAction({action:"verify",email:email.trim().toLowerCase(),otp:otp.trim()});
      const verifiedEmail=result.user?.email??email.trim().toLowerCase();setUser(verifiedEmail);setEmail(verifiedEmail);
      setNotice("Email verified. Connect and sign with your self-custody wallet to bind it to this account.");}
    catch(error){setNotice(errorCode(error));}finally{setBusy(false);}
  }
  async function switchToSelectedChain(provider:Eip1193Provider){
    const chainId="0x"+chain.chain_id.toString(16);
    try{await provider.request({method:"wallet_switchEthereumChain",params:[{chainId}]});}
    catch(error){
      if((error as {code?:number})?.code!==4902)throw error;
      await provider.request({method:"wallet_addEthereumChain",params:[{chainId,chainName:chain.chainName,
        nativeCurrency:RAILS[network].nativeCurrency,rpcUrls:[RAILS[network].rpc],blockExplorerUrls:[]} ]});
      await provider.request({method:"wallet_switchEthereumChain",params:[{chainId}]});
    }
  }
  async function connectAndBindWallet(){
    if(!connectedProvider)throw Error("EVM_WALLET_NOT_FOUND");
    if(!user)throw Error("VERIFY_EMAIL_BEFORE_BINDING_WALLET");
    await switchToSelectedChain(connectedProvider);
    const accounts=await connectedProvider.request({method:"eth_requestAccounts"});
    if(!Array.isArray(accounts)||typeof accounts[0]!=="string"||!/^0x[0-9a-f]{40}$/i.test(accounts[0]))throw Error("WALLET_ACCOUNT_UNAVAILABLE");
    const address=accounts[0].toLowerCase(),nonce=crypto.randomUUID(),issuedAt=new Date().toISOString();
    const message=`GeoMacro wallet link v1\nEmail: ${user.toLowerCase()}\nWallet: ${address}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
    const signature=await connectedProvider.request({method:"personal_sign",params:[`0x${Array.from(new TextEncoder().encode(message),b=>b.toString(16).padStart(2,"0")).join("")}`,address]});
    if(typeof signature!=="string")throw Error("WALLET_SIGNATURE_UNAVAILABLE");
    await customerAction({action:"wallet-bind",wallet_address:address,signature,nonce,issued_at:issuedAt});
    setWalletAddress(address);setNotice(`Wallet ${address} is verified and linked to ${user}.`);
  }
  async function submitTransferHash(hash=txHash){
    if(!user||!walletAddress)throw Error("VERIFY_EMAIL_AND_BIND_WALLET_FIRST");
    if(!/^0x[0-9a-f]{64}$/i.test(hash.trim()))throw Error("TRANSACTION_HASH_INVALID");
    const response=await fetch("/api/v1/payments/usdc-pack-activate",{method:"POST",credentials:"same-origin",
      headers:{"content-type":"application/json"},body:JSON.stringify({network,sku:selection.id,tx_hash:hash.trim().toLowerCase()})});
    const value=await response.json() as ApiResult;
    if(!response.ok||value.ok!==true)throw Error(value.error??value.code??"USDC_PACK_ACTIVATION_FAILED");
    if(value.api_key){setApiKey(value.api_key);setNotice(`Payment verified. ${value.credits_funded?.toLocaleString("en-US")} credits were added. Copy your API key now; it is shown once.`);}
    else setNotice(`Payment verified and ${value.credits_funded?.toLocaleString("en-US")} credits were added. API key activation is pending. Retry verification or open your customer dashboard.`);
  }
  async function sendUsdc(){
    if(!connectedProvider||!walletAddress)throw Error("CONNECT_AND_BIND_WALLET_FIRST");
    await switchToSelectedChain(connectedProvider);
    const result=await connectedProvider.request({method:"eth_sendTransaction",params:[{from:walletAddress,to:chain.asset,
      data:encodeUsdcPackTransferCalldata(selection.amountUsd),value:"0x0"}]});
    if(typeof result!=="string"||!/^0x[0-9a-f]{64}$/i.test(result))throw Error("WALLET_TRANSACTION_HASH_INVALID");
    setTxHash(result);await submitTransferHash(result);
  }
  async function safely(run:()=>Promise<void>){setBusy(true);setNotice("");try{await run();}catch(error){setNotice(errorCode(error));}finally{setBusy(false);}}

  return (
    <section id="payment-checkout" aria-labelledby="gm-checkout-heading" data-dual-rail-checkout="mainnet-usdc"
      className="scroll-mt-40 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div>
        <p className="gm-eyebrow">Mainnet USDC checkout</p>
        <h2 id="gm-checkout-heading" className="mt-2 text-2xl font-semibold tracking-tight">Pay directly from this page</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Choose a pack, verify your email, link a self-custody EVM wallet, and send native USDC on Base, Polygon PoS, or Arc.
          Confirmed transfers are checked against the selected pack and credited to your account.
        </p>
      </div></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <aside aria-label="Selected pricing product" className="self-start rounded-xl border border-border bg-background p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Selected product</p>
          <h3 className="mt-3 text-lg font-semibold">{selection.name}</h3>
          <p className="mt-3 text-4xl font-semibold">{"$"}{selection.amountUsd}<span className="ml-2 text-sm font-normal text-muted-foreground">USDC</span></p>
          <p className="mt-3 font-medium">{selection.credits.toLocaleString("en-US")} credits</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">One-time pack purchase. Unused credits do not expire and roll over.</p>
          <a href="#plans" className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">Change pack</a>
        </aside>
        <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
          <div role="tablist" aria-label="Payment method" className="grid grid-cols-1 gap-2 rounded-xl bg-muted p-1.5 sm:grid-cols-2">
            <button id="gm-usdc-tab" type="button" role="tab" aria-controls="gm-usdc-panel" aria-selected={rail==="usdc"} tabIndex={rail==="usdc"?0:-1}
              onClick={()=>setRail("usdc")} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${rail==="usdc"?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
              <Wallet className="h-4 w-4" aria-hidden/>Crypto USDC
            </button>
            <button id="gm-agent-x402-tab" type="button" role="tab" aria-controls="gm-agent-x402-panel" aria-selected={rail==="agent_x402"} tabIndex={rail==="agent_x402"?0:-1}
              onClick={()=>setRail("agent_x402")} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${rail==="agent_x402"?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
              <Bot className="h-4 w-4" aria-hidden/>AI Agents Free Pay-Per-Call USDC
            </button>
          </div>
          <section id="gm-usdc-panel" role="tabpanel" aria-labelledby="gm-usdc-tab" hidden={rail!=="usdc"} className="mt-5 space-y-4">
            <div>
              <label htmlFor="gm-usdc-network" className="block text-sm font-medium">Choose mainnet</label>
              <select id="gm-usdc-network" value={network} onChange={event=>setNetwork(event.target.value as Network)}
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm">
                <option value="base">Base Mainnet</option><option value="polygon">Polygon PoS Mainnet</option><option value="arc">Arc Mainnet</option>
              </select>
            </div>
            <div className="rounded-lg border border-border p-3 text-sm">
              <p><span className="font-medium">Exact amount:</span> {selection.amountUsd.toFixed(2)} USDC</p>
              <p className="mt-1"><span className="font-medium">Recipient:</span> <code className="break-all">{USDC_PACK_RECIPIENT}</code></p>
              <p className="mt-1"><span className="font-medium">Chain ID:</span> {chain.chain_id} ({chain.caip2})</p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Native USDC contract: {chain.asset}</p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Send exactly this amount of native USDC on the selected mainnet. Unsupported tokens and testnets are not credited.</p>
            </div>
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="font-semibold">Verify your email</h3>
              <p className="text-xs text-muted-foreground">Your email profile is linked to your non-custodial wallet. GeoMacro never receives wallet private keys.</p>
              <label className="block text-sm">Email ID<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"/></label>
              {!user?<div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void safely(startEmailVerification)}
                className="rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">Send verification code</button>
                <input aria-label="Email verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value)}
                  className="w-36 rounded-lg border border-input bg-background px-3 py-2"/>
                <button type="button" disabled={busy||otp.length!==6} onClick={()=>void safely(verifyEmail)}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Verify email</button></div>
                :<p className="text-sm text-emerald-700">Verified: {user}</p>}
            </div>
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="font-semibold">Connect and bind your wallet</h3>
              {!user&&<p className="text-xs text-muted-foreground">Verify your email first.</p>}
              {wallets.length>1&&<label className="block text-sm">Wallet provider<select value={walletIndex} onChange={e=>setWalletIndex(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2">{wallets.map((w,i)=><option key={w.rdns} value={i}>{w.name}</option>)}</select></label>}
              {wallets.length===0&&<p className="text-xs text-muted-foreground">No EIP-6963 or injected EVM wallet found. Install or enable a wallet extension.</p>}
              <button type="button" disabled={busy||!checkoutEnabled||!user||!connectedProvider} onClick={()=>void safely(connectAndBindWallet)}
                className="rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">{walletAddress?"Wallet verified · reconnect":"Connect wallet and verify ownership"}</button>
              {walletAddress&&<p className="break-all font-mono text-xs">Bound wallet: {walletAddress}</p>}
            </div>
            {checkoutEnabled&&walletAddress&&user&&<div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <button type="button" disabled={busy} onClick={()=>void safely(sendUsdc)}
                className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">Send {selection.amountUsd.toFixed(2)} USDC from connected wallet</button>
              <p className="text-center text-xs text-muted-foreground">Or transfer manually to the recipient above, then paste the transaction hash.</p>
              <label className="block text-sm">Mainnet transaction hash<input value={txHash} onChange={e=>setTxHash(e.target.value)} placeholder="0x…" spellCheck={false}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs"/></label>
              <button type="button" disabled={busy||!txHash.trim()} onClick={()=>void safely(()=>submitTransferHash())}
                className="w-full rounded-lg border border-primary px-4 py-3 text-sm font-semibold text-primary disabled:opacity-50">Verify transfer and activate credits</button>
              {apiKey&&<div className="rounded-lg border border-emerald-600/30 bg-emerald-50 p-3"><p className="font-semibold text-emerald-900">API key, shown once</p>
                <code className="mt-2 block break-all text-xs">{apiKey}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(apiKey)} className="mt-2 text-sm font-semibold underline">Copy API key</button></div>}
            </div>}
          </section>
          <section id="gm-agent-x402-panel" role="tabpanel" aria-labelledby="gm-agent-x402-tab" hidden={rail!=="agent_x402"} className="mt-5 space-y-4">
            <h3 className="font-semibold">AI Agents Free Pay-Per-Call USDC</h3>
            <p className="text-sm leading-6 text-muted-foreground">Agent payments use the existing free pay-per-call USDC route on Base Mainnet. Pack checkout and per-call settlement are separate.</p>
            <p className="text-sm">Risk Gate tiers: BASIC $0.15, STANDARD $0.20, COMPLEX $0.30 per eligible delivery.</p>
            <a href="/api/v1/payments/usdc-risk-gate" className="break-all font-mono text-sm text-primary underline">/api/v1/payments/usdc-risk-gate</a>
            <p className="text-xs leading-5 text-muted-foreground">Risk Gate responses remain subject to evidence, signature, and execution-authorization checks.</p>
            <span className="text-xs text-muted-foreground">Base payment discovery: {GEOMACRO_AGENT_MICROPAYMENT.network}</span>
          </section>
        </div>
      </div>
      <p role="status" className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden/>{statusMessage} No private key leaves your wallet.
      </p>
      {notice&&<p role="status" className="mt-3 break-words rounded-lg border border-border bg-background p-3 text-sm">{notice}</p>}
      {txHash&&!apiKey&&<p className="mt-2 break-all font-mono text-xs text-muted-foreground">Transaction: {txHash}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Only Base, Polygon PoS, and Arc Mainnet native USDC are supported.</p>
    </section>
  );
}
