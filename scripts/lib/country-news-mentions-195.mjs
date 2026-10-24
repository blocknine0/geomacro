/**
 * Exact, source-title-only ISO3 country mentions for the canonical 195 list.
 * A publisher's nationality, feed's country, or a global story does NOT
 * automatically qualify every country. Ambiguous titles remain null.
 */
const normalize=x=>String(x??"").normalize("NFKC").toLocaleLowerCase("en")
 .replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/gu," ").trim();
export function countryMentionFromTitle(title,countries){
 if(typeof title!=="string"||title.length>300||
    !Array.isArray(countries)||countries.length!==195)
  throw Error("NEWS_COUNTRY_195_INPUT_INVALID");
 const names=" "+normalize(title)+" ",matches=new Set();
 const iso3s=new Set(title.match(/\b[A-Z]{3}\b/gu)??[]);
 for(const c of countries){
   if(iso3s.has(c.iso3)){matches.add(c.iso3);continue}
   const options=[c.name,...c.aliases];
   for(const alias of options){
     if(typeof alias!=="string"||alias.length<4)continue;
     const phrase=normalize(alias);
     if(phrase&&names.includes(" "+phrase+" ")){matches.add(c.iso3);break}
   }
 }
 return matches.size===1?[...matches][0]:null;
}
