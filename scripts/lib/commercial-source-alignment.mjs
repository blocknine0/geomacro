function count(value, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`COMMERCIAL_SOURCE_ALIGNMENT_${label}_INVALID:${String(value)}`);
  }
  return n;
}

export function validateCommercialSourceAlignment(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("COMMERCIAL_SOURCE_ALIGNMENT_ROW_REQUIRED");
  }

  const sourceCount = count(row.source_count, "SOURCE_COUNT");
  const certificationRecordCount = count(row.certification_record_count, "CERTIFICATION_RECORD_COUNT");
  const incompleteInventoryMetadataRows = count(
    row.incomplete_inventory_metadata_rows,
    "INCOMPLETE_INVENTORY_METADATA_ROWS",
  );
  const implicitLifecycleRows = count(row.implicit_lifecycle_rows, "IMPLICIT_LIFECYCLE_ROWS");
  const unreviewedRightsRows = count(row.unreviewed_rights_rows, "UNREVIEWED_RIGHTS_ROWS");
  const activeUntestedRows = count(row.active_untested_rows, "ACTIVE_UNTESTED_ROWS");
  const ingestionEnabledRows = count(row.ingestion_enabled_rows, "INGESTION_ENABLED_ROWS");
  const commercialSignalRows = count(row.commercial_signal_rows, "COMMERCIAL_SIGNAL_ROWS");
  const unsafeCommercialSignalRows = count(
    row.unsafe_commercial_signal_rows,
    "UNSAFE_COMMERCIAL_SIGNAL_ROWS",
  );
  const explicitQuarantinedInventoryRows = count(
    row.explicit_quarantined_inventory_rows,
    "EXPLICIT_QUARANTINED_INVENTORY_ROWS",
  );

  if (sourceCount === 0) throw new Error("COMMERCIAL_SOURCE_ALIGNMENT_EMPTY_INVENTORY");
  if (sourceCount !== certificationRecordCount) {
    throw new Error(
      `COMMERCIAL_SOURCE_ALIGNMENT_CERTIFICATION_COVERAGE_GAP:${certificationRecordCount}/${sourceCount}`,
    );
  }
  if (incompleteInventoryMetadataRows !== 0) {
    throw new Error(
      `COMMERCIAL_SOURCE_ALIGNMENT_INCOMPLETE_METADATA:${incompleteInventoryMetadataRows}`,
    );
  }
  if (implicitLifecycleRows !== 0) {
    throw new Error(`COMMERCIAL_SOURCE_ALIGNMENT_IMPLICIT_LIFECYCLE:${implicitLifecycleRows}`);
  }
  if (unreviewedRightsRows !== 0) {
    throw new Error(`COMMERCIAL_SOURCE_ALIGNMENT_UNREVIEWED_RIGHTS:${unreviewedRightsRows}`);
  }
  if (activeUntestedRows !== 0) {
    throw new Error(`COMMERCIAL_SOURCE_ALIGNMENT_ACTIVE_UNTESTED:${activeUntestedRows}`);
  }
  if (unsafeCommercialSignalRows !== 0) {
    throw new Error(
      `COMMERCIAL_SOURCE_ALIGNMENT_UNSAFE_COMMERCIAL_SIGNAL:${unsafeCommercialSignalRows}`,
    );
  }
  if (row.commercial_source_alignment_complete !== true) {
    throw new Error("COMMERCIAL_SOURCE_ALIGNMENT_DATABASE_GATE_NOT_COMPLETE");
  }

  return {
    ok: true,
    source_count: sourceCount,
    certification_record_count: certificationRecordCount,
    incomplete_inventory_metadata_rows: incompleteInventoryMetadataRows,
    implicit_lifecycle_rows: implicitLifecycleRows,
    unreviewed_rights_rows: unreviewedRightsRows,
    active_untested_rows: activeUntestedRows,
    ingestion_enabled_rows: ingestionEnabledRows,
    commercial_signal_rows: commercialSignalRows,
    unsafe_commercial_signal_rows: unsafeCommercialSignalRows,
    explicit_quarantined_inventory_rows: explicitQuarantinedInventoryRows,
    noncommercial_inventory_may_remain_quarantined: true,
    paid_signal_requires_full_certification: true,
  };
}
