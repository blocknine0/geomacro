#!/usr/bin/env node
/**
 * Internal audit for the Geomacro global coverage contract.
 *
 * This is a structural/design audit only. It does not certify feeds, test
 * collectors, enable commercial signals, or open production payment/testing.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the internal coverage audit.",
  );
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data, error } = await db
  .from("live_global_coverage_design_status")
  .select("*")
  .single();

if (error) {
  throw error;
}

const failures = [];

if (data.domain_count !== 16) {
  failures.push(`Expected 16 required domains, got ${data.domain_count}`);
}

if (data.region_count !== 24) {
  failures.push(`Expected 24 required regional zones, got ${data.region_count}`);
}

if (data.corridor_count !== 35) {
  failures.push(`Expected 35 strategic corridors, got ${data.corridor_count}`);
}

if (data.shock_count !== 36) {
  failures.push(`Expected 36 required shock families, got ${data.shock_count}`);
}

if (data.unmapped_shock_count !== 0) {
  failures.push(`Unmapped required shock families: ${data.unmapped_shock_count}`);
}

if (data.actual_country_module_rows !== data.expected_country_module_rows) {
  failures.push(
    `Country × module matrix mismatch: expected ${data.expected_country_module_rows}, got ${data.actual_country_module_rows}`,
  );
}

if (data.actual_region_module_rows !== data.expected_region_module_rows) {
  failures.push(
    `Region × module matrix mismatch: expected ${data.expected_region_module_rows}, got ${data.actual_region_module_rows}`,
  );
}

if (data.actual_corridor_module_rows !== data.expected_corridor_module_rows) {
  failures.push(
    `Corridor × module matrix mismatch: expected ${data.expected_corridor_module_rows}, got ${data.actual_corridor_module_rows}`,
  );
}

if (data.queue_count !== data.expected_queue_rows) {
  failures.push(
    `Certification queue mismatch: expected ${data.expected_queue_rows}, got ${data.queue_count}`,
  );
}

if (data.queue_nonqueued_count !== 0) {
  failures.push(
    `Certification queue contains non-queued/unlocked records: ${data.queue_nonqueued_count}`,
  );
}

if (data.certification_gate_open !== false) {
  failures.push("Certification gate must remain closed.");
}

if (data.testing_gate_open !== false) {
  failures.push("Testing gate must remain closed.");
}

const result = {
  evaluated_at: data.evaluated_at,
  design_complete: data.design_complete === true && failures.length === 0,
  certification_gate_open: false,
  testing_gate_open: false,
  metrics: data,
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (failures.length > 0 || result.design_complete !== true) {
  process.exit(1);
}
