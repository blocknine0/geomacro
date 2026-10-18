import {COUNTRIES_195} from "./canonical-country-registry-195";

/**
 * Offline EXACT title-only geography detection for the unscored first-party
 * release collector. Never infer from issuer hostname, source registry,
 * old D1 row, neighboring states, demonym, or uncorroborated source.
 * Multi-country titles never silently select a GRI certification subject.
 */
const AMBIGUOUS_COUNTRY_NAMES=new Set([
  "chad","georgia","jordan","guinea","dominica","congo",
  "samoa","turkey",
]);
const safeName=(value:string)=>value.normalize("NFKC")
  .replace(/[\u2019\u02bc\u02bb]/gu,"'").replace(/\s+/gu," ").trim();
const escapePattern=(s:string)=>[...s].map(char=>
  ".*+?^$()|[]{}\\".includes(char)?"\\"+char:char).join("");
type CountryMention=Readonly<{iso3:string;name:string;start:number;end:number}>;
const MATCHERS=Object.freeze(COUNTRIES_195.flatMap(country=>
  [country.name,...country.aliases]
    .map(raw=>safeName(raw))
    .filter(label=>label.length>=4 &&
      !AMBIGUOUS_COUNTRY_NAMES.has(label.toLowerCase()) &&
      /^[\p{L}][\p{L}\p{M}\p{N} .,'’()\-]{3,79}$/u.test(label))
    .map(label=>({
      iso3:country.iso3,name:country.name,label,
      pattern:new RegExp(
        "(?<![\\p{L}\\p{M}\\p{N}])"+escapePattern(label)+
        "(?![\\p{L}\\p{M}\\p{N}])","giu"),
    }))
));
if(COUNTRIES_195.length!==195||MATCHERS.length<180)
  throw Error("GRI_COUNTRY_TITLE_REGISTRY_INCOMPLETE");

export function exactCanonicalCountryMentionFromOriginalTitle(title:string):string|null{
  if(typeof title!=="string"||title.length<4||title.length>400||
     /[<>{}\r\n]/u.test(title))return null;
  const normalized=safeName(title);
  const hits:CountryMention[]=[];
  for(const m of MATCHERS){
    m.pattern.lastIndex=0;
    let match:RegExpExecArray|null;
    while((match=m.pattern.exec(normalized))!==null){
      hits.push({iso3:m.iso3,name:m.name,start:match.index,
        end:match.index+match[0].length});
      if(hits.length>24)return null;
    }
  }
  // Prefer a longer exact sovereign-name span to an embedded shorter name:
  // "Papua New Guinea" is PNG, not a speculative second country Guinea.
  hits.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||
    a.start-b.start||a.iso3.localeCompare(b.iso3));
  const selected:CountryMention[]=[];
  for(const hit of hits){
    if(selected.some(s=>hit.start>=s.start&&hit.end<=s.end))continue;
    if(selected.some(s=>hit.start<s.end&&s.start<hit.end))return null;
    selected.push(hit);
  }
  const unique=new Set(selected.map(x=>x.iso3));
  return unique.size===1?selected[0].name:null;
}
