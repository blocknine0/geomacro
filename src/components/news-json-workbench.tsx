import {useState} from "react";
import {Braces,Check,Clipboard,Download,FileText,RefreshCw} from "lucide-react";

type Category="geopolitics"|"macro-fx"|"critical-minerals";
type License="commercial"|"noncommercial"|"public_domain"|"unknown";
export function NewsJsonWorkbench(){
  const [category,setCategory]=useState<Category>("geopolitics");
  const [license,setLicense]=useState<License>("unknown");
  const [text,setText]=useState("");
  const [sourceName,setSourceName]=useState("");
  const [sourceUrl,setSourceUrl]=useState("");
  const [country,setCountry]=useState("");
  const [published,setPublished]=useState("");
  const [result,setResult]=useState<Record<string,unknown>|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [copied,setCopied]=useState(false);
  const json=result?JSON.stringify(result,null,2):"";
  async function generate(){
    setResult(null);setMessage("");setCopied(false);
    if(text.trim().length<25){setMessage("Paste at least 25 characters of news text.");return}
    setBusy(true);
    try{
      const response=await fetch("/api/v1/intelligence/live-structured",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mode:"news-json",news:{
          category,text,license,
          ...(sourceName.trim()?{source_name:sourceName.trim()}:{}),
          ...(sourceUrl.trim()?{source_url:sourceUrl.trim()}:{}),
          ...(country.trim()?{country_iso3:country.trim().toUpperCase()}:{}),
          ...(published?{published_at:new Date(published).toISOString()}:{}),
        }}),
      });
      const body=await response.json() as Record<string,unknown>;
      if(!response.ok||body.ok!==true)throw Error(String(body.error??"NORMALIZATION_FAILED"));
      setResult(body);
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to generate JSON.");}
    finally{setBusy(false)}
  }
  async function copy(){
    try{await navigator.clipboard.writeText(json);setCopied(true)}
    catch{setMessage("Clipboard unavailable. Select and copy the JSON below.")}
  }
  function download(){
    if(!json)return;
    const url=URL.createObjectURL(new Blob([json],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;
    link.download="geomacro-reusable-news.json";link.click();
    URL.revokeObjectURL(url);
  }
  const field="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50";
  return <section className="rounded-2xl border border-border bg-card/30 p-5 sm:p-7" aria-labelledby="news-json-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="gm-eyebrow">News → Structured JSON</p>
        <h2 id="news-json-title" className="mt-2 text-2xl font-semibold tracking-tight">Turn news into reusable facts.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Paste a source item, select a category and generate machine-readable JSON. Works with commercial, non-commercial and unknown-license inputs; commercial permissions are never assumed.</p>
      </div>
      <Braces className="h-6 w-6 text-primary" aria-hidden />
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Category
            <select value={category} onChange={e=>setCategory(e.target.value as Category)} className={"mt-1 "+field}>
              <option value="geopolitics">Geopolitics</option>
              <option value="macro-fx">Macro / FX</option>
              <option value="critical-minerals">Critical Minerals</option>
            </select>
          </label>
          <label className="text-xs font-semibold">Source license (declared)
            <select value={license} onChange={e=>setLicense(e.target.value as License)} className={"mt-1 "+field}>
              <option value="unknown">Unknown / not checked</option>
              <option value="commercial">Commercial reuse stated</option>
              <option value="noncommercial">Non-commercial only</option>
              <option value="public_domain">Public domain stated</option>
            </select>
          </label>
        </div>
        <label className="block text-xs font-semibold">Paste news text
          <textarea value={text} onChange={e=>setText(e.target.value)} maxLength={12000} rows={8}
            placeholder="Paste a news article or announcement here…"
            className={"mt-1 min-h-40 resize-y "+field}/>
          <span className="mt-1 block text-right font-mono text-[11px] font-normal text-muted-foreground">{text.length}/12,000</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Publisher (optional)
            <input value={sourceName} onChange={e=>setSourceName(e.target.value)} maxLength={120} className={"mt-1 "+field} placeholder="Original publisher"/>
          </label>
          <label className="text-xs font-semibold">Country ISO3 (optional)
            <input value={country} onChange={e=>setCountry(e.target.value.toUpperCase().slice(0,3))} maxLength={3} className={"mt-1 "+field} placeholder="USA"/>
          </label>
        </div>
        <label className="block text-xs font-semibold">Original URL (optional)
          <input type="url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} className={"mt-1 "+field} placeholder="https://publisher.example/news"/>
        </label>
        <label className="block text-xs font-semibold">Publication timestamp (optional)
          <input type="datetime-local" value={published} onChange={e=>setPublished(e.target.value)} className={"mt-1 "+field}/>
        </label>
        <button type="button" disabled={busy||text.trim().length<25} onClick={()=>void generate()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy?<RefreshCw className="h-4 w-4 animate-spin"/>:<FileText className="h-4 w-4"/>}
          {busy?"Generating…":"Generate structured JSON"}
        </button>
        {message?<p role="alert" className="text-xs text-destructive">{message}</p>:null}
      </div>
      <div className="flex min-h-96 flex-col overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground">geomacro.reusable-news-json.v1</span>
          <div className="flex gap-2">
            <button type="button" onClick={()=>void copy()} disabled={!result} aria-label="Copy JSON" className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5 text-xs disabled:opacity-40">
              {copied?<Check className="h-3.5 w-3.5"/>:<Clipboard className="h-3.5 w-3.5"/>} Copy
            </button>
            <button type="button" onClick={download} disabled={!result} aria-label="Download JSON" className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5 text-xs disabled:opacity-40">
              <Download className="h-3.5 w-3.5"/> JSON
            </button>
          </div>
        </div>
        <pre aria-label="Structured JSON output" className="max-h-150 flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-xs leading-6 text-foreground">
          {json||"Your structured JSON appears here after generation.\n\nAutomatic live feed:\nGET /api/v1/intelligence/query?view=reusable-news-json\n\nThe original text is not retained by the JSON endpoint."}
        </pre>
      </div>
    </div>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">Output contains bounded factual indicators and explicit source-rights status, not the article itself. Generating JSON does not grant third-party commercial permissions or authorize a paid product. No upstream source is fetched from this form.</p>
  </section>;
}
