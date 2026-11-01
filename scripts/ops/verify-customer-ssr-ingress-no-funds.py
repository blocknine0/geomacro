#!/usr/bin/env python3
"""Read-only external customer SSR ingress spoof test. Never sends OTP, email, secrets or payments."""
import json
import os
import re
import sys
from urllib.parse import urlparse
from urllib.request import Request, urlopen

SCHEMA = "geomacro.customer-ingress-header-probe.v1"
SPOOF = "198.51.100.217"  # RFC 5737 TEST-NET-2, cannot be an actual public visitor IP
HOSTS = ("https://geomacro.live", "https://geomacro.lovable.app")
EXPECTED = os.environ.get("GITHUB_SHA", "").strip()
HEADERS = {"User-Agent": "Geomacro-customer-edge-probe/1.0", "Cache-Control": "no-cache"}


def get_json(url, extra_headers=None):
    headers = {**HEADERS, **(extra_headers or {})}
    request = Request(url, headers=headers)
    with urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise AssertionError("HTTP_" + str(response.status))
        if urlparse(response.url).hostname not in ("geomacro.live", "geomacro.lovable.app"):
            raise AssertionError("REDIRECT_OUTSIDE_CANONICAL_HOSTS")
        data = response.read(16385)
        if len(data) > 16384:
            raise AssertionError("OVERSIZED_PROBE_RESPONSE")
        if "application/json" not in response.headers.get("content-type", "").lower():
            raise AssertionError("NON_JSON_PROBE")
        return json.loads(data)


def run():
    if not re.fullmatch("[0-9a-f]{40}", EXPECTED):
        raise AssertionError("INVALID_EXPECTED_SHA")
    observations = []
    for site in HOSTS:
        marker = get_json(site + "/.well-known/geomacro-build.json?ingress_acceptance=1")
        if marker.get("canonical_main_sha") != EXPECTED:
            raise AssertionError(site + " FRONTEND_EXACT_SHA_MISMATCH")
        url = site + "/api/v1/customer/auth?edge_probe=customer-ip-v1"
        plain = get_json(url)
        spoofed = get_json(url, {"CF-Connecting-IP": SPOOF})
        for record in (plain, spoofed):
            if record.get("schema") != SCHEMA or record.get("ok") is not True:
                raise AssertionError(site + " CUSTOMER_INGRESS_PROBE_ROUTE_NOT_PUBLISHED")
            if record.get("no_email_or_payment_touched") is not True:
                raise AssertionError(site + " CUSTOMER_PROBE_BOUNDARY_INVALID")
            if record.get("cf_connecting_ip_present") is not True:
                raise AssertionError(site + " CUSTOMER_INGRESS_IP_HEADER_MISSING")
        if spoofed.get("injected_cf_connecting_ip_survived") is not False:
            raise AssertionError(site + " ATTACKER_SPOOFED_CF_IP_SURVIVED")
        # No exact IP addresses, private session or credentials are returned.
        if SPOOF in json.dumps(spoofed):
            raise AssertionError("RAW_IP_EXPOSED_IN_RESPONSE")
        observations.append({"site": site, "exact_sha_verified": True,
                             "legitimate_header_present": True,
                             "injected_ip_overwritten": True, "no_funds": True})
    print(json.dumps({"status": "PASS", "schema": "geomacro.customer-ingress-spoof-acceptance.v1",
                      "observations": observations, "otp_activated": False,
                      "payment_activated": False}, indent=2))


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(json.dumps({"status": "FAIL", "reason": str(exc), "otp_activated": False,
                          "payment_activated": False}))
        sys.exit(1)
