# Zoho Mail: UKMTO + MARAD official subscription intake

Both official subscriptions were initiated/confirmed by the owner on 2026-10-20. Email receiving address uses Zoho Mail. **Subscription ≠ approved downstream commercial rights, specific incident confirmation, or proof of first delivered UKMTO alert.**

## Why this integration

- Geomacro GitHub runners received 403 on MARAD's official RSS and a UKMTO access denial. Do not bypass provider site restrictions.
- Zoho publishes an official OAuth read-only Mail API. **Use ZohoMail.messages.READ**, not mailbox password or IMAP forwarding (Zoho new Free plan may not support forwarding/IMAP).
- The existing 30-minute `Free Commercial Source Lineup No-Funds Rotation` GitHub workflow now has an **independent mailbox read-only** job. It makes only an OAuth refresh POST, a 20-message limited folder list GET, and up to three header GETs. No message-content API or attachments. This produces private, short-lived *unverified lead metadata only*.
- A configured mailbox can contain unrelated mail. Only exact sender `marad@info.dot.gov` or an explicitly configured **UKMTO approved sender observed from a real alert** is even considered. An attacker may spoof From and retrieved headers; these items remain `publisher_authentication_verified=false` unless separately authenticated in a trusted MIME verification pipeline.

## Owner one-time setup (never paste secrets into issue/comment/chat)

1. In [Zoho API Console](https://api-console.zoho.com/) create a Self Client or secure server-side OAuth client. Grant `ZohoMail.messages.READ` only, request offline access and get its refresh token. Zoho documents account, folder and message APIs; retrieve accountId/folderId with Zoho's account/folders read permissions during one-time setup, then keep only message READ for routine polling where possible.
2. In GitHub repo **Settings → Environments → production → Environment secrets**, configure `ZOHO_MAIL_CLIENT_ID`, `ZOHO_MAIL_CLIENT_SECRET`, `ZOHO_MAIL_REFRESH_TOKEN`, `ZOHO_MAIL_ACCOUNT_ID`, `ZOHO_MAIL_FOLDER_ID`. The last two are numerical identifiers, not mailbox email addresses.
3. Under **Environment variables**, set `ZOHO_MAIL_REGION` to `in` (India) **only if** Zoho's browser hostname is `mail.zoho.in`; otherwise `us`, `eu`, `au` or `jp` as appropriate. OAuth and mail requests are pinned to the corresponding documented region host.
4. MARAD From is confirmed from the owner screenshot as `marad@info.dot.gov`. For UKMTO, wait for **one genuine approved alert** and set `ZOHO_UKMTO_APPROVED_SENDER` to the exact address shown in its source header. Do not guess sender domains.
5. If possible, create a Zoho Mail filter routing official MARAD/UKMTO subscriptions into a dedicated folder; confirm that folder ID in the API. Filters may be available without outbound forwarding. For a mixed inbox, the code matches the exact source sender and inspects only candidate headers. The same folder can host both senders.

## Fail-closed outcomes

- Missing credentials: `ZOHO_OAUTH_SETUP_REQUIRED` (no outbound requests).
- Authentication/transport denial: `UPSTREAM_NOT_VERIFIED`, job fails.
- Successful mailbox read with no messages: `NO_QUALIFIED_MAIL_HEADER_CANDIDATES` (valid transport, **zero official alerts proven**).
- First matching mail with inspected From and Date: `UNVERIFIED_OFFICIAL_MAIL_CANDIDATES`. This is not an authenticated publisher signature, verified attack, active advisory, or paid news story.
- No output contains raw mail body, subject, email address, URL, or provider message ID. A stable SHA256 digest of the message ID is retained for private idempotent *candidate correlation*, not an externally shareable proof. Artifacts retained for 3 days, no B2/D1/Supabase writes.
- No signed GRO, GRI scoring, x402 charge, email-based commercial redistribution, website publication or Predge partner resale. Those require a subsequent publisher authentication, original-source qualification and commercial rights gate.

## References

Official Zoho documentation:
- https://www.zoho.com/mail/help/api/using-oauth-2.html
- https://www.zoho.com/mail/help/api/get-emails-list.html
- https://www.zoho.com/mail/help/api/get-email-header.html
- https://www.zoho.com/mail/help/api/getting-started-with-api.html

**Acceptance:** `node --test scripts/tests/zoho-maritime-subscription-mail.test.mjs`, then code checks / CodeQL. After merge, exact `main` production `zoho-subscribed-maritime-candidates` job proves configured mailbox transport only when secrets are actually installed. A subscription confirmation screenshot is not a live email pipeline test.
