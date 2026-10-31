#!/usr/bin/env python3
"""Fail-closed public deployment acceptance. No credentials, writes or payments."""
import hashlib
import json
import os
import re
import sys
import urllib.request
from urllib.parse import urljoin, urlparse

EXPECTED = os.environ.get("GITHUB_SHA", "").strip().lower()
SITES = ("https://geomacro.live", "https://geomacro.lovable.app")
HEADERS = {"User-Agent": "GeoMacro-frontend-acceptance/2.0", "Cache-Control": "no-cache", "Accept": "application/json,text/html,*/*"}
SHA = re.compile(r"^[0-9a-f]{40}$")
failures, observations = [], []

def get(url, limit=2000000):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as response:
        body = response.read(limit + 1)
        if len(body) > limit:
            raise ValueError("response exceeds size limit")
        return body, response.status, response.headers.get("Content-Type", ""), response.url

def allowed_final_host(requested_site, final_url):
    parsed = urlparse(final_url)
    requested = urlparse(requested_site).hostname
    # Lovable custom domains intentionally redirect the lovable.app alias to geomacro.live.
    # This is a single published deployment, not two independent deployment attestations.
    allowed = {requested} if requested == "geomacro.live" else {requested, "geomacro.live"}
    return parsed.scheme == "https" and parsed.hostname in allowed

if not SHA.fullmatch(EXPECTED):
    failures.append("GITHUB_SHA is missing or not an exact 40-character commit SHA")

for site in SITES:
    record = {"site": site, "build_sha": None, "root_status": None, "pricing_status": None}
    try:
        raw, status, content_type, final_url = get(site + "/.well-known/geomacro-build.json?acceptance=1", 16384)
        doc = json.loads(raw)
        marker = str(doc.get("canonical_main_sha", "")).lower()
        if (status != 200 or "json" not in content_type.lower() or
            doc.get("schema_version") != "geomacro.deployment-build.v1" or
            doc.get("canonical_repository") != "blocknine0/geomacro" or
            not SHA.fullmatch(marker) or
            doc.get("production_activation_performed") is not False):
            failures.append(f"{site}: invalid canonical deployment identity document")
        elif marker != EXPECTED:
            failures.append(f"{site}: deployed SHA {marker} does not match exact main SHA {EXPECTED}")
        record["build_sha"] = marker
        if not allowed_final_host(site, final_url):
            failures.append(f"{site}: build marker redirected to another host")
    except Exception as exc:
        failures.append(f"{site}: build marker unavailable/invalid: {type(exc).__name__}: {exc}")

    for path, field in (("/", "root_status"), ("/pricing", "pricing_status")):
        try:
            body, status, mime, final_url = get(site + path + "?acceptance=1")
            record[field] = status
            html = body.decode("utf-8", "replace")
            if status != 200 or "html" not in mime.lower() or not re.search(r"<html|<!doctype html", html, re.I):
                failures.append(f"{site}{path}: invalid HTML response status={status}")
            if not allowed_final_host(site, final_url):
                failures.append(f"{site}{path}: unexpected cross-domain redirect")
            if path == "/pricing":
                # Check server-rendered public copy without assuming payment is live.
                for text in ("Starter", "Pro Analyst", "Business Pilot"):
                    if text not in html:
                        failures.append(f"{site}/pricing: SSR missing {text}")
            else:
                assets = re.findall(r'(?:src|href)=["\']([^"\']+\.(?:js|css)(?:\?[^"\']*)?)["\']', html, re.I)
                if not assets:
                    failures.append(f"{site}: no linked JS/CSS assets found in HTML")
                for path_ref in assets[:4]:
                    asset_url = urljoin(final_url, path_ref)
                    if urlparse(asset_url).hostname != urlparse(site).hostname:
                        continue
                    try:
                        payload, asset_status, _, _ = get(asset_url, 3000000)
                        if asset_status != 200 or not payload:
                            failures.append(f"{site}: asset failed {asset_url}")
                    except Exception as exc:
                        failures.append(f"{site}: asset unreadable {asset_url}: {exc}")
            record[field + "_sha256"] = hashlib.sha256(body).hexdigest()
        except Exception as exc:
            failures.append(f"{site}{path}: {type(exc).__name__}: {exc}")
    observations.append(record)

if len(observations) == 2 and observations[0]["build_sha"] != observations[1]["build_sha"]:
    failures.append("custom domain and Lovable origin advertise different canonical SHA")

result = {"status": "FAIL" if failures else "PASS", "expected_canonical_sha": EXPECTED,
          "exact_sha_verified": not failures, "observations": observations, "failures": failures}
print(json.dumps(result, indent=2))
summary = os.environ.get("GITHUB_STEP_SUMMARY", "/tmp/geomacro-frontend-acceptance.md")
with open(summary, "a", encoding="utf-8") as output:
    output.write("## Production frontend exact-SHA acceptance\n\n")
    output.write(f"**Result: {result['status']}** · Expected main: `{EXPECTED}`\n\n")
    for entry in observations:
        output.write(f"- {entry['site']}: marker `{entry['build_sha']}`; home {entry['root_status']}; pricing {entry['pricing_status']}\n")
    for issue in failures:
        output.write(f"- FAIL: {issue}\n")
sys.exit(1 if failures else 0)
