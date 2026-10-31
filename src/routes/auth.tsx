import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {ShieldCheck,Mail,ArrowRight,Loader2} from "lucide-react";
export const Route=createFileRoute("/auth")({
 head:()=>({meta:[{title:"Customer sign in | Geomacro"},
  {name:"description",content:"Secure Geomacro customer login using a one-time email verification code."}]}),
 component:CustomerAuth,
});
function CustomerAuth(){
 const [email,setEmail]=useState("");
 const [otp,setOtp]=useState("");
 const [step,setStep]=useState<"email"|"verify">("email");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function submit(event:React.FormEvent){
  event.preventDefault();setError("");setNotice("");setBusy(true);
  try{
   const response=await fetch("/api/v1/customer/auth",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(step==="email"?{action:"start",email}:{action:"verify",email,otp}),
   });
   const result=await response.json() as {ok?:boolean;code?:string};
   if(!response.ok||!result.ok)throw Error(result.code??"Authentication temporarily unavailable");
   if(step==="email"){setStep("verify");setNotice("Check your email for a verification code. Email delivery depends on the configured OTP template.");}
   else window.location.assign("/dashboard");
  }catch(e){setError(e instanceof Error?e.message:"Authentication unavailable");}
  finally{setBusy(false);}
 }
 return <main className="gm-container py-14 sm:py-20">
  <section className="mx-auto max-w-md rounded-2xl border border-border bg-background p-6 shadow-lg sm:p-9">
   <div className="flex items-center gap-3 text-primary"><ShieldCheck className="h-6 w-6"/>
    <span className="text-xs font-semibold uppercase tracking-widest">Customer access</span></div>
   <h1 className="mt-5 text-3xl font-semibold tracking-tight">Sign in to Geomacro</h1>
   <p className="mt-3 text-sm leading-6 text-muted-foreground">
    Email verification keeps customer API keys private. Public research remains free to browse without an account.</p>
   <form onSubmit={submit} className="mt-7 space-y-5">
    <label className="block space-y-2 text-sm font-medium">Email address
     <input type="email" required autoComplete="email" maxLength={254} value={email}
      disabled={busy||step==="verify"} onChange={event=>setEmail(event.target.value)}
      className="w-full rounded-lg border border-border bg-background px-4 py-3 outline-offset-2" placeholder="you@company.com"/></label>
    {step==="verify"&&<label className="block space-y-2 text-sm font-medium">Email verification code
     <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}"
      minLength={6} maxLength={8} value={otp} onChange={event=>setOtp(event.target.value)}
      className="w-full rounded-lg border border-border bg-background px-4 py-3 outline-offset-2"
      placeholder="6–8 digit code"/></label>}
    {notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
     {busy?<Loader2 className="h-4 w-4 animate-spin"/>:step==="email"?<Mail className="h-4 w-4"/>:<ArrowRight className="h-4 w-4"/>}
     {step==="email"?"Send verification code":"Verify and sign in"}
    </button>
    {step==="verify"&&<button type="button" onClick={()=>{setStep("email");setOtp("");}} className="text-sm text-primary underline underline-offset-4">Use another email</button>}
   </form>
   <p className="mt-6 text-xs leading-5 text-muted-foreground">Account access does not grant credits. API keys require verified payment-funded entitlement and an active credit balance.</p>
   <Link to="/pricing" className="mt-4 inline-block text-sm text-primary underline underline-offset-4">View pricing</Link>
  </section>
 </main>;
}
