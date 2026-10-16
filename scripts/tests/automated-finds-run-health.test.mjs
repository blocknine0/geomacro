import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {automatedFindsRunHealth} from '../lib/automated-finds-run-health.mjs';
const receipt=(archive_status)=>({schema:'geomacro.automated-finds-publication-receipt.v1',
  signed_categories:3,d1_exact_readback_verified:true,independent_reviewed:false,
  scored:false,chargeable:false,archive_status,
  full_b2_readback_verified:archive_status==='CURRENT_BATCH_VERIFIED',
  exact_gzip_restore_verified:archive_status==='CURRENT_BATCH_VERIFIED'});
test('verified current D1 delivery continues under backup hold without claiming archive proof',()=>{
  for(const status of ['BACKUP_FAILED_CURRENT_D1_ONLY','BACKUP_BACKOFF_HELD']){
    const health=automatedFindsRunHealth(receipt(status));
    assert.equal(health.current_d1_publication_healthy,true);
    assert.equal(health.archive_backup_degraded,true);
    assert.equal(health.current_batch_b2_verified,false);
    assert.equal(health.commercial_eligible,false);
  }
});
test('archive cadence preserves the distinction between a prior backup and current proof',()=>{
  const held=automatedFindsRunHealth(receipt('CADENCE_HELD'));
  assert.equal(held.archive_backup_degraded,false);assert.equal(held.current_batch_b2_verified,false);
  assert.equal(automatedFindsRunHealth(receipt('CURRENT_BATCH_VERIFIED')).current_batch_b2_verified,true);
});
test('source, signature/category, D1 readback failures and invented B2 proof cannot become healthy',()=>{
  for(const delta of [{d1_exact_readback_verified:false},{signed_categories:2},
    {full_b2_readback_verified:true},{exact_gzip_restore_verified:true},
    {archive_status:'UNVERIFIED'},{chargeable:true},{scored:true},{independent_reviewed:true}]){
    assert.throws(()=>automatedFindsRunHealth({...receipt('BACKUP_BACKOFF_HELD'),...delta}),/RECEIPT_INVALID/);
  }
});
