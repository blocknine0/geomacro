export async function getJson(url, {headers={}, timeoutMs=15000}={}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const res = await fetch(url,{headers:{accept:"application/json",...headers},signal:controller.signal});
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0,500)}`);
    try { return JSON.parse(text); } catch { throw new Error(`Non-JSON response from ${url}`); }
  } finally { clearTimeout(timer); }
}
export function observation({sourceId,category,countryIso3,publishedAt=null,observedAt=new Date().toISOString(),title,summary,url,confidence=0.5,raw=null}) {
  return {source_id:sourceId,category,country_iso3:countryIso3,published_at:publishedAt,observed_at:observedAt,title,summary,url,confidence,raw};
}
