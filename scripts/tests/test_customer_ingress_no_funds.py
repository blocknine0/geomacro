#!/usr/bin/env python3
"""Hermetic tests for the external read-only ingress acceptance; no network."""
import importlib.util
import os
import pathlib
import unittest

PATH = pathlib.Path(__file__).resolve().parents[1] / "ops" / "verify-customer-ssr-ingress-no-funds.py"
spec = importlib.util.spec_from_file_location("customer_ingress_acceptance", PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.EXPECTED = "a" * 40


class TestCustomerIngressAcceptance(unittest.TestCase):
    def setUp(self):
        self.site = "https://geomacro.live"
        self.marker = {"canonical_main_sha": "a"*40,
                       "schema_version": "geomacro.deployment-build.v1"}
        self.plain = {"ok": True, "schema": mod.SCHEMA,
                      "cf_connecting_ip_present": True,
                      "no_email_or_payment_touched": True}
        self.forged = {**self.plain,
                       "injected_cf_connecting_ip_survived": False}

    def fake(self, phase_status=None, fake_spoof=None, fake_plain=None):
        def getter(site, stage, path, headers=None):
            self.assertEqual(site, self.site)
            self.assertIn(stage, ["build-marker", "normal-probe", "spoof-probe"])
            if phase_status and phase_status[0] == stage:
                raise mod.ProbeHttpStatus(site, stage, phase_status[1])
            if stage == "build-marker":
                return self.marker
            if stage == "normal-probe":
                return self.plain if fake_plain is None else fake_plain
            self.assertEqual(headers["CF-Connecting-IP"], mod.SPOOF)
            return self.forged if fake_spoof is None else fake_spoof
        return getter

    def test_403_for_spoof_is_safe_only_after_successful_normal_probe(self):
        result = mod.verify_host(self.site, self.fake(("spoof-probe", 403)))
        self.assertTrue(result["spoofed_header_blocked_http403"])
        self.assertTrue(result["normal_edge_header_present"])

    def test_403_during_marker_is_failure_not_spoof_success(self):
        with self.assertRaisesRegex(mod.ProbeHttpStatus, "build-marker: HTTP_403"):
            mod.verify_host(self.site, self.fake(("build-marker", 403)))

    def test_403_during_normal_probe_is_failure_not_spoof_success(self):
        with self.assertRaisesRegex(mod.ProbeHttpStatus, "normal-probe: HTTP_403"):
            mod.verify_host(self.site, self.fake(("normal-probe", 403)))

    def test_403_at_spoof_stage_with_no_trusted_header_must_fail(self):
        with self.assertRaisesRegex(AssertionError, "EDGE_IP_HEADER_ABSENT_OR_INVALID"):
            mod.verify_host(self.site, self.fake(("spoof-probe", 403),
                fake_plain={**self.plain, "cf_connecting_ip_present": False}))

    def test_successful_overwrite_is_accepted(self):
        result = mod.verify_host(self.site, self.fake())
        self.assertTrue(result["spoofed_header_overwritten"])

    def test_client_control_of_header_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, "SPOOFED_CF_IP_SURVIVED"):
            mod.verify_host(self.site, self.fake(fake_spoof={
                **self.forged,"injected_cf_connecting_ip_survived": True}))

    def test_cross_domain_redirect_not_allowed(self):
        self.assertTrue(mod.allowed_final_host(
            "https://geomacro.lovable.app",
            "https://geomacro.live/api/v1/customer/auth"))
        self.assertFalse(mod.allowed_final_host(
            "https://geomacro.live", "https://evil.example/auth"))
        self.assertFalse(mod.allowed_final_host(
            "https://geomacro.live", "http://geomacro.live/auth"))

    def test_missing_or_corrupt_marker_is_rejected(self):
        self.marker = {"schema_version": "geomacro.deployment-build.v1",
                       "canonical_main_sha": "b"*40}
        with self.assertRaisesRegex(AssertionError, "FRONTEND_EXACT_SHA_MISMATCH"):
            mod.verify_host(self.site, self.fake())


if __name__ == "__main__":
    unittest.main()
