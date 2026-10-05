#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildCommercialRouteInventory } from "./lib/commercial-route-inventory.mjs";

const out = process.env.COMMERCIAL_ROUTE_INVENTORY_ARTIFACT || "artifacts/commercial-route-inventory.json";
const inventory = {
  ...buildCommercialRouteInventory(process.cwd()),
  checked_at: new Date().toISOString(),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(inventory)}\n`);
