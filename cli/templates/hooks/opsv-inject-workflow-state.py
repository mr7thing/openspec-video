#!/usr/bin/env python3
# OPSV-MANAGED-HOOK v1 — installed by `opsv hook install`, removed by `opsv hook uninstall`.
"""OPSV UserPromptSubmit hook (A3): per-turn NextAction breadcrumb.

Runs on every user prompt. Resolves the active OPSV Asset and emits a short
<opsv-workflow-state> block (asset / status / nextAction.kind / derived
command / issue codes) as additionalContext, so the current production step
is visible every turn — including blocked states and their issue codes.

Contract that must hold for every version of this script:
  * exit 0 on EVERY path — visibility travels in block content, never in the
    exit code (UserPromptSubmit exit 2 would block the user's prompt);
  * standalone: never import from or read the `.trellis/` directory — only
    `.opsv/`, `videospec/` and the `opsv` CLI;
  * single self-contained file (install copies this file verbatim);
  * NextAction data comes from `opsv work context <asset> --role
    production-dispatcher --json` — never recomputed here (the CLI/Core is
    the single source of truth; the rendered command is a derived display).

Active asset resolution order:
  1. `.opsv/runtime/active-asset` (written by the SessionStart hook, A4);
  2. first production asset from `opsv work next --json`;
  3. otherwise a visible "Refer to `opsv work next`" line (never silent).

Latency: the per-turn budget target is ~300ms; stage A calls the CLI, so each
CLI call is capped by OPSV_WORKFLOW_STATE_CLI_TIMEOUT_MS (default 2000ms).
On CLI timeout/failure a visible "state unknown ... opsv work check" line is
emitted instead of passing silently. (B4 switches to projection reads.)

Silent exit 0 with no output happens only when no `.opsv/project.yaml` is
found walking up from the payload cwd — i.e. this is not an OPSV project.
"""
from __future__ import annotations

import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Optional

# Force UTF-8 on stdin/stdout/stderr on Windows (borrowed from the Trellis
# hook): host CLIs there default to cp936/cp1252 and non-ASCII payload or
# block content would raise Unicode errors.
if sys.platform.startswith("win"):
    import io as _io
    for _stream_name in ("stdin", "stdout", "stderr"):
        _stream = getattr(sys, _stream_name, None)
        if _stream is None:
            continue
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
            except Exception:
                pass  # Optional Windows stream setup; keep hook startup non-fatal.
        elif hasattr(_stream, "detach"):
            try:
                setattr(sys, _stream_name, _io.TextIOWrapper(_stream.detach(), encoding="utf-8", errors="replace"))
            except Exception:
                pass  # Optional Windows stream setup; keep hook startup non-fatal.

# Context role fixed by Core (WORK_CONTEXT_ROLES); dispatcher is the role
# that advances produce/run, so its manifest is the per-turn source.
CONTEXT_ROLE = "production-dispatcher"

# Per-CLI-call cap. Stage A shells out to the CLI; override via env for tests
# or slow machines. The ~300ms per-turn budget is met when B4 lands and this
# hook reads projections instead of calling the CLI.
DEFAULT_CLI_TIMEOUT_MS = 2000
CLI_TIMEOUT_ENV = "OPSV_WORKFLOW_STATE_CLI_TIMEOUT_MS"

# Optional explicit path to the opsv CLI (tests / non-PATH installs).
CLI_PATH_ENV = "OPSV_CLI"

ACTIVE_ASSET_FILE = os.path.join(".opsv", "runtime", "active-asset")


# ---------------------------------------------------------------------------
# Hook input (Trellis discipline: never trust the host to close stdin)
# ---------------------------------------------------------------------------

def _load_hook_input() -> dict:
    """Read hook JSON with a short deadline.

    Some hook runners leave stdin open while sending no payload; a plain
    json.load(sys.stdin) would block forever. Normal runners write the full
    payload and close stdin, so the short daemon read preserves that path
    while failing closed to {} for non-piping hosts.
    """
    result_queue: "queue.Queue[str | Exception]" = queue.Queue(maxsize=1)

    def _read() -> None:
        try:
            result_queue.put(sys.stdin.read())
        except Exception as exc:
            result_queue.put(exc)

    reader = threading.Thread(target=_read, daemon=True)
    reader.start()
    try:
        raw = result_queue.get(timeout=0.2)
    except queue.Empty:
        return {}

    if isinstance(raw, Exception):
        return {}
    try:
        data = json.loads(raw) if raw.strip() else {}
    except (json.JSONDecodeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


# ---------------------------------------------------------------------------
# Project root + active asset resolution
# ---------------------------------------------------------------------------

def find_project_root(start: Path) -> Optional[Path]:
    """Walk up from start to find the directory containing .opsv/project.yaml.

    Handles cwd drift (subdirectory launches). Returns None when this is not
    an OPSV project — the only silent path of this hook.
    """
    try:
        cur = start.resolve()
    except OSError:
        return None
    while True:
        if (cur / ".opsv" / "project.yaml").is_file():
            return cur
        if cur == cur.parent:
            return None
        cur = cur.parent


def _cli_timeout_seconds() -> float:
    raw = os.environ.get(CLI_TIMEOUT_ENV, "")
    try:
        ms = int(raw)
    except (TypeError, ValueError):
        ms = DEFAULT_CLI_TIMEOUT_MS
    return max(ms, 50) / 1000.0


def _resolve_cli() -> Optional[str]:
    override = os.environ.get(CLI_PATH_ENV)
    if override:
        return override
    return shutil.which("opsv")


def _run_opsv_json(cli: str, args: list[str], cwd: Path) -> Optional[dict]:
    """Run `opsv <args>` and parse stdout as JSON. None on any failure.

    Failure here is never fatal to the hook — the caller renders the visible
    "state unknown" line instead.
    """
    try:
        proc = subprocess.run(
            [cli, *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=_cli_timeout_seconds(),
        )
    except Exception:
        return None  # timeout, spawn failure, encoding error, ...
    if proc.returncode != 0:
        return None
    try:
        data = json.loads(proc.stdout)
    except (json.JSONDecodeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _read_active_asset(root: Path) -> Optional[str]:
    """Read the A4-written active asset pointer, if present and non-empty."""
    try:
        content = (root / ACTIVE_ASSET_FILE).read_text(encoding="utf-8")
    except OSError:
        return None
    token = content.strip().split()[0] if content.strip() else ""
    return token.lstrip("@") or None


def _resolve_asset(cli: str, root: Path) -> tuple[Optional[str], bool]:
    """Return (asset, cli_failed).

    cli_failed=True means the CLI could not answer `work next` — the caller
    renders "state unknown" instead of the no-asset line.
    """
    pinned = _read_active_asset(root)
    if pinned:
        return pinned, False
    groups = _run_opsv_json(cli, ["work", "next", "--json"], root)
    if groups is None:
        return None, True
    production = groups.get("production")
    if isinstance(production, list) and production:
        first = production[0]
        if isinstance(first, dict) and isinstance(first.get("asset"), str):
            return first["asset"], False
    return None, False


# ---------------------------------------------------------------------------
# Status display: read the asset document frontmatter directly (cheap, and
# `work context` deliberately omits frontmatter status from the manifest).
# ---------------------------------------------------------------------------

_VIDEOSPEC_DIR_RE = re.compile(r"^\s*videospec:\s*[\"']?([^\s\"']+)", re.MULTILINE)
_FRONTMATTER_STATUS_RE = re.compile(r"^status:\s*[\"']?([A-Za-z0-9_-]+)", re.MULTILINE)


def _videospec_dir(root: Path) -> Path:
    """Locate videospec/ from project config (settings.dirs.videospec)."""
    try:
        raw = (root / ".opsv" / "api_config.yaml").read_text(encoding="utf-8")
    except OSError:
        raw = ""
    match = _VIDEOSPEC_DIR_RE.search(raw)
    if match:
        candidate = Path(match.group(1))
        return candidate if candidate.is_absolute() else root / candidate
    return root / "videospec"


def _read_asset_status(root: Path, asset: str) -> str:
    base = _videospec_dir(root)
    if not base.is_dir():
        return "unknown"
    names = {f"{asset}.md", f"@{asset}.md"}
    try:
        for dirpath, _dirnames, filenames in os.walk(base):
            for name in filenames:
                if name in names:
                    try:
                        text = Path(dirpath, name).read_text(encoding="utf-8", errors="replace")
                    except OSError:
                        return "unknown"
                    if text.startswith("---"):
                        end = text.find("\n---", 3)
                        header = text[3:end] if end != -1 else text[3:]
                        match = _FRONTMATTER_STATUS_RE.search(header)
                        if match:
                            return match.group(1)
                    return "drafting"  # WorkPacket default for missing status
    except OSError:
        return "unknown"
    return "unknown"


# ---------------------------------------------------------------------------
# Breadcrumb rendering (command mirrors renderNextActionCommand — display only)
# ---------------------------------------------------------------------------

def _render_command(action: dict) -> Optional[str]:
    kind = action.get("kind")
    asset = action.get("asset", "")
    if kind == "materialize":
        return f"opsv materialize {asset}"
    if kind == "circle":
        return f"opsv circle create --dir {action.get('sourceDir', '')}"
    if kind == "compile":
        return f"opsv produce --manifest {action.get('manifest', '')} --file {asset}"
    if kind == "sync":
        return f"opsv sync {asset}"
    return None  # draft / blocked have no CLI form


def _issue_codes(manifest: dict, action: Optional[dict]) -> list[str]:
    codes: list[str] = []
    if action and action.get("kind") == "blocked":
        raw = action.get("issueCodes")
        if isinstance(raw, list):
            codes.extend(str(code) for code in raw)
    issues = manifest.get("issues")
    if isinstance(issues, list):
        for issue in issues:
            if isinstance(issue, dict) and isinstance(issue.get("code"), str):
                codes.append(issue["code"])
    seen: set[str] = set()
    unique: list[str] = []
    for code in codes:
        if code not in seen:
            seen.add(code)
            unique.append(code)
    return unique


def build_block(root: Path, manifest: dict) -> str:
    asset = str(manifest.get("asset", "?"))
    status = _read_asset_status(root, asset)
    action = manifest.get("nextAction")
    action = action if isinstance(action, dict) else None
    kind = str(action.get("kind")) if action and action.get("kind") else "unknown"

    lines = ["<opsv-workflow-state>"]
    lines.append(f"Asset: {asset} (status: {status})")
    lines.append(f"NextAction: {kind}")
    if action and kind == "draft" and action.get("skill"):
        lines.append(f"Skill: {action['skill']} (draft; no CLI command)")
    command = _render_command(action) if action else None
    if command:
        lines.append(f"Command: {command}")
    codes = _issue_codes(manifest, action)
    if codes:
        lines.append(f"Issues: {', '.join(codes)}")
    lines.append("</opsv-workflow-state>")
    return "\n".join(lines)


def _no_asset_block() -> str:
    return (
        "<opsv-workflow-state>\n"
        "No active OPSV asset. Refer to `opsv work next`.\n"
        "</opsv-workflow-state>"
    )


def _unknown_block(reason: str) -> str:
    return (
        "<opsv-workflow-state>\n"
        f"OPSV workflow state unknown ({reason}). Run `opsv work check` for details.\n"
        "</opsv-workflow-state>"
    )


def _emit(block: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": block,
        }
    }))


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------

def main() -> int:
    if os.environ.get("OPSV_HOOKS") == "0" or os.environ.get("OPSV_DISABLE_HOOKS") == "1":
        return 0

    data = _load_hook_input()
    cwd = Path(data.get("cwd") or os.getcwd())

    root = find_project_root(cwd)
    if root is None:
        return 0  # not an OPSV project — silent by design

    cli = _resolve_cli()
    if not cli:
        _emit(_unknown_block("opsv CLI not found on PATH"))
        return 0

    asset, cli_failed = _resolve_asset(cli, root)
    if asset is None:
        _emit(_unknown_block("opsv work next failed or timed out") if cli_failed else _no_asset_block())
        return 0

    manifest = _run_opsv_json(cli, ["work", "context", asset, "--role", CONTEXT_ROLE, "--json"], root)
    if manifest is None:
        _emit(_unknown_block(f"opsv work context {asset} failed or timed out"))
        return 0

    _emit(build_block(root, manifest))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Breadcrumb semantics: nothing this hook does may block the prompt.
        sys.exit(0)
