import {describe,it,expect} from 'vitest';
import {parsePrivateMachineCommercialCountryRequest,parsePrivateMachineCommercialRequest}
 from '../../scripts/ops/accept-private-geomacro-machine-commercial-gro';
const part=(category:string,country_iso3='USA')=>({schema:'geomacro.private-machine-commercial-request.v1',
 category,country_iso3,event:{id:'parser-only-no-real-evidence'},candidates:[{},{}],envelope:{}});
const bundle=()=>({schema:'geomacro.private-machine-commercial-country-request.v1',parts:[part('geopolitics'),part('macro'),part('rare_earth')]});
describe('private three-category machine input envelope',()=>{
 it('retains the existing single-category parser and accepts exactly three independently scoped parts',()=>{
  expect(parsePrivateMachineCommercialRequest(JSON.stringify(part('macro'))).category).toBe('macro');
  expect(parsePrivateMachineCommercialCountryRequest(JSON.stringify(bundle())).map(x=>x.category)).toEqual(['geopolitics','macro','rare_earth']);
 });
 it('rejects missing or repeated categories and cross-country mixtures',()=>{
  const missing=bundle();missing.parts.pop();
  const duplicate=bundle();duplicate.parts[1]=part('geopolitics');
  const country=bundle();country.parts[1]=part('macro','CHN');
  for(const value of [missing,duplicate,country])expect(()=>parsePrivateMachineCommercialCountryRequest(JSON.stringify(value))).toThrow();
 });
 it('does not accept a caller signing authorization or extra envelope property',()=>{
  expect(()=>parsePrivateMachineCommercialCountryRequest(JSON.stringify({...bundle(),payment_authorized:true}))).toThrow();
  const malicious=bundle();Object.assign(malicious.parts[1],{signingMaterial:{key_id:'caller-key'}});
  expect(()=>parsePrivateMachineCommercialCountryRequest(JSON.stringify(malicious))).toThrow();
 });
});
