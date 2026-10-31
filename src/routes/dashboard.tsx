import {createFileRoute,Link} from "@tanstack/react-router";
import {useCallback,useEffect,useState} from "react";
import {KeyRound,ShieldCheck,Copy,LogOut,RefreshCw} from "lucide-react";
export const Route=createFileRoute("/dashboard")({
 head:()=>({meta:[{title:"Customer dashboard | Geomacro"},
  {name:"robots",content:"noindex,nofollow"}]}),
 component:CustomerDashboard,
});
type KeyMeta={key_id:string;enabled:boolean;scopes:string[];created_at:string;expires_at:string|null;revoked_at:string|null;last_used_at:string|null};
type Account={ok:boolean;code?:string;user?:{email:string};principal_ready?:boolean;
 credits?:{tier:string;allocated:number;used:number;remaining:number;period_ends_at:string;status:string}|null;
 keys?:KeyMeta[]};
function CustomerDashboard(){
 const [account,setAccount]=useState<Account|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [secret,setSecret]=useState("");
 const [signedOut,setSignedOut]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await fetch("/api/v1/customer/account",{credentials:"same-origin",cache:"no-store"});
   const result=await response.json() as Account;
   if(!response.ok||!result.ok)throw Error(result.code??"Account unavailable");
   setAccount(result);
  }catch(e){setError(e instanceof Error?e.message:"Unable to load account");setAccount(null);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function createKey(){
  setBusy(true);setError("");setSecret("");
  try{
   const response=await fetch("/api/v1/customer/keys",{method:"POST",credentials:"same-origin"});
   const result=await response.json() as {ok?:boolean;api_key?:string;code?:string};
   if(!response.ok||!result.ok||!result.api_key)throw Error(result.code??"Key unavailable");
   setSecret(result.api_key);await load();
  }catch(e){setError(e instanceof Error?e.message:"Key issuance unavailable");}
  finally{setBusy(false);}
 }
 async function revokeKey(keyId:string){
  if(!window.confirm("Revoke this API key? Existing integrations using it will stop working."))return;
  setBusy(true);setError("");setSecret("");
  try{
   const response=await fetch("/api/v1/customer/keys",{
    method:"DELETE",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key_id:keyId}),
   });
   const result=await response.json() as {ok?:boolean;code?:string};
   if(!response.ok||!result.ok)throw Error(result.code??"Revoke unavailable");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Revocation unavailable");}
  finally{setBusy(false);}
 }
 async function logout(){
  setBusy(true);
  try{await fetch("/api/v1/customer/auth",{method:"DELETE",credentials:"same-origin"});}
  finally{setSignedOut(true);setAccount(null);setSecret("");setBusy(false);}
 }
 const funded=account?.credits?.status==="active"&&(account.credits?.remaining??0)>0;
 return <main className="gm-container py-10 sm:py-14">
  <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
   <div><p className="gm-eyebrow">Private customer portal</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your Geomacro dashboard</h1>
    <p className="mt-2 text-sm text-muted-foreground">Real balances and active API credentials only. No demo credits.</p></div>
   <div className="flex items-center gap-2">
    <button type="button" onClick={()=>void load()} disabled={loading||busy}
     className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"><RefreshCw className="h-4 w-4"/>Refresh</button>
    <button type="button" onClick={()=>void logout()} disabled={busy}
     className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"><LogOut className="h-4 w-4"/>Sign out</button>
   </div>
  </div>
  {loading&&<p role="status" className="text-muted-foreground">Checking your verified account and credit ledger…</p>}
  {error&&<div role="alert" className="rounded-xl border border-border p-5 text-sm text-destructive">{error}
   {(error.includes("SESSION")||signedOut)&&<p className="mt-3"><Link to="/auth" className="underline">Sign in to continue</Link></p>}</div>}
  {signedOut&&<p role="status"><Link to="/auth" className="text-primary underline">You are signed out. Sign in again</Link></p>}
  {account&&<div className="space-y-8">
   <p className="text-sm text-muted-foreground">Signed in as <strong className="text-foreground">{account.user?.email}</strong></p>
   <section className="rounded-xl border border-border p-6">
    <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/><h2 className="text-xl font-semibold">Verified credit balance</h2></div>
    {account.credits?<div className="mt-5">
     <p className="text-3xl font-semibold tabular-nums">{account.credits.remaining.toLocaleString()} <span className="text-base font-normal text-muted-foreground">credits remaining</span></p>
     <p className="mt-3 text-sm text-muted-foreground">Plan: {account.credits.tier} · Allocated: {account.credits.allocated.toLocaleString()} · Used: {account.credits.used.toLocaleString()}</p>
     <p className="mt-1 text-sm text-muted-foreground">Status: {account.credits.status} · Period ends: {new Date(account.credits.period_ends_at).toLocaleDateString()}</p>
    </div>:<p className="mt-4 text-sm text-muted-foreground">No payment-funded credit allocation is linked to this account. Signing in never creates paid credits.</p>}
    <Link to="/pricing" className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4">Explore plans and payment readiness</Link>
   </section>
   <section className="rounded-xl border border-border p-6">
    <div className="flex flex-wrap justify-between gap-4">
     <div><div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary"/><h2 className="text-xl font-semibold">Personal API keys</h2></div>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Create up to three active keys after payment settlement. Keys expire at the funded period boundary and can be revoked at any time.</p></div>
     <button type="button" disabled={!funded||busy} onClick={()=>void createKey()}
      className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Generate API key</button>
    </div>
    {!funded&&<p className="mt-4 text-sm text-muted-foreground">API key generation is unavailable until an active verified entitlement and positive credit balance exist.</p>}
    {secret&&<div className="mt-6 rounded-lg border border-primary/30 p-4">
     <p className="text-sm font-semibold">Copy this key now. It will not be shown again.</p>
     <code className="mt-3 block break-all rounded bg-muted p-3 text-xs">{secret}</code>
     <button type="button" onClick={()=>void navigator.clipboard.writeText(secret)} className="mt-3 flex items-center gap-2 text-sm text-primary"><Copy className="h-4 w-4"/>Copy key</button>
    </div>}
    <div className="mt-6 divide-y divide-border">
     {account.keys?.length?account.keys.map(key=><div key={key.key_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0"><code className="text-sm">{key.key_id}</code>
       <p className="mt-1 text-xs text-muted-foreground">Created {new Date(key.created_at).toLocaleDateString()} · {key.enabled&&!key.revoked_at?"Active":"Revoked"}</p></div>
      {key.enabled&&!key.revoked_at&&<button type="button" disabled={busy} onClick={()=>void revokeKey(key.key_id)} className="rounded-lg border border-border px-4 py-2 text-sm text-destructive">Revoke</button>}
     </div>):<p className="py-4 text-sm text-muted-foreground">No API keys issued yet.</p>}
    </div>
   </section>
  </div>}
 </main>;
}
