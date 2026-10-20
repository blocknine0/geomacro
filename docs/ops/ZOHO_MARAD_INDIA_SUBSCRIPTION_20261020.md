# MARAD subscription → contact@geomacro.live (Zoho India)

## Status

- MARAD's subscription change confirmation shows **U.S. Maritime Alerts & Advisories** subscribed for this mailbox, and the email says the service is provided at no charge.
- Source reader / GitHub workflow already exist: `scripts/lib/zoho-maritime-subscription-mail.mjs` and `.github/workflows/free-commercial-source-lineup.yml`.
- Last verified protected-main source run (2026-10-20): `ZOHO_OAUTH_SETUP_REQUIRED`, **0 upstream calls**. A MARAD email subscription is not an OAuth grant.
- This update pins **India** data center: `https://accounts.zoho.in` for refreshing the read-only OAuth token, and `https://mail.zoho.in` for Zoho Mail REST APIs.
- Before listing messages the reader now fetches `GET /api/accounts/{accountId}` with `ZohoMail.accounts.READ` and requires **`primaryEmailAddress=contact@geomacro.live`**. A wrong mailbox ID aborts with `ZOHO_MAILBOX_IDENTITY_MISMATCH`; it cannot enumerate another mailbox.

## One-time account-owner steps (no credentials in ChatGPT, PR text or Actions logs)

1. Sign into [Zoho Mail India](https://mail.zoho.in/) as `contact@geomacro.live`.
2. From the [Zoho API Console](https://api-console.zoho.in/) create a **Self Client** (or server-based OAuth client) for the authenticated user's mailbox. Issue a consented, offline refresh token with only these **read-only** scopes:
   `ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ`.
   Use India Accounts OAuth; store the Client ID, Client Secret and Refresh Token securely.
3. Get that mailbox's Zoho account ID from `GET https://mail.zoho.in/api/accounts` and Inbox folder ID from `GET https://mail.zoho.in/api/accounts/{accountId}/folders` using the read-only OAuth token. Choose the **Inbox**, not the whole organization's other mailboxes.
4. Go to [GitHub → blocknine0/geomacro → Settings → Environments → production](https://github.com/blocknine0/geomacro/settings/environments), and set these **five environment secrets**, not repository files or workflow inputs:
   - `ZOHO_MAIL_CLIENT_ID`
   - `ZOHO_MAIL_CLIENT_SECRET`
   - `ZOHO_MAIL_REFRESH_TOKEN`
   - `ZOHO_MAIL_ACCOUNT_ID`
   - `ZOHO_MAIL_FOLDER_ID`
   Do **not** set `ZOHO_UKMTO_APPROVED_SENDER` until an actual UKMTO subscription email address has been independently verified.
5. The existing [Free Commercial Source Lineup No-Funds Rotation](https://github.com/blocknine0/geomacro/actions/workflows/free-commercial-source-lineup.yml) runs best-effort at minutes 17 and 47. You can also select **Run workflow** once after saving the secrets.
6. Check job `zoho-subscribed-maritime-candidates` and its 3-day private receipt:
   - `configured=true`, `mailbox_identity_verified=true`, `external_calls=3..6`: OAuth refresh (1), account read (1), Inbox list (1), and at most three relevant message-header reads.
   - `NO_QUALIFIED_MAIL_HEADER_CANDIDATES` is an honest outcome when no eligible alert has arrived.
   - `UNVERIFIED_OFFICIAL_MAIL_CANDIDATES` signifies bounded sender/header **discovery only**; not a verified current incident or commercial rights.

## Security and free quota

- Zoho API currently documents a **30 requests/min** API rate limit. This observer normally makes only 3 to 6 sequential calls per best-effort 30-minute run, with **zero retries on 401/403/429**.
- The configured `contact@geomacro.live` mailbox must match the account's `primaryEmailAddress`. If the mailbox is only an alias under a different primary address, verify the account structure explicitly rather than weakening the identity gate.
- Exact allowed MARAD sender `marad@info.dot.gov`. Subject route-keywords and list/header matches are **unverified leads**; retrieved email header strings do not by themselves establish DKIM, SPF or incident authenticity. No email bodies or attachments are fetched, and no raw subject, message ID or upstream body is persisted. The receipt stores hashed per-message dedupe IDs only.
- Email subscription **does not** confer a licence to commercially redistribute or sell MARAD's email text. Original event qualification and rights review must occur before Intelligence/Predge/x402 promotion; this read-only step does none of those things.
- Never change the domain's MX records to activate this reader. Zoho keeps handling the incoming mailbox. No new cron, B2, D1 or Supabase writes and no payment.
- For troubleshooting, check the job's error **code** only; never paste an OAuth refresh token, password or raw message contents in issues.

References: [Zoho data centers](https://www.zoho.com/mail/help/api/getting-started-with-api.html), [Zoho OAuth](https://www.zoho.com/mail/help/api/using-oauth-2.html), [Get account](https://www.zoho.com/mail/help/api/get-user-account-details.html), [List messages](https://www.zoho.com/mail/help/api/get-emails-list.html).
