const IDS=new Set(['USA','GBR','IND','CHN','BRA','ZAF','AUS','UKR','PSE','VAT','TWN','XKX']);
export function selectCountryCensusScope(entities,{event,requested=false,enforce=true}={}){
 if(requested&&(event!=='pull_request'||enforce))throw Error('X402_DIAGNOSTIC_PR_ONLY');
 const diagnostic=requested&&event==='pull_request';
 const selected=diagnostic?entities.filter(x=>IDS.has(x.iso3)):entities;
 if(diagnostic&&(selected.length<10||selected.length>12))throw Error('X402_DIAGNOSTIC_SAMPLE_DRIFT');
 return {diagnostic,selected};
}
