#!/usr/bin/env python3
# OPSV-MANAGED-HOOK v1 — installed by `opsv hook install`, removed by `opsv hook uninstall`.
"""OPSV UserPromptSubmit hook (A3 + B4): per-turn NextAction breadcrumb.

Runs on every user prompt. Emits a short <opsv-workflow-state> block as
additionalContext, so the current production step is visible every turn —
including blocked states and their issue codes. The block always names its
source: `Source: execution` (state-machine projection) or `Source: disk`
(on-demand disk derivation); fallback between them is NEVER silent.

Contract that must hold for every version of this script:
  * exit 0 on EVERY path — visibility travels in block content, never in the
    exit code (UserPromptSubmit exit 2 would block the user's prompt);
  * standalone: never import from or read the `.trellis/` directory — only
    `.opsv/`, `videospec/` and the `opsv` CLI;
  * single self-contained file (install copies this file verbatim);
  * NextAction data comes from Core, never recomputed here — either the
    execution projection (`.opsv/execution/<id>/ready-actions.json`,
    persisted by `opsv exec status/next/resume` from computeReadyActions,
    whose asset-level kinds come from buildNextAction) or `opsv work context
    <asset> --role production-dispatcher --json`.

Source resolution order (B4):
  1. Active execution projection (Source: execution): pure file reads of
     `.opsv/execution/<id>/{ready-actions.json,state.json,events.jsonl}` —
     no CLI call, which is how the ~300ms per-turn budget is met. A missing /
     corrupt / stale projection (seq mismatch against the events.jsonl tail)
     degrades VISIBLY: a Note line names the reason and the disk path below
     answers instead.
  2. Disk derivation via the CLI (Source: disk) — the original A3 path:
     a. `.opsv/runtime/active-asset` (written by the SessionStart hook, A4);
     b. first production asset from `opsv work next --json`;
     c. otherwise a visible "Refer to `opsv work next`" line (never silent).

Latency: the per-turn budget target is ~300ms. The execution-projection path
only reads files (events.jsonl is tail-read with a bounded window). The disk
fallback shells out to the CLI; each call is capped by
OPSV_WORKFLOW_STATE_CLI_TIMEOUT_MS (default 2000ms). On CLI timeout/failure a
visible "state unknown ... opsv work check" line is emitted instead of
passing silently.

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

# Per-CLI-call cap. Only the disk fallback shells out to the CLI; the
# execution-projection path (B4) reads files and meets the ~300ms budget.
DEFAULT_CLI_TIMEOUT_MS = 2000
CLI_TIMEOUT_ENV = "OPSV_WORKFLOW_STATE_CLI_TIMEOUT_MS"

# Optional explicit path to the opsv CLI (tests / non-PATH installs).
CLI_PATH_ENV = "OPSV_CLI"

ACTIVE_ASSET_FILE = os.path.join(".opsv", "runtime", "active-asset")

# B4: execution projection layout (see cli/src/core/execution/paths.ts).
EXECUTION_ROOT = os.path.join(".opsv", "execution")
READY_ACTIONS_FILE = "ready-actions.json"
STATE_FILE = "state.json"
EVENTS_FILE = "events.jsonl"
# Execution statuses that count as "active"; terminal executions let the
# disk path answer (Source: disk, no degradation note).
ACTIVE_EXECUTION_STATUSES = {"planning", "running", "blocked"}
# Bounded tail-read window for events.jsonl (source of truth seq check).
_TAIL_READ_BYTES = 256 * 1024


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
# B4: execution projection source (.opsv/execution/<id>/)
#
# When an active Execution exists, the breadcrumb reads the ReadyActionSet
# projection persisted by `opsv exec status/next/resume` (ready-actions.json)
# cross-checked against state.json and the events.jsonl tail seq — pure file
# reads, no CLI call. Asset-level kinds inside the projection come from
# buildNextAction via computeReadyActions, so Core stays the single source
# of truth. Every failure here is a VISIBLE degradation (the caller adds a
# Note line) with fallback to the disk path — never silent.
# ---------------------------------------------------------------------------

def _read_json_object(path: Path) -> Optional[dict]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _events_tail_seq(events_file: Path) -> Optional[int]:
    """Last committed seq from the source of truth. None when unreadable.

    Bounded tail read (per-turn cost stays flat as the log grows); trailing
    unparseable lines (torn writes) are skipped, matching EventStore.
    """
    try:
        size = events_file.stat().st_size
        with events_file.open("rb") as handle:
            if size > _TAIL_READ_BYTES:
                handle.seek(-_TAIL_READ_BYTES, os.SEEK_END)
            text = handle.read().decode("utf-8", errors="replace")
    except OSError:
        return None
    # Scanning from the end makes a partial first line (mid-line seek start)
    # harmless.
    for line in reversed(text.split("\n")):
        line = line.strip()
        if not line:
            continue
        try:
            raw = json.loads(line)
        except ValueError:
            continue  # torn tail write; skip
        if isinstance(raw, dict) and isinstance(raw.get("seq"), int):
            return raw["seq"]
        return None  # a well-formed event always carries an int seq → corrupt
    return 0


def _find_execution_dir(root: Path) -> tuple[Optional[Path], Optional[str]]:
    """The single initialized execution dir, or a degradation reason.

    (None, None) means there is no execution at all — the plain disk path,
    no note. Mirrors `opsv exec` resolution: multiple executions are
    ambiguous without --id, so the projection source cannot be chosen.
    """
    exec_root = root / EXECUTION_ROOT
    if not exec_root.is_dir():
        return None, None
    try:
        ids = sorted(
            entry.name
            for entry in os.scandir(exec_root)
            if entry.is_dir() and (exec_root / entry.name / EVENTS_FILE).is_file()
        )
    except OSError:
        return None, "cannot list .opsv/execution/"
    if not ids:
        return None, None
    if len(ids) > 1:
        return None, f"multiple executions exist ({', '.join(ids)}); the projection source is ambiguous without --id"
    return exec_root / ids[0], None


def _format_projection_action(action: dict) -> str:
    """Mirror of exec.ts formatAction — these lines must read exactly like
    `opsv exec next` output."""
    parts = [str(action.get("kind", "?"))]
    for key, label in (("assetId", "asset"), ("stageId", "stage"), ("stepId", "step")):
        value = action.get(key)
        if value:
            parts.append(f"{label}={value}")
    attempt = action.get("attempt")
    if isinstance(attempt, int) and not isinstance(attempt, bool):
        parts.append(f"attempt={attempt}")
    reason = action.get("reason")
    if reason:
        parts.append(f"({reason})")
    return " ".join(parts)


def _projection_command(action: dict) -> Optional[str]:
    """CLI forms derivable from projection fields alone. circle/compile/draft
    need manifest/sourceDir/skill, which the ReadyActionSet deliberately does
    not carry — those get an explicit Note instead of an invented command."""
    kind = action.get("kind")
    asset = action.get("assetId")
    if kind == "materialize" and asset:
        return f"opsv materialize {asset}"
    if kind == "sync" and asset:
        return f"opsv sync {asset}"
    if kind == "start_execution":
        return "opsv exec start"
    if kind == "complete_execution":
        return "opsv exec complete"
    return None


def _render_execution_block(execution_id: str, projection: dict) -> str:
    status = str(projection.get("status", "unknown"))
    last_seq = projection.get("lastSeq")
    ready = [a for a in projection.get("ready") or [] if isinstance(a, dict)]
    blocked = [a for a in projection.get("blocked") or [] if isinstance(a, dict)]
    in_flight = [a for a in projection.get("inFlight") or [] if isinstance(a, dict)]

    lines = ["<opsv-workflow-state>"]
    lines.append("Source: execution")
    lines.append(f"Execution: {execution_id} (status: {status}, seq {last_seq})")
    lines.append(f"Ready: {len(ready)}  Blocked: {len(blocked)}  In-flight: {len(in_flight)}")

    if ready:
        first = ready[0]
        kind = str(first.get("kind", "?"))
        lines.append(f"NextAction: {kind}")
        command = _projection_command(first)
        if command:
            lines.append(f"Command: {command}")
        elif kind in ("circle", "compile", "draft"):
            # Difference from the disk source, annotated explicitly: the
            # derived command/skill is a display of buildNextAction detail
            # the projection does not carry.
            asset = first.get("assetId", "?")
            lines.append(
                f"Note: derived command/skill for '{kind}' is not part of the execution "
                f"projection; run `opsv work context {asset} --role {CONTEXT_ROLE}` for it"
            )
        elif kind not in ("materialize", "sync"):
            lines.append(f"Note: '{kind}' is an execution-domain action, not an asset NextAction kind")
    elif blocked:
        lines.append("NextAction: blocked")
    elif in_flight:
        lines.append("NextAction: confirm in-flight work (run `opsv exec resume`)")
    else:
        lines.append("NextAction: none")

    for action in ready:
        lines.append(f"  [ready] {_format_projection_action(action)}")
    for action in blocked:
        lines.append(f"  [blocked] {_format_projection_action(action)}")
    for action in in_flight:
        lines.append(f"  [in-flight] {_format_projection_action(action)}")
    lines.append("</opsv-workflow-state>")
    return "\n".join(lines)


def _execution_block(root: Path) -> tuple[Optional[str], Optional[str]]:
    """Render from the execution projection, or explain why not.

    (block, None)   — fresh projection rendered (Source: execution);
    (None, None)    — no ACTIVE execution: plain disk path, no note;
    (None, reason)  — active execution but projection unusable: the caller
                      falls back to the disk path and surfaces this reason.
    """
    exec_dir, reason = _find_execution_dir(root)
    if exec_dir is None:
        return None, reason

    execution_id = exec_dir.name
    ready = _read_json_object(exec_dir / READY_ACTIONS_FILE)
    state = _read_json_object(exec_dir / STATE_FILE)

    # A terminal execution is not active; the disk path answers from here on.
    status = (ready or state or {}).get("status")
    if status is not None and status not in ACTIVE_EXECUTION_STATUSES:
        return None, None
    if ready is None and state is None:
        # Cannot even tell whether this execution is active — degrade
        # visibly rather than guessing.
        return None, f"execution '{execution_id}' has no readable projection (state.json/ready-actions.json missing or corrupt)"
    if state is None:
        return None, f"execution '{execution_id}' state.json missing or corrupt; run `opsv exec status` to rebuild it"
    if ready is None:
        return None, f"execution '{execution_id}' ready-actions.json missing or corrupt; run `opsv exec status` to rebuild it"

    tail = _events_tail_seq(exec_dir / EVENTS_FILE)
    state_seq = state.get("lastSeq")
    ready_seq = ready.get("lastSeq")
    if tail is None:
        return None, f"execution '{execution_id}' events.jsonl unreadable or corrupt"
    if state_seq != tail:
        return None, f"execution '{execution_id}' state.json out of sync with events.jsonl (seq {state_seq} vs {tail}); run `opsv exec status`"
    if ready_seq != tail:
        return None, f"execution '{execution_id}' ready-actions.json stale (seq {ready_seq} vs events seq {tail}); run `opsv exec status`"

    return _render_execution_block(execution_id, ready), None


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


def build_block(root: Path, manifest: dict, note: Optional[str] = None) -> str:
    asset = str(manifest.get("asset", "?"))
    status = _read_asset_status(root, asset)
    action = manifest.get("nextAction")
    action = action if isinstance(action, dict) else None
    kind = str(action.get("kind")) if action and action.get("kind") else "unknown"

    lines = ["<opsv-workflow-state>"]
    lines.append("Source: disk")
    if note:
        lines.append(f"Note: {note}")
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


def _no_asset_block(note: Optional[str] = None) -> str:
    lines = ["<opsv-workflow-state>", "Source: disk"]
    if note:
        lines.append(f"Note: {note}")
    lines.append("No active OPSV asset. Refer to `opsv work next`.")
    lines.append("</opsv-workflow-state>")
    return "\n".join(lines)


def _unknown_block(reason: str, note: Optional[str] = None) -> str:
    lines = ["<opsv-workflow-state>"]
    if note:
        lines.append(f"Note: {note}")
    lines.append(f"OPSV workflow state unknown ({reason}). Run `opsv work check` for details.")
    lines.append("</opsv-workflow-state>")
    return "\n".join(lines)


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

    # B4: prefer the execution projection (file reads only, no CLI call).
    block, degrade = _execution_block(root)
    if block is not None:
        _emit(block)
        return 0
    note = (
        f"execution projection unavailable ({degrade}); falling back to disk-derived state"
        if degrade
        else None
    )

    cli = _resolve_cli()
    if not cli:
        _emit(_unknown_block("opsv CLI not found on PATH", note))
        return 0

    asset, cli_failed = _resolve_asset(cli, root)
    if asset is None:
        _emit(_unknown_block("opsv work next failed or timed out", note) if cli_failed else _no_asset_block(note))
        return 0

    manifest = _run_opsv_json(cli, ["work", "context", asset, "--role", CONTEXT_ROLE, "--json"], root)
    if manifest is None:
        _emit(_unknown_block(f"opsv work context {asset} failed or timed out", note))
        return 0

    _emit(build_block(root, manifest, note))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Breadcrumb semantics: nothing this hook does may block the prompt.
        sys.exit(0)
