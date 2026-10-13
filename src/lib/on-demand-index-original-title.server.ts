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
  const h1=/<h1\b[^>]{0,600}>([\s\S]{1,1700}?)<\/h1\s*>/iu.exec(html)?.[1];
  if(!h1)return false;
  const publisherTitle=visiblePublisherText(h1);
  if(publisherTitle.length<12||publisherTitle.length>300)return false;
  const ignored=new Set(["about","after","before","with","from","that","this",
    "they","their","into","amid","the","and","news","update","today","official",
    "statement","government","release","press","report","world"]);
  const words=(value:string)=>new Set(
    (visiblePublisherText(value).normalize("NFKC").toLowerCase()
      .match(/[\p{L}\p{N}]{4,}/gu)??[])
      .filter(w=>!ignored.has(w)),
  );
  const sought=words(indexTitle);
  const original=words(publisherTitle);
  if(sought.size<2||original.size<2)return false;
  const overlap=[...sought].filter(w=>original.has(w)).length;
  return overlap>=2 && overlap/Math.min(sought.size,original.size)>=0.5;
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
  while((match=tagPattern.exec(html))!==null && scanned++<1600) {
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
