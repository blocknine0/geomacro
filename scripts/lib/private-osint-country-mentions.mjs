/** Offline native-language country routing. Source location never assigns event country. */
import {countryMentionFromTitle} from "./country-news-mentions-195.mjs";
const languages=["fr","es","pt","de","ar","ru","zh","ja","ko","hi","bn","it","tr","vi","id","pl","nl","sv","no","da","fi","hu","ro","cs","el","bg","hr","fa","he","uk"];
const normalize=s=>s.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/gu," ").trim();
const cache=new WeakMap();
export function privateOsintCountryMentions(title,countries){
 const base=countryMentionFromTitle(title,countries);
 let names=cache.get(countries);
 if(!names){
  names=[];
  for(const lang of languages){
   const display=new Intl.DisplayNames([lang],{type:"region"});
   for(const c of countries){
    if(!/^[A-Z]{2}$/u.test(c.iso2))throw Error("PRIVATE_OSINT_COUNTRY_ISO2_INVALID");
    const label=normalize(display.of(c.iso2));
    const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(label);
    if(label.length>=(cjk?2:4))names.push({iso3:c.iso3,label,cjk});
   }
  }
  cache.set(countries,names);
 }
 const text=normalize(title),found=[];
 for(const n of names){
  let start=text.indexOf(n.label);
  while(start>=0){
   const end=start+n.label.length;
   if(n.cjk||((start===0||text[start-1]===" ")&&(end===text.length||text[end]===" ")))
    found.push({...n,start,end});
   start=text.indexOf(n.label,start+1);
  }
 }
 // A full localized country name takes precedence over a shorter name
 // contained in it, e.g. Guinea-Bissau versus Guinea.
 const matches=new Set(found.filter(n=>!found.some(m=>m.start<=n.start&&m.end>=n.end&&
  m.end-m.start>n.end-n.start)).map(n=>n.iso3));
 if(base)matches.add(base);
 return [...matches].sort();
}
/** Single-country convenience API; never infer location from source alone. */
export function privateOsintCountryMention(title,countries){
 const matches=privateOsintCountryMentions(title,countries);
 return matches.length===1?matches[0]:null;
}
