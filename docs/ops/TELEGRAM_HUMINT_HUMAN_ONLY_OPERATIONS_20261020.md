# Geomacro Telegram HUMINT: human-led research, no Telegram AI/scraper

Owner decision 2026-10-20: Telegram is a **human intelligence lead source**, NOT AI-generated intelligence. This workflow has NO always-on computer on the owner's laptop, no paid subscription, no mass Telegram channel harvest, and no automatic claim that 152 candidate channel identities have authorization.

## Intended practice

1. A real authorized human analyst opens Telegram in the official client as a normal user, notices a relevant geopolitical, macro/FX or critical-minerals claim and manually determines whether it merits review. Respect access limits, privacy, deletion, copyright and channel rules. **Do not use MTProto automated bulk reads, AI processing of Telegram messages, a web scraper, or a bot that silently indexes third-party channels.**
2. The analyst registers a private hash pointer, exact country/topic selection and accurate claimed publisher/observation times using the existing manually observed `geomacro.telegram-human-research-lead.v1` contract. It has NO raw post body, private user details, channel handle, screenshot, Telegram URL, session, OTP or API key. Keep the reference privately, outside GitHub. The pointer is an analyst assertion, not a verified Telegram source.
3. On a trusted owner's machine run the existing offline private packet creator:
   `node scripts/build-telegram-manual-research-review.mjs --input /private/manual-review-input.json --output /private/geomacro-review-packet.json`
   See `docs/TELEGRAM_INTERNAL_RESEARCH_HANDOFF.md`. The operator must populate real metadata; fixture values must NEVER be treated as actual observations. The script neither contacts Telegram nor any AI provider and prints no reference contents.
4. A **different human fact-checker** finds genuine independently issued publisher-original HTTPS pages (official government, central bank, geological survey, customs, company statutory release as applicable), confirms actual original publication clocks, same event, country/category, competing corrections and applicability. Two websites that copy the same agency are ONE original, not two independent origins.
5. A qualified editor decides whether anything is accurate enough for Geomacro's own *derived, written* analytical finding. Separately obtain and check the original-source commercial derived-use licence and whatever existing Facts/Rights/GRO/GRI approvals that purchased capability requires. Under an incompatible no-attribution licence do not charge for third-party-derived content. Any raw Telegram post must stay out of the commercial product.
6. Current Geomacro pipeline treats this input as `TELEGRAM_HUMAN_REFERENCE_PENDING_OFFICIAL_ORIGINAL_REVIEW`; it is **NOT** automatically converted into a signed GRO, current GRI, published website article or x402 quote. Use the actual canonical qualified original-source pipeline only after its existing proofs pass. No human analyst can safely invent independently verified facts or signatures.

## Who does what when laptop is OFF

- **Human analysts:** ordinary Telegram app on their own mobile/desktop, when available. There is no claim of an around-the-clock workforce or 20-minute automatic Telegram capture. An assigned rotating editorial duty would be a *real human staffing decision*, not a GitHub automation.
- **GitHub Actions (cloud):** existing official-source RSS/Atom and news publisher checks continue unattended. The main Telegram registry (152 candidates) is NOT 152 authorized channels. Existing scheduled Telegram B2/D1 consumer drains only real pending, explicitly authorized producer leads, and a successful empty queue is not an activated producer.
- **Cloudflare/D1:** holds only existing verified derived research/publication state under its quota rules; original Telegram messages are not uploaded through manual handoff.
- **Optional publisher opt-in bot:** only after an actual channel owner deliberately grants bot access, Telegram platform terms and their own rights/consent permit the exact use, the bot receives only necessary user-volunteered material. Review deletion/withdrawal and scope. Store token and webhook verification secret ONLY in a protected deployment store; no free mass-harvest bot. Bot submission remains UNVERIFIED until independently corroborated from official publisher originals. It must NEVER be marked production-active simply because a bot token exists.

## What the owner must do (once and when a lead arrives)

1. Assign at least ONE real editor and an independent fact-checker; share written topical/country scope and no-post-copy policy. If the owner alone performs both duties, do not claim independent review.
2. Use the official Telegram app as a normal human reader. The existing private repo 152-source discovery registry is only a reading shortlist, not publisher permission or live collection. Each source must be genuine, legally accessible and appropriate before its information informs research.
3. Keep the hashed pointer and official-evidence review packet in a protected local path (Windows protected NTFS folder / UNIX 0700/0600), outside the Git checkout. Never forward account login, SMS/2FA code, API hash, session or a raw post to ChatGPT/Actions or customer.
4. Run the existing manual review helper; the reviewer fact-checks on real official originals and makes an actual editorial approval. Assign country ISO3 and category from verified official claims, not the Telegram channel name.
5. Review optional publisher-operated non-Telegram RSS/Atom/HTTPS push from the SAME issuer for automation. Original official publisher feeds avoid the general Telegram platform collection/AI-rights problem; they may still impose own commercial licence restrictions.
6. For actual publisher-consented bot intake, complete **separate** lawful platform-content licence/consent review, channel admin invitation, webhook protection, scoped production secrets, real privacy-readback and revocation test. Until then Telegram automatic authorization remains OFF. No automatic `YES` setting or invented authorization.

## Legal and technical distinctions

Human use of a Telegram client is NOT the same as API collection, but it is still subject to Telegram's ToS, content licensing and privacy rules. Current Telegram Content Licensing Terms limit broad use and explicitly ban scraped/harvested/aggregated platform data for AI model work; Bot Developer terms restrict mass scraping and permit necessary user-volunteered content with explicit revocable consent. Merely renaming bot scraping as 'human intelligence' does not authorize it. Human reading **and independently sourcing the public facts elsewhere** is the safest initial model.

Official sources:
- https://telegram.org/tos/content-licensing
- https://core.telegram.org/api/terms
- https://telegram.org/tos/bot-developers
- https://www.beehive.govt.nz/feeds
- https://www.wto.org/english/res_e/webcas_e/rss_e.htm

## Proof checkpoints (all must be authentic)

`manual_humint_input_recorded`, `official_original_independently_verified`, `editor_approved`, `commercial_derived_use_rights_verified`, `verified_derived_publication`, `payment_receipt_verified` are six DIFFERENT facts. None may be inferred from a successful cron, candidate registry, human observation or private research packet.

Live Telegram authorization verdict at writing: **OFF** (no actually authorized channel receipts verified). Human-led offline research path: implemented and available on the owner's machine. Production original-source RSS and existing Web Intelligence: separate free cloud-side sources.

## Owner-provided file input, distinct from the human-reference path

An owner's manual Telegram Desktop public-chat JSON export can now
produce source-neutral, **UNVERIFIED_CLAIM** private derived research
under `OWNER_DECLARED_TELEGRAM_DERIVED_ONLY`.
This does not authorize bulk collection or automatically establish
publisher/platform consent, verified facts, signed indices or paid quote
eligibility. The pre-existing human evidence-review path is unchanged.
