import {visiblePublisherText} from "./stateless-publisher-text";

/**
 * GDELT / global index can suggest a URL, but may carry the wrong headline.
 * Require matching FIRST-PARTY page H1 + native original publisher timestamp.
 * This is discovery triage only; never fact corroboration or commercial rights.
 */
export function indexedHeadlineMatchesOriginalPage(
  indexTitle:unknown,html:unknown,
):boolean {
  if(typeof indexTitle!=="string"||indexTitle.length<12||indexTitle.length>300||
     typeof html!=="string"||html.length>384*1024)return false;
  const visibleHtml=html.replace(/<!--[\s\S]*?(?:-->|$)/gu, "");
  let hidden:string|null=null, inHeading=false;
  const heading:string[]=[];
  for(const token of visibleHtml.match(/<[^>]*>|[^<]+/gu)??[]){
    if(!token.startsWith("<")){
      if(inHeading && hidden===null)heading.push(token);
      continue;
    }
    const tag=/^<\s*(\/)?\s*([a-z][a-z0-9:-]*)\b[^>]*>$/iu.exec(token);
    if(!tag)continue;
    const name=tag[2].toLowerCase();
    if(tag[1]){
      if(hidden===name){hidden=null;continue;}
      if(hidden===null && inHeading && name==="h1")break;
    }else if(hidden===null){
      if(["script","style","template"].includes(name))hidden=name;
      else if(name==="h1")inHeading=true;
    }
  }
  const publisherTitle=visiblePublisherText(heading.join(" "));
  if(publisherTitle.length<12||publisherTitle.length>300)return false;
  // Index text is untrusted. Exact words/numbers must agree, allowing only
  // typography, punctuation and case differences, never a changed country.
  const normalize=(value:string)=>(visiblePublisherText(value).normalize("NFKC")
    .toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]).join(" ");
  return normalize(indexTitle)===normalize(publisherTitle);
}


/**
 * For a URL supplied only by a global index, require a real publisher HTML
 * meta publication tag outside script/style/template text. The common native
 * article verifier independently parses/conflict-checks the precise clock.
 * Indexed pages without metadata fail closed; never use crawl or index time.
 */
export function indexedPublisherHasOriginalMetaOutsideScripts(html:unknown):boolean {
  if(typeof html!=="string"||html.length===0||html.length>384*1024)
    return false;
  const tagPattern=/<[^>]{0,1600}>/gu;
  let scriptDepth=0,styleDepth=0,templateDepth=0,scanned=0,match:RegExpExecArray|null;
  const visibleHtml=html.replace(/<!--[\s\S]*?(?:-->|$)/gu, "");
  while((match=tagPattern.exec(visibleHtml))!==null && scanned++<1600) {
    const tag=match[0];
    if(/^<\s*\/\s*script\b/iu.test(tag)){scriptDepth=Math.max(0,scriptDepth-1);continue;}
    if(/^<\s*\/\s*style\b/iu.test(tag)){styleDepth=Math.max(0,styleDepth-1);continue;}
    if(/^<\s*\/\s*template\b/iu.test(tag)){templateDepth=Math.max(0,templateDepth-1);continue;}
    if(/^<\s*script\b/iu.test(tag)){scriptDepth++;continue;}
    if(/^<\s*style\b/iu.test(tag)){styleDepth++;continue;}
    if(/^<\s*template\b/iu.test(tag)){templateDepth++;continue;}
    if(scriptDepth||styleDepth||templateDepth || !/^<meta\b/iu.test(tag))continue;
    const name=/\b(?:name|property)\s*=\s*["']([^"']+)["']/iu.exec(tag)?.[1]?.toLowerCase();
    if(!["article:published_time","datepublished","govuk:first-published-at"].includes(name??""))
      continue;
    const value=/\bcontent\s*=\s*["']([^"']{1,80})["']/iu.exec(tag)?.[1];
    if(value)return true;
  }
  return false;
}
