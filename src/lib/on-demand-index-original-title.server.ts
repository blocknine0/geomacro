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
