#!/usr/bin/env python3
"""Fail-closed government OGL feed provenance and title relevance contracts.

Offline source metadata only. This test never contacts Telegram, publishers,
private D1, payment rails, websites or downstream GRO generation.
"""
import ast
import json
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
WORKER=ROOT/"workers/telegram-flash/worker.py"
EVIDENCE=ROOT/"config/official-ogl-atom-sources.json"
EXPECTED={
    "uk_fcdo_ogl_official_atom":"GEOPOLITICS",
    "uk_hmt_ogl_official_atom":"MACRO",
    "uk_dbt_ogl_minerals_atom":"CRITICAL_MINERALS",
    "uk_desnz_ogl_minerals_atom":"CRITICAL_MINERALS",
    "uk_mod_ogl_security_atom":"GEOPOLITICS",
    "uk_cabinet_ogl_security_atom":"GEOPOLITICS",
    "uk_obr_ogl_macro_atom":"MACRO",
    "uk_dft_ogl_shipping_macro_atom":"MACRO",
    "uk_bist_ogl_minerals_atom":"CRITICAL_MINERALS",
}
def get_sources_and_gate():
    tree=ast.parse(WORKER.read_text(encoding="utf-8"))
    feeds=[n.value for n in tree.body if isinstance(n,ast.AnnAssign)
           and isinstance(n.target,ast.Name) and n.target.id=="DEFAULT_RSS_FEEDS"]
    funcs=[n for n in tree.body if isinstance(n,ast.FunctionDef)
           and n.name=="feed_entry_matches_required_title"]
    if len(feeds)!=1 or len(funcs)!=1:
        raise AssertionError("OFFICIAL_OG_LICENSE_CONTRACT_MISSING")
    namespace={"re":re,"Any":object}
    exec(compile(ast.Module(body=funcs,type_ignores=[]),str(WORKER),"exec"),namespace)
    return ast.literal_eval(feeds[0]),namespace["feed_entry_matches_required_title"]

class OpenLicensedOfficialFeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.feeds,gate=get_sources_and_gate()
        cls.match=staticmethod(gate)
        cls.by_id={x["source_id"]:x for x in cls.feeds}
        cls.policy=json.loads(EVIDENCE.read_text(encoding="utf-8"))
    def test_34_feeds_and_no_registry_duplicate(self):
        self.assertEqual(len(self.feeds),34)
        self.assertEqual(len(self.by_id),len(self.feeds))
        self.assertEqual(set(EXPECTED)-set(self.by_id),set())
    def test_exact_license_provenance_and_no_telegram_impersonation(self):
        self.assertEqual(self.policy["schema"],"geomacro.official-free-atom-license-registry.v1")
        rows=self.policy["sources"]
        self.assertEqual({x["source_id"] for x in rows},set(EXPECTED))
        for row in rows:
            feed=self.by_id[row["source_id"]]
            self.assertEqual(row["category"],EXPECTED[row["source_id"]])
            self.assertTrue(feed["event_type"].startswith(row["category"]+"_"))
            self.assertEqual(row["feed_url"],feed["url"])
            self.assertEqual(row["ingest_transport"],"DIRECT_OFFICIAL_ATOM")
            self.assertFalse(row["telegram_content_license"])
            self.assertTrue(row["private_research_only"])
            self.assertEqual(row["rights_reference"],"https://www.gov.uk/help/terms-conditions")
            self.assertTrue(feed["url"].startswith("https://www.gov.uk/government/organisations/"))
            self.assertTrue(feed["url"].endswith(".atom"))
            self.assertGreaterEqual(len(feed["required_title_keywords"]),10)
    def test_geopolitics_and_macro_policy_relevant_headlines(self):
        f=self.by_id["uk_fcdo_ogl_official_atom"]
        self.assertTrue(self.match({"title":"New UK sanctions announced"},f["required_title_keywords"]))
        self.assertTrue(self.match({"title":"UK statement at the United Nations"},f["required_title_keywords"]))
        self.assertFalse(self.match({"title":"Passport renewal guidance"},f["required_title_keywords"]))
        m=self.by_id["uk_hmt_ogl_official_atom"]
        self.assertTrue(self.match({"title":"Fiscal outlook and inflation projections"},m["required_title_keywords"]))
        self.assertFalse(self.match({"title":"New child account form"},m["required_title_keywords"]))
    def test_critical_minerals_title_gate_excludes_energy_and_generic_trade(self):
        for key in ("uk_dbt_ogl_minerals_atom","uk_desnz_ogl_minerals_atom"):
            words=self.by_id[key]["required_title_keywords"]
            self.assertTrue(self.match({"title":"Critical minerals supply chain"},words))
            self.assertTrue(self.match({"title":"Lithium mining policy"},words))
            self.assertFalse(self.match({"title":"Price support for household gas bills"},words))
            self.assertFalse(self.match({"title":"Tariff-free whisky exports"},words))
            self.assertFalse(self.match({"title":"Generic press release",
                                         "summary":"Lithium mining"},words))
    def test_india_pib_official_free_reuse_mineral_source_and_native_provenance(self):
        rights=json.loads((ROOT/"config/india-pib-official-reuse-rights.json").read_text(encoding="utf-8"))
        source=self.by_id["india_pib_licensed_minerals_rss"]
        self.assertEqual(rights["schema"],"geomacro.official-india-pib-free-reuse-source.v1")
        self.assertEqual(rights["feed_url"],source["url"])
        self.assertEqual(source["event_type"],"CRITICAL_MINERALS_INDIA_OFFICIAL_RELEASE")
        self.assertEqual(source["country_iso3"],"IND")
        self.assertFalse(rights["telegram_content_authorization"])
        self.assertFalse(rights["commercial_GRO_auto_promotion"])
        self.assertEqual(rights["ingest_transport"],"FIRST_PARTY_RSS_NOT_TELEGRAM")
        self.assertIn("pib.gov.in",rights["license_reference"])
        self.assertIn("source_prominently_acknowledged",rights["license_constraints"])
        self.assertTrue(self.match(
            {"title":"NITI Aayog and TEXMiN strengthen India's Critical Minerals ecosystem"},
            source["required_title_keywords"]))
        self.assertFalse(self.match(
            {"title":"Ministry of Coal recognition awards"},
            source["required_title_keywords"]))

    def test_no_partial_word_match_or_missing_rule(self):
        self.assertFalse(self.match({"title":"Award ceremony"},["war"]))
        self.assertFalse(self.match({"title":"Central bankers speak"},[]))
        self.assertFalse(self.match({"summary":"lithium"},["lithium"]))
        self.assertTrue(self.match({"title":"Trade sanctions on lithium"},["lithium"]))
if __name__=="__main__":
    unittest.main(verbosity=2)
