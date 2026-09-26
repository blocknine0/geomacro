import json


PROJECT_REF = "ldpwajisioljyjtojvfx"


def main() -> None:
    # Public Telegram channel search/scraping is intentionally disabled in
    # production. Telegram-origin intelligence may enter Geomacro only through
    # the publisher-authorized push/bot/webhook path with explicit, revocable
    # authorization recorded for the exact channel/content scope.
    print(
        json.dumps(
            {
                "ok": True,
                "status": "DISABLED_BY_POLICY",
                "public_telegram_discovery": False,
                "publisher_authorized_feed_only": True,
                "candidates_discovered": 0,
                "auto_enable": False,
                "project_ref": PROJECT_REF,
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
