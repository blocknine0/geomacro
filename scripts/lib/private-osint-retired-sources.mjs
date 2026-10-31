/** Production-discovered, repeatedly broken upstream feeds. This is a
 * permanent active-poll exclusion, NOT a deletion of source provenance or
 * previously acquired D1 evidence. See operational proof links below.
 *
 * Four independent *read-only* 512-endpoint probes on 2026-10-30 at
 * 18:27, 20:36, 20:39 and 20:42 UTC were reconciled. Each of the 76
 * original entries was denied, unavailable, malformed or otherwise unsupported in
 * at least three probes; no healthy native-dated item was observed from
 * any of them in those checks. The presence of an item without a fresh
 * native clock is not a healthy original-source observation.
 *
 * Evidence: Actions 41106820853, 41124471216, 41124882797,
 * 41125059189 (artifact 'geomacro-private-osint-live-coverage-*').
 * Additional 2026-10-31 PR #3268 live-probe evidence (run 41209335181)\n * classified private_priority_aus_ga_news UNAVAILABLE and\n * private_priority_iea_news DENIED; exclude both from future private polling.\n * These sources are not guaranteed irrecoverable upstream; retirement
 * means GeoMacro stops requesting them unless explicitly re-reviewed.
 */
export const PRIVATE_OSINT_RETIRED_SOURCE_IDS=Object.freeze([
  "private_priority_aus_ga_news",
  "private_priority_iea_news",
  "private_mineral_aus_industry_news",
  "private_expansion_au_industry_news",
  "private_expansion_australian_mining",
  "private_expansion_eiti_disclosures",
  "private_expansion_ind_tax_press",
  "private_expansion_kr_msit_press",
  "private_expansion_lka_cbsl_monthly_indicators",
  "private_expansion_lka_cbsl_mpr",
  "private_expansion_lka_cbsl_weekly_indicators",
  "private_expansion_mining_dot_com",
  "private_expansion_ph_pna_news",
  "private_expansion_railjournal_trade",
  "private_expansion_rotterdam_port_news",
  "private_expansion_ukr_presidential_official_original",
  "private_expansion_za_engineering_mining",
  "private_gaplane_lby_supplement",
  "private_gaplane_lie_supplement",
  "private_gaplane_lso_supplement",
  "private_gaplane_mdv_39",
  "private_gaplane_mlt_supplement",
  "private_gaplane_mrt_supplement",
  "private_gaplane_slv_first",
  "private_mesh_972_magazine",
  "private_mesh_asharq_business",
  "private_mesh_globenewswire",
  "private_mesh_indian_express",
  "private_mesh_telex",
  "private_official_ind_pib_press_reg1",
  "private_official_ind_pib_press_reg17",
  "private_official_ind_pib_press_reg20",
  "private_official_ind_pib_press_reg22",
  "private_official_ind_pib_press_reg3",
  "private_official_ind_pib_press_reg5",
  "private_official_ind_pib_press_reg6",
  "private_repo8_can_boc_release",
  "private_repo8_imf_release",
  "private_repo8_us_bea_release",
  "private_repo8_us_bls_release",
  "private_repo8_world_bank_release",
  "private_repo_0d2728a58f6f8c835917",
  "private_repo_10f600c126a7ae86b7a4",
  "private_repo_1265c67781f34c2923f3",
  "private_repo_14de982a576a6695dc9b",
  "private_repo_181bdc7358877eb37675",
  "private_repo_186095b924a2d3734ee9",
  "private_repo_2b135d7e3141a081c5de",
  "private_repo_33f7c53450e1f4cbb2a9",
  "private_repo_36b01fc3862e59bb6ce9",
  "private_repo_43dfda49275421da921b",
  "private_repo_495fb809304a18dccd31",
  "private_repo_542bbdb1197cf101dca6",
  "private_repo_6036bc3dab2910295e6d",
  "private_repo_612d078555600e2a6ec2",
  "private_repo_646ac9c1bc26f1428396",
  "private_repo_6918af838ee2f35ca0fc",
  "private_repo_6aa1e4af7a62927e7b19",
  "private_repo_721cb94a49e3095c4db8",
  "private_repo_792f8d4602eb8b5ccbda",
  "private_repo_84850b16dc1b790fba3a",
  "private_repo_8736ceb46aeec23a920d",
  "private_repo_880f91cf53cf8409316f",
  "private_repo_90ee54d79aea77d887b3",
  "private_repo_930b7931d57552089aa4",
  "private_repo_b77e7e6da0ae1adbfe86",
  "private_repo_ba8e6c6b93f4c54be8a2",
  "private_repo_c0e362d98f2c0106d6f7",
  "private_repo_c214be2423bdab7edf97",
  "private_repo_ca51fd6f836e645279d9",
  "private_repo_ce0d4980296ca1e29183",
  "private_repo_dd0a62d6489a311b3141",
  "private_repo_e456bbc65e773899eff2",
  "private_repo_e5c89686bb9ee6afca6d",
  "private_repo_f201d116e0b87ec2b67e",
  "private_repo_f797a1c11e607df50db5",
  "private_repo_fa6c1368c29f2804562a",
  "private_repo_fbc25e62574de37ef437",
  "private_repo_fd5d456f26c3f0816603"
]);
const RETIRED=new Set(PRIVATE_OSINT_RETIRED_SOURCE_IDS);
if(RETIRED.size!==PRIVATE_OSINT_RETIRED_SOURCE_IDS.length ||
   PRIVATE_OSINT_RETIRED_SOURCE_IDS.some(x=>!/^private_[a-z0-9_]+$/u.test(x)))
  throw Error("PRIVATE_OSINT_RETIRED_MANIFEST_INVALID");
export const isRetiredPrivateOsintSource=source=>
  typeof source?.id==="string"&&RETIRED.has(source.id);
