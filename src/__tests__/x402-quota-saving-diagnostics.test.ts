import {describe,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {selectCountryCensusScope} from '../../scripts/agentic/x402-census-scope.mjs';
const source=readFileSync('src/lib/global-entity-classification.ts','utf8');
const entities=['SOVEREIGN_ISO3','TERRITORY_ISO3','SPECIAL_ENTITY_ISO3'].flatMap(scope=>{
 const a=source.indexOf(`const ${scope} = new Set([`),b=source.indexOf(']);',a);
 return [...source.slice(a,b).matchAll(/"([A-Z]{3})"/g)].map(x=>({iso3:x[1],scope}));
});
describe('quota-saving x402 PR diagnostics',()=>{
 it('keeps the directly executed Node CLI syntactically valid',()=>{
  expect(()=>execFileSync(process.execPath,['--check','scripts/agentic/verify-live-x402-country-availability-census.mjs'],{stdio:'pipe'})).not.toThrow();
 });
 it('samples at most twelve actual entities across regions while preserving the 250 entity universe',()=>{
  expect(entities).toHaveLength(250);
  const r=selectCountryCensusScope(entities,{event:'pull_request',requested:true,enforce:false});
  expect(r.diagnostic).toBe(true);expect(r.selected.length).toBeGreaterThanOrEqual(10);expect(r.selected.length).toBeLessThanOrEqual(12);
  expect(r.selected.map(x=>x.iso3)).toEqual(expect.arrayContaining(['USA','IND','BRA','ZAF','AUS','PSE','VAT']));
  expect(entities).toHaveLength(250);
 });
 it('keeps all release entities and forbids sampled enforcement or non-PR sampling',()=>{
  for(const event of ['push','workflow_run','workflow_dispatch',undefined]){
   const r=selectCountryCensusScope(entities,{event,enforce:true});expect(r.selected).toBe(entities);expect(r.diagnostic).toBe(false);
   expect(()=>selectCountryCensusScope(entities,{event,requested:true,enforce:false})).toThrow('PR_ONLY');
  }
  expect(()=>selectCountryCensusScope(entities,{event:'pull_request',requested:true,enforce:true})).toThrow('PR_ONLY');
 });
 it('cancels superseded PR runs only and labels partial evidence honestly',()=>{
  const workflow=readFileSync('.github/workflows/live-x402-prelaunch-availability.yml','utf8');
  expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  const script=readFileSync('scripts/agentic/verify-live-x402-country-availability-census.mjs','utf8');
  expect(script).toContain('full_census_performed: !diagnostic');expect(script).toContain('sampled_entity_count: selected.length');
 });
});
