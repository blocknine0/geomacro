import os

from telethon.sync import TelegramClient
from telethon.sessions import StringSession


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


api_id = int(require_env("TELEGRAM_API_ID"))
api_hash = require_env("TELEGRAM_API_HASH")

print("This helper logs into your Telegram account locally and creates a StringSession.")
print("Never commit the resulting session string. Store it as a deployment secret named TELEGRAM_SESSION.")

with TelegramClient(StringSession(), api_id, api_hash) as client:
    session = client.session.save()

print("\nTELEGRAM_SESSION=\n")
print(session)
