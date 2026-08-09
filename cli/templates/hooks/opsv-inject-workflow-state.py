#!/usr/bin/env python3
# OPSV-MANAGED-HOOK v1 — installed by `opsv hook install`, removed by `opsv hook uninstall`.
"""OPSV UserPromptSubmit hook skeleton (per-turn NextAction breadcrumb).

Contract that must hold for every version of this script:
  * read the hook payload JSON from stdin;
  * exit 0 on every path — visibility via block content, never via exit code
    (UserPromptSubmit exit 2 would block the user's prompt);
  * never import from or read `.trellis/` — OPSV hooks must work standalone.

The real NextAction breadcrumb injection lands with task A3.
"""
import json
import sys


def main() -> int:
    try:
        json.load(sys.stdin)  # payload reserved for A3
    except Exception:
        pass  # a malformed payload must never break the hook
    print(
        "<opsv-workflow-state>"
        "OPSV hook installed; workflow-state context pending A3."
        "</opsv-workflow-state>"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
