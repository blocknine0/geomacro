/**
 * Candidate country attribution from an ORIGINAL headline, not a publisher
 * location. One unambiguous country mention is required; references to two
 * countries describe a cross-border story, not a single-country observation.
 * Do not automatically interpret uppercase ordinary words (AND, CAN, ARE)
 * as ISO3. Structured request ISO3 validation is a separate mechanism.
 */
const normalize=x=>String(x??"").normalize("NFKC").toLocaleLowerCase("en")
 .replace(/[^\p{L}\p{M}\p{N}]+/gu," ").replace(/\s+/gu," ").trim();

const LOCALES=Object.freeze([
 "en","bn","hi","es","fr","de","pt","ru","ar","zh","ja","ko",
 "tr","id","sw","fa","ur","ta","te","th","vi","ms","it","nl","pl","uk",
]);
const INDEX_CACHE=new WeakMap();

function countryAliases(countries){
 if(INDEX_CACHE.has(countries))return INDEX_CACHE.get(countries);
 const seen=new Map();
 function add(raw,iso3){
  if(typeof raw!=="string")return;
  const phrase=normalize(raw);
  if(phrase.length<3||phrase.length>110)return;
  if(!seen.has(phrase))seen.set(phrase,iso3);
  else if(seen.get(phrase)!==iso3)seen.set(phrase,null);
 }
 for(const c of countries)for(const name of [c.name,...c.aliases])add(name,c.iso3);
 // Native issuer headlines must not require English translations. Intl only
 // adds candidates; unsupported CLDR languages fail closed, not guessed.
 for(const locale of LOCALES){
  try{
   const names=new Intl.DisplayNames([locale],{type:"region"});
   for(const c of countries){
    const translated=names.of(c.iso2);
    if(translated&&translated!==c.iso2)add(translated,c.iso3);
   }
  }catch{
   // Node/edge ICU support varies, preserve canonical 195 English aliases.
  }
 }
 const index=[...seen].filter(([,iso3])=>iso3!==null)
  .map(([phrase,iso3])=>({phrase,iso3}))
  .sort((a,b)=>b.phrase.length-a.phrase.length||a.phrase.localeCompare(b.phrase));
 INDEX_CACHE.set(countries,index);
 return index;
}
export function countryMentionFromTitle(title,countries){
 if(typeof title!=="string"||title.length>300||
    !Array.isArray(countries)||countries.length!==195)
   throw Error("NEWS_COUNTRY_195_INPUT_INVALID");
 const phrase=normalize(title);
 const padded=" "+phrase+" ";
 const accepted=[],detected=new Set();
 for(const item of countryAliases(countries)){
  // Chinese/Japanese/Korean country names can be adjacent to other text
  // without spaces; all other scripts require lexical word boundaries.
  const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(item.phrase);
  const token=cjk?item.phrase:" "+item.phrase+" ";
  let pos=padded.indexOf(token);
  while(pos!==-1){
   const span={start:pos,end:pos+token.length};
   if(!accepted.some(a=>span.start<a.end&&span.end>a.start)){
    accepted.push(span);
    detected.add(item.iso3);
   }
   pos=padded.indexOf(token,pos+1);
  }
 }
 return detected.size===1?[...detected][0]:null;
}
