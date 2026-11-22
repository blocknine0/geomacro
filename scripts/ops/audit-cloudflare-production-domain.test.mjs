import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProductionDomainAuthority } from "./audit-cloudflare-production-domain.mjs";

const sha = "a".repeat(40);
const fixture = {
  zone: { id: "b".repeat(32), name: "geomacro.live", status: "active", name_servers: ["alpha.ns.cloudflare.com", "bravo.ns.cloudflare.com"] },
  delegatedNameservers: ["bravo.ns.cloudflare.com.", "alpha.ns.cloudflare.com."],
  customDomains: [
    { hostname: "geomacro.live", service: "geomacro-web-production", enabled: true },
    { hostname: "www.geomacro.live", service: "geomacro-web-production", enabled: true },
  ],
  routes: [],
  marker: { canonical_main_sha: sha, production_activation_performed: true },
  markerHttpStatus: 200, expectedSha: sha, wwwHttpStatus: 308,
  wwwLocation: "https://geomacro.live/",
};

test("authoritative DNS, production Worker routing, live marker, and www HTTPS are necessary", () => {
  const result = evaluateProductionDomainAuthority(fixture);
  assert.equal(result.production_hostname_cloudflare_serving_verified, true);
  assert.equal(result.complete_production_cutover_approved, false);
  assert.equal(result.cloudflare_zone.nameservers_match, true);
  assert.equal(result.routing.production_worker_binding_verified, true);
});

test("an isolated staging Worker or disabled domain can never certify production", () => {
  const staging = evaluateProductionDomainAuthority({
    ...fixture, customDomains: fixture.customDomains.map(d => ({ ...d, service: "geomacro-web-production-staging" })),
  });
  assert.equal(staging.routing.staging_worker_used_for_production, true);
  assert.equal(staging.production_hostname_cloudflare_serving_verified, false);
  const disabled = evaluateProductionDomainAuthority({
    ...fixture, customDomains: fixture.customDomains.map(d => ({ ...d, enabled: false })),
  });
  assert.equal(disabled.routing.production_worker_binding_verified, false);
  assert.equal(disabled.production_hostname_cloudflare_serving_verified, false);
});

test("missing zone, pending delegation, stale build, failed www, and no activation remain blocked", () => {
  const cases = [
    { zone: null },
    { zone: { ...fixture.zone, status: "pending" } },
    { delegatedNameservers: ["old-ns.example.com"] },
    { marker: { ...fixture.marker, canonical_main_sha: "c".repeat(40) } },
    { marker: { ...fixture.marker, production_activation_performed: false } },
    { wwwHttpStatus: 200 },
    { markerHttpStatus: 503 },
  ];
  for (const change of cases) {
    assert.equal(evaluateProductionDomainAuthority({ ...fixture, ...change }).production_hostname_cloudflare_serving_verified, false);
  }
});
