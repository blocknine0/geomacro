/**
 * Conservative country mention matching for private original-publisher titles.
 * Verified World Bank country name is the default. Reviewed demonyms bridge
 * original headlines like "Chinese lithium" without guessed source rights.
 */
const REVIEWED_DEMONYMS: Readonly<Record<string,readonly string[]>> = Object.freeze({
  CHN:["Chinese"], IND:["Indian"], USA:["American","U.S.","US"],
  AUS:["Australian"], CAN:["Canadian"], GBR:["British","UK"],
  JPN:["Japanese"], BRA:["Brazilian"], ZAF:["South African"],
  CHL:["Chilean"], IDN:["Indonesian"], KOR:["South Korean"],
  DEU:["German"], FRA:["French"],
});
function normalized(value:string):string {
  return value.normalize("NFKC").trim().replace(/\s+/gu," ");
}
function escaped(value:string):string {
  return [...value].map(c=>
    "\\.^$*+?()[]{}|".includes(c) ? "\\"+c : c).join("");
}
export function originalHeadlineMentionsCountry(
  title:string, countryIso3:string, verifiedOfficialName:string,
):boolean {
  if(typeof title!=="string"||title.length>300||
     !/^[A-Z]{3}$/u.test(countryIso3) ||
     typeof verifiedOfficialName!=="string" ||
     !/^[\p{L}\p{N} ,.'&()-]{2,100}$/u.test(verifiedOfficialName))
    return false;
  const clean=normalized(title);
  // Reject substrings like "Chinatown" for China and "IndiaMart" for India.
  const terms=[verifiedOfficialName,...(REVIEWED_DEMONYMS[countryIso3]??[])];
  return terms.some(term=>{
    const pattern=new RegExp(
      "(?:^|[^\\p{L}\\p{N}])"+escaped(normalized(term))+
      "(?=$|[^\\p{L}\\p{N}])","iu");
    return pattern.test(clean);
  });
}