# Telegram live adapter contract

Telegram is an active source class, but channel identity and provenance are separate from message transport.

Required credentials for MTProto/public-channel ingestion:
- TELEGRAM_API_ID
- TELEGRAM_API_HASH

Optional:
- TELEGRAM_BOT_TOKEN for Bot API sources where the bot is explicitly a member/admin of the channel.

Rules:
1. Verified official channels may contribute as high-trust corroborating sources after identity verification.
2. Specialist channels may contribute as corroboration/early signal.
3. Unknown channels never become confirmed solely through repetition by other unknown channels.
4. Every message stores channel id, message id, timestamp, canonical URL when available, raw text hash and verification class.
5. Telegram never overrides an authoritative source solely because it is faster.
