#!/usr/bin/env python3
"""Fail-closed, privacy-safe, external ingress test. GET-only; no funds, email, or secrets."""
import json
import os
import re
import sys
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

SCHEMA = "geomacro.customer-ingress-header-probe.v1"
SPOOF = "198.51.100.217"  # RFC5737 reserved test address, not a public visitor IP
HOSTS = ("https://geomacro.live", "https://geomacro.lovable.app")
EXPECTED = (os.environ.get("GEOMACRO_EXPECTED_SHA") or os.environ.get("GITHUB_SHA") or "").strip().lower()
# Reuse the user-agent of the already independently PASSed frontend acceptance.
HEADERS = {"User-Agent": "GeoMacro-frontend-acceptance/2.0",
           "Cache-Control": "no-cache", "Accept": "application/json,text/html,*/*"}


class ProbeHttpStatus(Exception):
    def __init__(self, site, stage, status):
        self.site, self.stage, self.status = site, stage, status
        super().__init__(f"{site} {stage}: HTTP_{status}")


def allowed_final_host(site, final_url):
    requested, final = urlparse(site), urlparse(final_url)
    # Lovable's alias can legitimately 301/302 to the main production hostname.
    allowed = {requested.hostname}
    if requested.hostname == "geomacro.lovable.app":
        allowed.add("geomacro.live")
    return final.scheme == "https" and final.hostname in allowed


def get_json(site, stage, path, extra_headers=None):
    url = site + path
    headers = {**HEADERS, **(extra_headers or {})}
    request = Request(url, headers=headers, method="GET")
    try:
        response = urlopen(request, timeout=20)
    except HTTPError as exc:
        # Do not expose proxy response bodies, edge diagnostic cookies or visitor IP.
        raise ProbeHttpStatus(site, stage, exc.code) from None
    with response:
        if response.status != 200:
            raise ProbeHttpStatus(site, stage, response.status)
        if not allowed_final_host(site, response.url):
            raise AssertionError(f"{site} {stage}: REDIRECT_OUTSIDE_CANONICAL_HOSTS")
        data = response.read(16385)
        if len(data) > 16384:
            raise AssertionError(f"{site} {stage}: RESPONSE_TOO_LARGE")
        if "application/json" not in response.headers.get("content-type", "").lower():
            raise AssertionError(f"{site} {stage}: NON_JSON")
        try:
            return json.loads(data)
        except ValueError:
            raise AssertionError(f"{site} {stage}: MALFORMED_JSON") from None


def verify_host(site, getter=get_json):
    marker = getter(site, "build-marker", "/.well-known/geomacro-build.json?acceptance=1")
    if (marker.get("canonical_main_sha") != EXPECTED or
            marker.get("schema_version") != "geomacro.deployment-build.v1"):
        raise AssertionError(f"{site} build-marker: FRONTEND_EXACT_SHA_MISMATCH")

    path = "/api/v1/customer/auth?edge_probe=customer-ip-v1"
    plain = getter(site, "normal-probe", path)
    if (plain.get("schema") != SCHEMA or plain.get("ok") is not True or
            plain.get("cf_connecting_ip_present") is not True or
            plain.get("no_email_or_payment_touched") is not True):
        raise AssertionError(f"{site} normal-probe: EDGE_IP_HEADER_ABSENT_OR_INVALID")

    # A verified HTTP 403 for the spoofed request (after normal-probe PASS)
    # means that this exact injection attempt was stopped before reaching SSR.
    # It is a bounded ingress assertion, not global protection for every ingress.
    spoof_blocked = False
    try:
        forged = getter(site, "spoof-probe", path, {"CF-Connecting-IP": SPOOF})
    except ProbeHttpStatus as error:
        if error.site == site and error.stage == "spoof-probe" and error.status == 403:
            spoof_blocked = True
        else:
            raise

    if not spoof_blocked:
        if (forged.get("schema") != SCHEMA or forged.get("ok") is not True or
                forged.get("no_email_or_payment_touched") is not True or
                forged.get("cf_connecting_ip_present") is not True):
            raise AssertionError(f"{site} spoof-probe: INVALID_RESPONSE")
        if forged.get("injected_cf_connecting_ip_survived") is not False:
            raise AssertionError(f"{site} spoof-probe: SPOOFED_CF_IP_SURVIVED")
        if SPOOF in json.dumps(forged):
            raise AssertionError(f"{site} spoof-probe: RAW_IP_EXPOSED")

    return {"site": site, "exact_sha_verified": True,
            "normal_edge_header_present": True,
            "spoofed_header_blocked_http403": spoof_blocked,
            "spoofed_header_overwritten": not spoof_blocked, "no_funds": True}


def run():
    if not re.fullmatch(r"[0-9a-f]{40}", EXPECTED):
        raise AssertionError("INVALID_EXPECTED_SHA")
    # Independently verify each declared production hostname (allow legitimate
    # Lovable -> custom-domain redirect only). We never read or log the actual IP.
    observations = [verify_host(site) for site in HOSTS]
    print(json.dumps({"status": "PASS", "schema": "geomacro.customer-ingress-spoof-acceptance.v2",
                      "expected_canonical_sha": EXPECTED, "observations": observations,
                      "otp_activated": False, "payment_activated": False}, indent=2))


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(json.dumps({"status": "FAIL", "reason": str(exc), "otp_activated": False,
                          "payment_activated": False}))
        sys.exit(1)
