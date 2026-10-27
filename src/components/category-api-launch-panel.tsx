import {useState} from "react";
import {BrowserProvider} from "ethers";
import {GEOMACRO_USDC_NATIVE_RAILS,type GeomacroUsdcNetwork} from "@/lib/usdc-native-rail-identities";
import {validateBuyerUsdcOffer,assertBuyerDeliveredBytes} from "@/lib/usdc-buyer-quote";
import {Button} from "@/components/ui/button";
import {
 FIRST_SALE_PRICE,buildFirstSaleCountryDigestRequest,
 acceptFirstSaleNoFundsPreflight,validateFirstSaleCountryDigestQuote,
 type FirstSaleCategory,
} from "@/lib/first-sale-country-digest-buyer";

type Offer=ReturnType<typeof validateBuyerUsdcOffer>;
const CATEGORIES=[{id:"geopolitics",label:"Geopolitics",tool:"geopolitics_query"},
 {id:"macro-fx",label:"Macro / FX",tool:"macro_fx_query"},
 {id:"critical-minerals",label:"Critical Minerals",tool:"critical_minerals_query"}] as const;
type OfferMode="question"|"country_digest";
type Pending={url:string;body:string;network:GeomacroUsdcNetwork;offer:Offer;mode:OfferMode;proof?:string};

export function CategoryApiLaunchPanel({initialMode="question"}:{initialMode?:OfferMode}={}){
 const [offerMode,setOfferMode]=useState<OfferMode>(initialMode);
 const [category,setCategory]=useState<string>("geopolitics");
 const [network,setNetwork]=useState<GeomacroUsdcNetwork>("base");
 const [country,setCountry]=useState("IND");
 const [question,setQuestion]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [pending,setPending]=useState<Pending|null>(null);
 const [result,setResult]=useState<unknown>(null);
 const selected=CATEGORIES.find(c=>c.id===category)!;
 function reset(){setPending(null);setResult(null);setMessage("");}
 async function check(event:React.FormEvent){
  event.preventDefault();reset();setBusy(true);
  try{
   const digest=offerMode==="country_digest";
   // Explicit Store country digest has only the existing, production-reviewed
   // Base network and must pass no-funds governed evidence admission before
   // the canonical payment endpoint is even contacted.
   const payNetwork:GeomacroUsdcNetwork=digest?"base":network;
   const url=digest?"/api/v1/intelligence/query":`/api/v1/intelligence/${category}`;
   const body=digest?
    buildFirstSaleCountryDigestRequest(category as FirstSaleCategory,country,crypto.randomUUID()):
    JSON.stringify({subjects:[{type:"country",country_iso3:country.trim().toUpperCase()}],
     question:question.trim(),fulfillment_mode:"published_only",max_age_seconds:3600,
     detail:"standard",client_request_id:crypto.randomUUID()});
   if(digest){
    const preflight=await fetch("/api/v1/intelligence/availability",{
     method:"POST",redirect:"error",cache:"no-store",
     headers:{"Content-Type":"application/json",Accept:"application/json"},
     body,signal:AbortSignal.timeout(25000)});
    // Never forward an upstream error body, or turn a 422/429/503 into a quote.
    if(preflight.status!==200){
     setMessage("A commercially qualified country digest is not available for this country and topic. No payment requested.");
     return;
    }
    const proof=acceptFirstSaleNoFundsPreflight(preflight.status,await preflight.json());
    if(!proof.quote_ready){
     setMessage(proof.state==="MERCHANT_RAIL_LOCKED"?
       "Qualified country digest found, but merchant settlement is not active. No payment requested.":
       "Country digest is unavailable for payment. No payment requested.");
     return;
    }
   }
   const response=await fetch(url,{method:"POST",redirect:"error",cache:"no-store",
    headers:{"Content-Type":"application/json","X-Geomacro-Payment-Network":payNetwork},
    body,signal:AbortSignal.timeout(45000)});
   if(response.status!==402){
    setMessage(response.status===422?"Qualified product is no longer available. No payment requested.":
     response.status===429?"Request limit reached. No payment requested.":
     "A payable answer could not be verified. No payment requested.");return;
   }
   const data=await response.json();
   const offer=digest?
    validateFirstSaleCountryDigestQuote(data,window.location.origin):
    validateBuyerUsdcOffer(data,payNetwork,window.location.origin);
   if(!digest&&offer.quote.capability!=="intelligence_query")
    throw Error("PAYMENT_PRODUCT_MISMATCH");
   setPending({url,body,network:payNetwork,offer,mode:offerMode});
   setMessage("Exact product prepared. Review the network, price and receiving address before paying.");
  }catch(error){setMessage(error instanceof Error&&error.message==="PAYMENT_CHAIN_OR_QUOTE_MISMATCH"
   ?"This network is not available for the requested answer. No payment requested.":
   "Availability could not be verified. No payment requested.");}
  finally{setBusy(false);}
 }
 async function pay(recover=false){
  if(!pending)return;setBusy(true);setResult(null);
  let payment=pending;
  try{
   if(!recover){
    const quote={x402Version:2,resource:{url:new URL("/api/v1/intelligence/query",window.location.origin).href,
     mimeType:"application/json"},accepts:[pending.offer.accepted],extensions:pending.offer.extensions};
    if(pending.mode==="country_digest")
     validateFirstSaleCountryDigestQuote(quote,window.location.origin);
    else validateBuyerUsdcOffer(quote,pending.network,window.location.origin);
    const ethereum=(window as unknown as {ethereum?:ConstructorParameters<typeof BrowserProvider>[0]}).ethereum;
    if(!ethereum)throw Error("WALLET_UNAVAILABLE");
    const provider=new BrowserProvider(ethereum,"any");
    await provider.send("eth_requestAccounts",[]);
    await provider.send("wallet_switchEthereumChain",[{chainId:"0x"+pending.offer.rail.chain_id.toString(16)}]);
    const actual=await provider.send("eth_chainId",[]);
    if(BigInt(actual)!==BigInt(pending.offer.rail.chain_id))throw Error("WALLET_NETWORK_MISMATCH");
    const signer=await provider.getSigner();
    const nonce="0x"+Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
    const validBefore=Math.min(Math.floor(Date.parse(String(pending.offer.quote.expires_at))/1000),
     Math.floor(Date.now()/1000)+Number(pending.offer.accepted.maxTimeoutSeconds));
    if(validBefore<=Math.floor(Date.now()/1000)+5)throw Error("QUOTE_EXPIRED");
    const authorization={from:await signer.getAddress(),to:String(pending.offer.accepted.payTo),
     value:String(pending.offer.accepted.amount),validAfter:"0",validBefore:String(validBefore),nonce};
    const extra=pending.offer.accepted.extra as Record<string,unknown>;
    const signature=await signer.signTypedData({name:String(extra.name),version:"2",
     chainId:pending.offer.rail.chain_id,verifyingContract:pending.offer.rail.asset},
     {TransferWithAuthorization:[{name:"from",type:"address"},{name:"to",type:"address"},
      {name:"value",type:"uint256"},{name:"validAfter",type:"uint256"},
      {name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"}]},authorization);
    const payload={x402Version:2,resource:{url:new URL("/api/v1/intelligence/query",window.location.origin).href,
     mimeType:"application/json"},accepted:pending.offer.accepted,payload:{signature,authorization},
     extensions:{...(pending.offer.extensions as Record<string,unknown>),
      "payment-identifier":{info:{required:true,id:pending.offer.quote.quote_id}}}};
    const proof=btoa(Array.from(new TextEncoder().encode(JSON.stringify(payload)),b=>String.fromCharCode(b)).join(""));
    payment={...pending,proof};setPending(payment);
   }
   if(!payment.proof)throw Error("PAYMENT_PROOF_MISSING");
   const response=await fetch(payment.url,{method:"POST",redirect:"error",cache:"no-store",
    headers:{"Content-Type":"application/json","PAYMENT-SIGNATURE":payment.proof,
     "X-Geomacro-Payment-Network":payment.network},body:payment.body,signal:AbortSignal.timeout(45000)});
   const raw=await response.text();
   if(response.status!==200)throw Error("DELIVERY_REQUIRES_RECOVERY");
   const expected=String(payment.offer.quote.prepared_answer_sha256);
   if(response.headers.get("X-Geomacro-Delivery-SHA256")!==expected||
      !response.headers.get("PAYMENT-RESPONSE"))throw Error("DELIVERY_RECEIPT_UNVERIFIED");
   setResult(await assertBuyerDeliveredBytes(raw,expected));
   setMessage("Structured answer received and response hash verified.");setPending(null);
  }catch{setMessage(payment.proof
   ?"Delivery is not confirmed. Recover with the same payment proof; do not authorize another payment."
   :"Payment was not submitted. Check the wallet, network and quote expiry.");}
  finally{setBusy(false);}
 }
 return <section id="query-console" className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
  <h2 className="text-3xl font-semibold">Check a verified product. Review the quote. Receive JSON.</h2>
  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Start with a source-qualified historical Country Digest at {FIRST_SALE_PRICE.amount_usdc} USDC, if available. No payment is requested before evidence, rights, merchant activation and the exact quote are verified.</p>
  <form onSubmit={check} className="mt-6 grid gap-4 rounded-2xl border border-border p-5 sm:grid-cols-3">
   <label className="text-sm sm:col-span-3">Product<select disabled={busy||!!pending?.proof} className="mt-2 w-full rounded border border-border bg-background p-3" value={offerMode} onChange={e=>{reset();const next=e.target.value as OfferMode;setOfferMode(next);if(next==="country_digest")setNetwork("base");}}>
    <option value="country_digest">Country Digest — {FIRST_SALE_PRICE.amount_usdc} USDC (historical / unscored)</option>
    <option value="question">Intelligence question — exact eligible variant price</option>
   </select></label>
   <label className="text-sm">Category<select disabled={busy||!!pending?.proof} className="mt-2 w-full rounded border border-border bg-background p-3" value={category} onChange={e=>{reset();setCategory(e.target.value);}}>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
   <label className="text-sm">Payment network<select disabled={busy||!!pending?.proof} className="mt-2 w-full rounded border border-border bg-background p-3" value={network} onChange={e=>{reset();setNetwork(e.target.value as GeomacroUsdcNetwork);}}>{Object.values(GEOMACRO_USDC_NATIVE_RAILS).filter(n=>offerMode!=="country_digest"||n.id==="base").map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
   <label className="text-sm">Country ISO3<input required pattern="[A-Za-z]{3}" maxLength={3} disabled={busy||!!pending?.proof} className="mt-2 w-full rounded border border-border bg-background p-3 uppercase" value={country} onChange={e=>{reset();setCountry(e.target.value);}} /></label>
   {offerMode==="question"&&<label className="text-sm sm:col-span-3">Your question<textarea required minLength={3} maxLength={2000} disabled={busy||!!pending?.proof} className="mt-2 min-h-24 w-full rounded border border-border bg-background p-3" value={question} onChange={e=>{reset();setQuestion(e.target.value);}} /></label>}
   <div className="flex flex-wrap items-center gap-3 sm:col-span-3"><Button type="submit" disabled={busy||!!pending?.proof}>{busy?"Checking…":"Check eligibility and exact price"}</Button><span className="text-xs text-muted-foreground">No payment for eligibility checks. Settlement stays locked until verified production activation.</span></div>
  </form>
  <p className="mt-3 break-all font-mono text-xs text-muted-foreground">API: /api/v1/intelligence/{category} · Agent: {selected.tool}</p>
  {message&&<p role="status" className="mt-4 text-sm">{message}</p>}
  {pending&&<div className="mt-4 rounded-xl border border-primary/35 p-5"><p>{pending.offer.amount_usdc} USDC · {pending.offer.rail.name}</p><p className="mt-2 break-all font-mono text-xs">Receiving address: {String(pending.offer.accepted.payTo)}</p><p className="mt-2 text-xs">Quote expires: {String(pending.offer.quote.expires_at)}</p><Button type="button" className="mt-4" disabled={busy} onClick={()=>void pay(!!pending.proof)}>{pending.proof?"Recover same payment":"Confirm in wallet and pay"}</Button></div>}
  {result!==null&&<pre className="mt-5 max-h-[32rem] overflow-auto rounded-xl border border-border bg-card p-4 text-xs">{JSON.stringify(result,null,2)}</pre>}
 </section>;
}
