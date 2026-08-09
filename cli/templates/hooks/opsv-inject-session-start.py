#!/usr/bin/env python3
# OPSV-MANAGED-HOOK v1 — installed by `opsv hook install`, removed by `opsv hook uninstall`.
"""OPSV SessionStart hook: inject Pack stack + active asset summary.

Contract that must hold for every version of this script:
  * read the hook payload JSON from stdin (bounded wait, never block forever);
  * exit 0 on every path — visibility via block content, never via exit code;
  * never import from or read `.trellis/` — OPSV hooks must work standalone;
  * single-file self-contained (installed by plain copy), stdlib only.

Output protocol: Claude Code SessionStart —
  {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ...}}

Side effect: writes the first clean production asset id to
`.opsv/runtime/active-asset` so the UserPromptSubmit breadcrumb hook
(opsv-inject-workflow-state.py) can resolve the active asset without a scan.
`.opsv/runtime/` is volatile state; a write failure is surfaced as a visible
line in the block, never as a non-zero exit.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys

# Per-call ceiling for any `opsv` CLI invocation. SessionStart must not drag
# session boot; every call degrades to a visible line on timeout/failure.
CLI_TIMEOUT_SECONDS = 2.0
# Bounded wait for the hook payload on stdin.
STDIN_TIMEOUT_SECONDS = 2.0
# How many assets to list per work-next group before folding into a count.
MAX_ASSETS_PER_GROUP = 5


def _read_payload() -> dict:
    """Read the hook payload JSON from stdin with a bounded wait."""
    try:
        raw = ""
        if os.name == "posix":
            import select

            ready, _, _ = select.select([sys.stdin], [], [], STDIN_TIMEOUT_SECONDS)
            if ready:
                raw = sys.stdin.read()
        else:
            raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _find_project_root(start: str) -> str | None:
    """Walk up from `start` looking for `.opsv/project.yaml`."""
    try:
        current = os.path.realpath(start)
    except OSError:
        return None
    if os.path.isfile(current):
        current = os.path.dirname(current)
    while True:
        if os.path.isfile(os.path.join(current, ".opsv", "project.yaml")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def _run_opsv(project_root: str, args: list) -> tuple:
    """Run the opsv CLI with a hard timeout.

    Returns (ok, stdout_or_error). The CLI is resolved via the OPSV_CLI env
    override first (used by tests / non-PATH installs), then PATH lookup.
    """
    cli = os.environ.get("OPSV_CLI") or shutil.which("opsv")
    if not cli:
        return False, "opsv CLI not found on PATH"
    try:
        result = subprocess.run(
            [cli, *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=CLI_TIMEOUT_SECONDS,
            cwd=project_root,
        )
    except subprocess.TimeoutExpired:
        return False, f"timed out after {CLI_TIMEOUT_SECONDS}s"
    except (FileNotFoundError, PermissionError, OSError) as exc:
        return False, str(exc)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip().splitlines()
        return False, detail[0] if detail else f"exit {result.returncode}"
    return True, result.stdout


def _parse_pack_lock(project_root: str) -> list | None:
    """Extract (id, version) pairs from `.opsv/pack-lock.yaml`.

    Deliberately a tolerant line scan, not a YAML parse: the hook ships
    stdlib-only and only needs id/version for display. Works for both lock
    schema v1 and v2 since both carry `id:` / `version:` per pack entry.
    Returns None when the lock file is missing or yields no entries.
    """
    lock_path = os.path.join(project_root, ".opsv", "pack-lock.yaml")
    try:
        with open(lock_path, "r", encoding="utf-8", errors="replace") as handle:
            lines = handle.read().splitlines()
    except OSError:
        return None
    entries: list = []
    current: dict | None = None
    for line in lines:
        id_match = re.match(r"^\s*-\s*id:\s*(\S+)\s*$", line)
        if id_match:
            current = {"id": id_match.group(1), "version": None}
            entries.append(current)
            continue
        if current is not None and current["version"] is None:
            version_match = re.match(r"^\s+version:\s*(\S+)\s*$", line)
            if version_match:
                current["version"] = version_match.group(1)
    packs = [(e["id"], e["version"] or "?") for e in entries]
    return packs or None


def _collect_pack_stack(project_root: str) -> list:
    """Pack stack lines: prefer the lock file, fall back to `opsv pack list`."""
    locked = _parse_pack_lock(project_root)
    if locked:
        lines = [f"- {pid}@{version}" for pid, version in locked]
        lines.append("(source: .opsv/pack-lock.yaml)")
        return lines
    ok, out = _run_opsv(project_root, ["pack", "list"])
    if ok:
        packs = []
        for line in out.splitlines():
            match = re.match(r"^(\S+)@(\S+)\s", line.strip())
            if match:
                packs.append(f"- {match.group(1)}@{match.group(2)}")
        if packs:
            packs.append("(source: opsv pack list; no pack-lock.yaml — run `opsv pack lock`)")
            return packs
        return ["- (no Packs declared in .opsv/project.yaml)"]
    return [f"- unavailable (opsv pack list failed: {out}). Run `opsv pack list` manually."]


def _render_packet(packet: dict) -> str:
    asset = packet.get("asset", "?")
    next_action = packet.get("nextAction") or {}
    kind = next_action.get("kind")
    if kind == "blocked":
        codes = next_action.get("issueCodes") or [i.get("code") for i in packet.get("issues", []) if i.get("code")]
        return f"- {asset} -> blocked [{', '.join(codes) or 'UNKNOWN'}]"
    if kind:
        return f"- {asset} -> {kind}"
    derived = packet.get("command") or packet.get("action")
    if derived:
        return f"- {asset} -> {derived}"
    return f"- {asset} -> (no next action)"


def _collect_active_assets(project_root: str) -> tuple:
    """Summarize `opsv work next --json` groups.

    Returns (lines, first_production_asset_id_or_None).
    """
    ok, out = _run_opsv(project_root, ["work", "next", "--json"])
    if not ok:
        return [f"Active assets: unknown (opsv work next failed: {out}). See `opsv work next`."], None
    try:
        groups = json.loads(out)
    except json.JSONDecodeError:
        return ["Active assets: unknown (opsv work next returned non-JSON). See `opsv work next`."], None

    lines: list = []
    first_production: str | None = None
    for name in ("production", "workflow", "blocked"):
        packets = groups.get(name) or []
        lines.append(f"{name} ({len(packets)}):")
        if not packets:
            lines.append("- (none)")
            continue
        for packet in packets[:MAX_ASSETS_PER_GROUP]:
            lines.append(_render_packet(packet))
        if len(packets) > MAX_ASSETS_PER_GROUP:
            lines.append(f"- ... and {len(packets) - MAX_ASSETS_PER_GROUP} more")
        if name == "production" and packets:
            first = packets[0].get("asset")
            if isinstance(first, str) and first:
                first_production = first
    return lines, first_production


def _write_active_asset(project_root: str, asset_id: str) -> str | None:
    """Persist the active asset id for the breadcrumb hook. Returns an error
    string on failure (non-fatal; `.opsv/runtime/` is volatile state)."""
    runtime_dir = os.path.join(project_root, ".opsv", "runtime")
    try:
        os.makedirs(runtime_dir, exist_ok=True)
        with open(os.path.join(runtime_dir, "active-asset"), "w", encoding="utf-8") as handle:
            handle.write(asset_id + "\n")
    except OSError as exc:
        return str(exc)
    return None


def _bootstrap_status(project_root: str) -> str:
    bootstrap_dir = os.path.join(project_root, ".opsv", "bootstrap")
    if os.path.isdir(bootstrap_dir):
        return "Bootstrap: .opsv/bootstrap/ present."
    return (
        "Bootstrap: .opsv/bootstrap/ not generated yet (created by `opsv bootstrap`, phase C). "
        "Until then, Pack guidance = read the Pack SKILL.md directly. Non-blocking."
    )


def _build_context(project_root: str) -> str:
    lines: list = ["<opsv-session-context>"]
    lines.append("OPSV session context (standalone; no Trellis dependency).")
    lines.append("")
    lines.append("Pack stack:")
    lines.extend(_collect_pack_stack(project_root))
    lines.append("")
    asset_lines, first_production = _collect_active_assets(project_root)
    lines.append("Active assets (opsv work next):")
    lines.extend(asset_lines)
    lines.append("")
    lines.append(_bootstrap_status(project_root))
    if first_production:
        error = _write_active_asset(project_root, first_production)
        if error:
            lines.append(
                f"Active asset: {first_production} (WARNING: could not write .opsv/runtime/active-asset: {error}; "
                "breadcrumb hook will fall back to `opsv work next`)"
            )
        else:
            lines.append(f"Active asset: {first_production} (written to .opsv/runtime/active-asset)")
    else:
        lines.append("Active asset: none (no clean production assets). See `opsv work next`.")
    lines.append("</opsv-session-context>")
    return "\n".join(lines)


def main() -> int:
    payload = _read_payload()
    start = (
        os.environ.get("CLAUDE_PROJECT_DIR")
        or payload.get("cwd")
        or os.getcwd()
    )
    project_root = _find_project_root(str(start))
    if not project_root:
        context = (
            "<opsv-session-context>\n"
            f"No OPSV project found from {start} (no .opsv/project.yaml upward). "
            "Run `opsv init` to adopt OPSV here, or ignore this line in non-OPSV projects.\n"
            "</opsv-session-context>"
        )
    else:
        context = _build_context(project_root)
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "SessionStart",
                    "additionalContext": context,
                }
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Last-resort guard: a hook must never break session start.
        sys.exit(0)
