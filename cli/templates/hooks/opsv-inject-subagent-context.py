#!/usr/bin/env python3
# OPSV-MANAGED-HOOK v1 — installed by `opsv hook install`, removed by `opsv hook uninstall`.
"""OPSV PreToolUse hook skeleton (sub-agent context injection for Task|Agent).

Contract that must hold for every version of this script:
  * read the hook payload JSON from stdin;
  * exit 0 on every path; calls with no OPSV action pass through silently
    (zero output) so unrelated tool calls stay untouched;
  * never import from or read `.trellis/` — OPSV hooks must work standalone.

The real Context-Manifest injection (permissionDecision allow + updatedInput)
lands with task A5.
"""
import json
import sys


def main() -> int:
    try:
        json.load(sys.stdin)  # payload reserved for A5
    except Exception:
        pass  # a malformed payload must never break the hook
    # Skeleton: pass-through, zero output, allow by default.
    return 0


if __name__ == "__main__":
    sys.exit(main())
