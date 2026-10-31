#!/usr/bin/env python3
"""Read-only public frontend smoke check. Never treats published=true as commit parity."""
import hashlib, json, os, re, sys, urllib.request
from urllib.parse import urljoin, urlparse

SITES = ["https://geomacro.live/", "https://geomacro.lovable.app/"]
HEADERS = {"User-Agent": "GeoMacro-production-frontend-acceptance/1.0", "Cache-Control": "no-cache"}
failures = []
observations = []
for site in SITES:
    try:
        url = site + "?geomacro_probe=frontend"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = resp.read(2000000)
            final_url = resp.url
            status = resp.status
            mime = resp.headers.get("Content-Type", "")
            cache = resp.headers.get("Cache-Control", "")
        if status != 200 or "html" not in mime.lower():
            failures.append(f"{site}: unexpected status/content type {status} {mime}")
        html = body.decode("utf-8", "replace")
        if not re.search(r"<html|<!doctype html", html, re.I):
            failures.append(f"{site}: missing HTML document")
        asset_links = re.findall(r'(?:src|href)=["\']([^"\']+\.(?:js|css)(?:\?[^"\']*)?)["\']', html, re.I)
        asset_checks = []
        for path in asset_links[:4]:
            asset_url = urljoin(final_url, path)
            if urlparse(asset_url).netloc not in {urlparse(site).netloc, "geomacro.live", "geomacro.lovable.app"}:
                continue
            try:
                with urllib.request.urlopen(urllib.request.Request(asset_url, headers=HEADERS), timeout=20) as asset:
                    sample = asset.read(256)
                    if asset.status != 200 or not sample:
                        failures.append(f"{site}: asset invalid {asset_url}")
                    asset_checks.append({"url": asset_url, "status": asset.status})
            except Exception as exc:
                failures.append(f"{site}: asset request failed {asset_url}: {exc}")
        observations.append({"site": site, "status": status, "final_url": final_url,
                             "html_sha256": hashlib.sha256(body).hexdigest(),
                             "html_bytes": len(body), "cache_control": cache,
                             "asset_count_in_html": len(asset_links), "sampled_assets": asset_checks})
    except Exception as exc:
        failures.append(f"{site}: {type(exc).__name__}: {exc}")

# Public HTML is frequently SSR or CDN-transformed and must not be equated with a git SHA.
# An explicit readback of the deployed Git commit is necessary for exact parity.
expected = os.environ.get("GITHUB_SHA", "")
result = {"status": "FAIL" if failures else "SMOKE_PASS_COMMIT_PARITY_UNVERIFIED",
          "expected_repository_sha": expected, "deploy_sha_verified": False,
          "observations": observations, "failures": failures}
print(json.dumps(result, indent=2))
with open(os.environ.get("GITHUB_STEP_SUMMARY", "/tmp/frontend-acceptance-summary.txt"), "a") as out:
    out.write("## GeoMacro frontend production smoke check\n\n")
    out.write(f"**Status:** {result['status']}  \n**Repository SHA:** `{expected}`  \n")
    out.write("**Exact deployed commit:** UNVERIFIED (no authoritative public build identity)\n\n")
    for item in observations:
        out.write(f"- {item['site']}: HTTP {item['status']}, HTML SHA256 `{item['html_sha256']}`, assets checked {len(item['sampled_assets'])}\n")
    for failure in failures:
        out.write(f"- FAIL: {failure}\n")
if failures:
    sys.exit(1)
