#!/usr/bin/env python3
# OPSV-MANAGED-HOOK v1 — installed by `opsv hook install`, removed by `opsv hook uninstall`.
"""OPSV SessionStart hook skeleton (Pack stack + active asset summary).

Contract that must hold for every version of this script:
  * read the hook payload JSON from stdin;
  * exit 0 on every path — visibility via block content, never via exit code;
  * never import from or read `.trellis/` — OPSV hooks must work standalone.

The real Pack-stack / active-asset injection lands with task A4.
"""
import json
import sys


def main() -> int:
    try:
        json.load(sys.stdin)  # payload reserved for A4
    except Exception:
        pass  # a malformed payload must never break the hook
    print(
        "<opsv-session-context>"
        "OPSV hook installed; session context pending A4."
        "</opsv-session-context>"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
