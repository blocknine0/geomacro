/**
 * Reconcile the fixed 193 UN members + Holy See + Palestine 195-country
 * ISO3 routing registry with the separate existing 250-geography D1 census.
 * Offline registry analysis only; NOT issuer or paid-product proof.
 */
export function canonicalCountry195Denominator(source,geographies){
  const fail=(code)=>{throw Error("COUNTRY_195_CLASSIFICATION_"+code)};
  if(typeof source!=="string"||source.length>30000||
     !(geographies instanceof Map)||geographies.size!==250)fail("SOURCE_INVALID");
  const tag="const COUNTRY_ROWS="+"\x60";
  const start=source.indexOf(tag);
  if(start<0||source.indexOf(tag,start+tag.length)!==-1)fail("MARKER_INVALID");
  const end=source.indexOf("\x60;",start+tag.length);
  if(end<0||end-start>12000)fail("BLOCK_INVALID");
  const rows=source.slice(start+tag.length,end).trim().split(String.fromCharCode(10));
  if(rows.length!==195)fail("COUNT_DRIFT");
  const countries=new Map(),twoLetter=new Set();
  for(const row of rows){
    const parts=row.trim().split("|");
    if(parts.length!==3||!/^[A-Z]{3}$/u.test(parts[0])||
       !/^[A-Z]{2}$/u.test(parts[1])||!parts[2].trim()||
       countries.has(parts[0])||twoLetter.has(parts[1])||
       !geographies.has(parts[0]))fail("ROW_INVALID");
    countries.set(parts[0],geographies.get(parts[0]));
    twoLetter.add(parts[1]);
  }
  if(countries.get("VAT")!=="SOVEREIGN"||
     countries.get("PSE")!=="SPECIAL_ENTITY"||
     countries.has("TWN")||countries.has("UNK")||
     [...countries.values()].filter(v=>v==="SOVEREIGN").length!==194||
     [...countries.values()].filter(v=>v==="SPECIAL_ENTITY").length!==1)
    fail("BASELINE_MISMATCH");
  return countries;
}
