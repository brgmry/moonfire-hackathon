"""Container entrypoint: python /app/sandbox/main.py (or python sandbox/main.py locally)."""
import asyncio
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import events  # noqa: E402
import keys  # noqa: E402
import orchestrator  # noqa: E402


def main() -> int:
    try:
        keys.load()
        asyncio.run(orchestrator.run())
    except Exception:
        traceback.print_exc()
    finally:
        events.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
