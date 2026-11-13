const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");

function matchesIfNoneMatch(value,etag){
 if(typeof value!=="string")return false;
 return value.split(",").some(candidate=>{
  const tag=candidate.trim();
  return tag==="*"||tag===etag||tag.startsWith("W/")&&tag.slice(2)===etag;
 });
}

/** Attach a body-derived validator after the public read-through cache. */
export async function withPublicEtag(request,response){
 if(response?.status!==200||response.headers.has("Set-Cookie"))return response;
 const bytes=await response.arrayBuffer();
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 const etag='"sha256-'+hex(new Uint8Array(digest))+'"';
 const headers=new Headers(response.headers);
 headers.set("ETag",etag);
 if(matchesIfNoneMatch(request.headers.get("If-None-Match"),etag)){
  headers.delete("Content-Length");
  return new Response(null,{status:304,headers});
 }
 return new Response(bytes,{status:200,statusText:response.statusText,headers});
}
