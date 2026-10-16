export async function getJson(url, {headers={}, timeoutMs=15000,maxBytes=null,redirect="follow"}={}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const res = await fetch(url,{redirect,headers:{accept:"application/json",...headers},signal:controller.signal});
    let text;
    if(maxBytes===null)text=await res.text();
    else {
      if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024)throw Error("HTTP_BODY_BOUND_INVALID");
      if(Number(res.headers.get('content-length')||0)>maxBytes){await res.body?.cancel();throw Error("HTTP_BODY_LIMIT");}
      if(!res.body)throw Error("HTTP_BODY_EMPTY");
      const reader=res.body.getReader(),chunks=[];let total=0;
      try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;
        if(total>maxBytes){await reader.cancel();throw Error("HTTP_BODY_LIMIT");}chunks.push(part.value);}}
      finally{reader.releaseLock();}
      const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0,500)}`);
    try { return JSON.parse(text); } catch { throw new Error(`Non-JSON response from ${url}`); }
  } finally { clearTimeout(timer); }
}
export function observation({sourceId,category,countryIso3,publishedAt=null,observedAt=new Date().toISOString(),title,summary,url,confidence=0.5,raw=null}) {
  return {source_id:sourceId,category,country_iso3:countryIso3,published_at:publishedAt,observed_at:observedAt,title,summary,url,confidence,raw};
}
