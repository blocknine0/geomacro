import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {Copy,KeyRound,ShieldCheck} from "lucide-react";

/**
 * PayPal returns only an order ID in URL, never an API key or bearer token.
 * Only a signed-in same-origin POST can verify/capture/fund that specific
 * server-bound order. The secret remains in React memory until tab close.
 */
export const Route=createFileRoute("/checkout/success")({
  head:()=>({meta:[{title:"Checkout verification | GeoMacro"},
    {name:"robots",content:"noindex,nofollow"}]}),
  component:CheckoutSuccess,
});
type Capture={ok?:boolean;code?:string;receipt_id?:string;
  credits_funded?:number;api_key?:string|null;
  settlement_verified?:boolean;key_issuance_status?:string};
function CheckoutSuccess(){
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<Capture|null>(null);
  const [error,setError]=useState("");
  async function complete(){
    if(busy||result?.ok)return;
    const order=new URLSearchParams(window.location.search).get("token")??"";
    if(!/^[A-Z0-9]{8,32}$/.test(order)){setError("PAYPAL_ORDER_TOKEN_INVALID");return;}
    setBusy(true);setError("");
    try{
      const res=await fetch("/api/v1/payments/paypal/capture-order",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({order_id:order}),
      });
      const value=await res.json() as Capture;
      if(!res.ok||value.ok!==true||value.settlement_verified!==true){
        throw Error(value.code??"CHECKOUT_VERIFICATION_UNAVAILABLE");
      }
      setResult(value);
      // Never put API secrets in URL, history, localStorage, or analytics.
      window.history.replaceState(null,"","/checkout/success");
    }catch(e){setError(e instanceof Error?e.message:"CHECKOUT_VERIFICATION_UNAVAILABLE");}
    finally{setBusy(false);}
  }
  const secret=result?.api_key??null;
  const curl='curl -H "Authorization: Bearer '+(secret??'$GEOMACRO_API_KEY')+'" -H "Idempotency-Key: $(uuidgen)" https://geomacro-control-plane.daspallab202391.workers.dev/v1/risk/hot50';
  const python='import requests, uuid, os\\nurl = "https://geomacro-control-plane.daspallab202391.workers.dev/v1/risk/hot50"\\nheaders = {"Authorization": "Bearer " + os.environ["GEOMACRO_API_KEY"], "Idempotency-Key": str(uuid.uuid4())}\\nr = requests.get(url, headers=headers, timeout=20)\\nprint(r.status_code, r.json())';
  return <main className="gm-container max-w-3xl py-14">
    <p className="gm-eyebrow">Secure settlement handoff</p>
    <h1 className="mt-2 text-3xl font-semibold">Verify your purchase</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">
      Verify the PayPal capture against the original order and canonical D1 ledger.
      No API key is issued until verified funds and Hot 50 delivery acceptance are available.
    </p>
    {!result?.ok&&<button type="button" onClick={()=>void complete()} disabled={busy}
      className="mt-6 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
      {busy?"Verifying settlement…":"Complete purchase securely"}
    </button>}
    {error&&<p className="mt-4 rounded-lg border border-destructive/40 p-4 text-sm text-destructive" role="alert">
      {error}. If PayPal completed your payment, do not pay again; contact support for settlement reconciliation.</p>}
    {result?.ok&&<section className="mt-6 rounded-xl border border-border p-5" role="status">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5"/>Provider settlement verified</p>
      <p className="mt-2 text-sm">Receipt: <code className="break-all">{result.receipt_id}</code></p>
      <p className="mt-2 text-sm">{result.credits_funded?.toLocaleString()} credits funded.</p>
      {secret?<div className="mt-6">
        <p className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4"/>Your one-time API key</p>
        <p className="mt-2 text-xs text-muted-foreground">Copy now. This full key will not be shown again.</p>
        <code className="mt-3 block break-all rounded bg-muted p-3 text-xs">{secret}</code>
        <button type="button" onClick={()=>void navigator.clipboard.writeText(secret)}
          className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary"><Copy className="h-4 w-4"/>Copy API key</button>
        <p className="mt-6 text-sm font-semibold">Try your first signed Hot 50 call</p>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs"><code>{curl}</code></pre>
        <p className="mt-4 text-sm font-semibold">Python example (set GEOMACRO_API_KEY in your environment)</p>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs"><code>{python.replaceAll('\\n','\n')}</code></pre>
      </div>:<p className="mt-4 text-sm">Your funds have been recorded. Hot 50 API key generation is pending qualified evidence and production release verification. You can request an API key in your dashboard after activation.</p>}
      <Link to="/dashboard" className="mt-6 inline-block text-sm font-semibold text-primary underline">Open account and credits</Link>
    </section>}
    <p className="mt-8 text-sm"><Link to="/pricing" className="text-primary underline">Return to Store</Link></p>
  </main>;
}
