// The free derived-news D1 delivery and its governed B2 backup are separate
// health dimensions. Never turn an archive outage into a false B2 proof.
export function automatedFindsRunHealth(receipt) {
  const statuses=new Set(['CURRENT_BATCH_VERIFIED','CADENCE_HELD',
    'BACKUP_FAILED_CURRENT_D1_ONLY','BACKUP_BACKOFF_HELD']);
  if(receipt?.schema!=='geomacro.automated-finds-publication-receipt.v1'||
     receipt.signed_categories!==3||receipt.d1_exact_readback_verified!==true||
     receipt.independent_reviewed!==false||receipt.scored!==false||receipt.chargeable!==false||
     !statuses.has(receipt.archive_status)||
     receipt.full_b2_readback_verified!==(receipt.archive_status==='CURRENT_BATCH_VERIFIED')||
     receipt.exact_gzip_restore_verified!==receipt.full_b2_readback_verified)
    throw Error('AUTOMATED_FINDS_RUN_RECEIPT_INVALID');
  return {current_d1_publication_healthy:true,
    archive_backup_degraded:['BACKUP_FAILED_CURRENT_D1_ONLY','BACKUP_BACKOFF_HELD'].includes(receipt.archive_status),
    archive_status:receipt.archive_status,current_batch_b2_verified:receipt.full_b2_readback_verified,
    commercial_eligible:false};
}
