#!/usr/bin/env node
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

function int(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function classifyRealtimeCorroborateHealth({
  httpStatus,
  body,
  transportStatus = 0,
}) {
  const status = int(httpStatus);
  const curlStatus = int(transportStatus);
  const rawBody = typeof body === "string" ? body : JSON.stringify(body ?? {});

  let json = null;
  try {
    json =
      typeof body === "string"
        ? JSON.parse(body)
        : body && typeof body === "object"
          ? body
          : null;
  } catch {
    json = null;
  }

  const message = String(json?.message ?? "");
  const error = String(json?.error ?? "");
  const text = `${rawBody}\n${message}\n${error}`.toLowerCase();

  let classification;
  let reason;
  let ok = false;
  let authenticated = null;

  if (curlStatus !== 0 || status === 0) {
    classification = "TRANSPORT_FAILURE";
    reason = `curl_exit_${curlStatus}`;
  } else if (
    text.includes("exceed_egress_quota") ||
    text.includes("service for this project is restricted")
  ) {
    classification = "SUPABASE_PROJECT_SERVICE_RESTRICTED";
    reason = text.includes("exceed_egress_quota")
      ? "exceed_egress_quota"
      : "project_service_restricted";
  } else if (
    status === 401 ||
    status === 403 ||
    error.toLowerCase() === "unauthorized"
  ) {
    classification = "OIDC_AUTHORIZATION_REJECTED";
    reason = `http_${status}`;
  } else if (status === 200 && json?.authenticated === true) {
    classification = "AUTHENTICATED_HEALTHY";
    reason = "authenticated_health_contract_passed";
    ok = true;
    authenticated = true;
  } else if (status === 200) {
    classification = "HEALTH_CONTRACT_INVALID";
    reason = "authenticated_true_missing";
    authenticated = json?.authenticated === false ? false : null;
  } else {
    classification = "REALTIME_CORROBORATION_HEALTH_FAILED";
    reason = `http_${status}`;
  }

  return {
    schema_version: "geomacro-realtime-corroborate-health-classification.v1",
    ok,
    classification,
    reason,
    http_status: status,
    transport_status: curlStatus,
    authenticated,
    fail_closed: !ok,
  };
}

function parseArgs(argv) {
  const args = {
    status: "0",
    transportStatus: "0",
    input: "",
    output: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    const value = argv[i + 1];
    if (name === "--status") {
      args.status = value ?? "0";
      i += 1;
    } else if (name === "--transport-status") {
      args.transportStatus = value ?? "0";
      i += 1;
    } else if (name === "--input") {
      args.input = value ?? "";
      i += 1;
    } else if (name === "--output") {
      args.output = value ?? "";
      i += 1;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    throw new Error("CLASSIFIER_INPUT_AND_OUTPUT_REQUIRED");
  }

  const body = await fs.readFile(args.input, "utf8");
  const result = classifyRealtimeCorroborateHealth({
    httpStatus: args.status,
    transportStatus: args.transportStatus,
    body,
  });
  const serialized = JSON.stringify(result, null, 2) + "\n";
  await fs.writeFile(args.output, serialized, "utf8");
  process.stdout.write(serialized);
  process.exitCode = result.ok ? 0 : 1;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
