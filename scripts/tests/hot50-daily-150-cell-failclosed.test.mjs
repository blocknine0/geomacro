import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeHot50DailyRows} from '../ops/audit-hot50-risk-stream-daily.mjs';
const countries=JSON.parse(readFileSync(new URL('../../config/hot-50-three-domain-watch.v1.json',import.meta.url),'utf8')).country_iso3;
test('all 150 Hot50 cells appear even when no source is signed or billable',()=>{
 const r=summarizeHot50DailyRows([],{day:'2026-11-18',countries});
 assert.equal(r.hot50_daily_150_cell_matrix.expected_cells,150);
 assert.equal(r.hot50_daily_150_cell_matrix.observed_cells,150);
 assert.equal(r.hot50_daily_150_cell_matrix.no_signed_observation_cells,150);
 assert.equal(r.hot50_daily_150_cell_matrix.commercial_ready_cells_unproven,150);
 assert.deepEqual(new Set(r.hot50_daily_150_cell_matrix.cells.map(c=>c.category)),
  new Set(['GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS']));
 assert.equal(new Set(r.hot50_daily_150_cell_matrix.cells.map(c=>c.country_iso3)).size,50);
 assert.ok(r.hot50_daily_150_cell_matrix.cells.every(c=>c.billable_readiness_verified===false));
});
test('even a signed GRO count cannot be marketed as approved source or Standard',()=>{
 const r=summarizeHot50DailyRows([
  {kind:'hot50_country_category',dimension:'GEOPOLITICS',country_iso3:countries[0],count:3},
  {kind:'paid_tier',dimension:'standard',count:0},
 ],{day:'2026-11-18',countries});
 assert.equal(r.hot50_daily_150_cell_matrix.signed_observation_cells,1);
 assert.equal(r.hot50_daily_150_cell_matrix.no_signed_observation_cells,149);
 assert.equal(r.hot50_daily_150_cell_matrix.commercial_ready_cells_unproven,150);
 assert.ok(r.hot50_daily_150_cell_matrix.cells[0].status.startsWith('SIGNED_OBSERVATION'));
 assert.equal(r.hot50_daily_150_cell_matrix.cells[0].commercial_rights_approved,false);
 assert.equal(r.hot50_daily_150_cell_matrix.cells[0].independent_corroboration_verified,false);
});
