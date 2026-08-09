#!/usr/bin/env python3
# OPSV-MANAGED-HOOK v1 — installed by `opsv hook install`, removed by `opsv hook uninstall`.
"""OPSV PreToolUse hook: sub-agent Context Manifest injection for Task|Agent.

When a sub-agent dispatch targets an OPSV production action (the real command
surface `opsv produce|run|circle|materialize|iterate|approve|sync`) or an
explicit asset reference, this hook materializes the Context Manifest via
`opsv work context <asset> --role <role> --json` and appends it to the
sub-agent prompt (Document Contract + Approved References + Pack guidance),
bounded by the byte budgets borrowed from Trellis (32KB per inlined file,
128KB total; over-budget content degrades to a reference path line).

Contract that must hold for every version of this script:
  * read the hook payload JSON from stdin;
  * exit 0 on every path; calls with no OPSV action pass through silently
    (zero output) so unrelated tool calls stay untouched;
  * injection failures degrade to a visible `systemMessage` warn and let the
    original call proceed — a hook must never block a dispatch;
  * never import from or read `.trellis/` — OPSV hooks must work standalone;
  * prompt rewrite is append-only (`prompt + injected block`) so this hook
    composes with other PreToolUse rewriters (e.g. Trellis) without
    overwriting their injected content.
"""
import json
import os
import re
import shutil
import subprocess
import sys

# Hook hosts send UTF-8 JSON regardless of the process locale.
_stdin_reconfigure = getattr(sys.stdin, "reconfigure", None)
if callable(_stdin_reconfigure):
    try:
        _stdin_reconfigure(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        pass

if sys.platform.startswith("win"):
    _stdout_reconfigure = getattr(sys.stdout, "reconfigure", None)
    if callable(_stdout_reconfigure):
        try:
            _stdout_reconfigure(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            pass

# =============================================================================
# Context Injection Budgets (borrowed from Trellis inject-subagent-context.py)
# =============================================================================

DEFAULT_MAX_FILE_BYTES = 32768
DEFAULT_MAX_TOTAL_BYTES = 131072

CLI_TIMEOUT_SECONDS = 20
HOOK_NAME = "opsv-inject-subagent-context"

# Real OPSV command surface. `compile` is deliberately absent: it is a
# NextAction kind, not a CLI command.
OPSV_ACTIONS = ("produce", "run", "circle", "materialize", "iterate", "approve", "sync")
ACTION_RE = re.compile(r"\bopsv\s+(?P<action>" + "|".join(OPSV_ACTIONS) + r")\b")

# Action -> Context Manifest role (stage-A fixed four-tuple).
ROLE_BY_ACTION = {
    "produce": "production-dispatcher",
    "run": "production-dispatcher",
    "circle": "production-dispatcher",
    "approve": "asset-quality-reviewer",
    "materialize": "document-author",
    "iterate": "document-author",
    "sync": "document-author",
}
DEFAULT_ROLE = "document-author"  # explicit asset reference with no action

ASSET_ID = r"[A-Za-z0-9][A-Za-z0-9_.-]*"
VIDEOSPEC_RE = re.compile(r"videospec/[\w./-]*?/(" + ASSET_ID + r")\.md\b")
ASSET_WORD_RE = re.compile(
    r"\basset\b[\s:=]*[<\"'`]?(" + ASSET_ID + r")[>\"'`]?", re.IGNORECASE
)
# External ref syntax: @id or @id:variant. `@:key` (design ref) and
# `@FRAME:` (frame directive) are not asset references.
EXTERNAL_REF_RE = re.compile(r"@((?!FRAME:)[A-Za-z0-9][A-Za-z0-9_-]*)(?::[A-Za-z0-9][\w-]*)?")

# Placeholders that look like asset ids but are template noise.
ASSET_ID_BLACKLIST = {"asset", "id", "name"}


def _string(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def detect_action(prompt: str) -> str:
    match = ACTION_RE.search(prompt)
    return match.group("action") if match else ""


def extract_asset(prompt: str) -> str:
    """First explicit asset reference wins: videospec path, `asset <id>`
    phrase, then external @-ref."""
    match = VIDEOSPEC_RE.search(prompt)
    if match:
        return match.group(1)
    match = ASSET_WORD_RE.search(prompt)
    if match and match.group(1).lower() not in ASSET_ID_BLACKLIST:
        return match.group(1)
    match = EXTERNAL_REF_RE.search(prompt)
    if match:
        return match.group(1)
    return ""


def resolve_cli() -> str:
    override = _string(os.environ.get("OPSV_CLI"))
    if override:
        if os.path.isfile(override) and os.access(override, os.X_OK):
            return override
        return ""
    return shutil.which("opsv") or ""


def _truncate_utf8(text: str, cap: int) -> str:
    data = text.encode("utf-8")
    if len(data) <= cap:
        return text
    return data[:cap].decode("utf-8", errors="ignore")


def _document_contract_section(manifest: dict) -> tuple:
    """Return (inline_json, oversized_line). Exactly one is non-None when a
    documentContract exists; both are None when it is absent (degraded
    manifest — the issue list already says why)."""
    contract = manifest.get("documentContract")
    if not isinstance(contract, dict):
        return None, None
    body = {
        key: contract[key]
        for key in ("category", "path", "contract", "profile")
        if key in contract
    }
    payload = json.dumps(body, ensure_ascii=False, indent=2)
    size = len(payload.encode("utf-8"))
    if size <= DEFAULT_MAX_FILE_BYTES:
        return payload, None
    path = _string(contract.get("path")) or "unavailable (degraded contract)"
    line = (
        f"- Document Contract not inlined ({size} bytes > "
        f"{DEFAULT_MAX_FILE_BYTES} byte budget) — read: {path}"
    )
    return None, line


def build_injection_block(manifest: dict) -> str:
    asset = _string(manifest.get("asset")) or "unknown"
    role = _string(manifest.get("role")) or DEFAULT_ROLE
    contract_json, contract_line = _document_contract_section(manifest)

    def assemble(include_contract_json: bool) -> str:
        lines = [
            "<!-- opsv-hook-injected -->",
            f'<opsv-subagent-context asset="{asset}" role="{role}">',
            f"OPSV Context Manifest for asset `{asset}` (role: {role}), "
            f"materialized by the {HOOK_NAME} hook via "
            f"`opsv work context {asset} --role {role} --json`.",
        ]
        next_action = manifest.get("nextAction")
        if isinstance(next_action, dict) and next_action.get("kind"):
            lines.append(f"NextAction: {next_action['kind']}")

        lines.append("")
        lines.append("## Document Contract")
        if include_contract_json and contract_json is not None:
            lines.append("```json")
            lines.append(contract_json)
            lines.append("```")
        elif contract_line is not None:
            lines.append(contract_line)
        elif contract_json is not None:
            # Inline copy blew the total budget: degrade to the path line.
            path = manifest.get("documentContract", {}).get("path") or "unavailable"
            lines.append(
                f"- Document Contract not inlined (total context budget "
                f"reached) — read: {path}"
            )
        else:
            lines.append("- (none — see Issues)")

        refs = manifest.get("refs")
        if isinstance(refs, list) and refs:
            lines.append("")
            lines.append("## Approved References")
            for ref in refs:
                if not isinstance(ref, dict):
                    continue
                key = _string(ref.get("key"))
                state = _string(ref.get("state")) or "unknown"
                if not key:
                    continue
                entry = f"- {key} ({state})"
                message = _string(ref.get("message"))
                if message:
                    entry += f": {message}"
                lines.append(entry)

        guidance = manifest.get("guidanceRefs")
        if isinstance(guidance, list) and guidance:
            lines.append("")
            lines.append("## Pack Guidance")
            for entry in guidance:
                if _string(entry):
                    lines.append(f"- {entry}")

        issues = manifest.get("issues")
        if isinstance(issues, list) and issues:
            lines.append("")
            lines.append("## Issues")
            for issue in issues:
                if not isinstance(issue, dict):
                    continue
                code = _string(issue.get("code")) or "ISSUE"
                lines.append(f"- {code}: {_string(issue.get('message'))}")

        lines.append("</opsv-subagent-context>")
        return "\n".join(lines)

    block = assemble(include_contract_json=True)
    if len(block.encode("utf-8")) > DEFAULT_MAX_TOTAL_BYTES and contract_json is not None:
        block = assemble(include_contract_json=False)
    if len(block.encode("utf-8")) > DEFAULT_MAX_TOTAL_BYTES:
        block = _truncate_utf8(block, DEFAULT_MAX_TOTAL_BYTES)
        block += (
            f"\n[{HOOK_NAME}: truncated at {DEFAULT_MAX_TOTAL_BYTES} bytes — "
            f"re-run `opsv work context {asset} --role {role} --json` for the full manifest]"
        )
    return block


def warn(message: str) -> None:
    """Visible degradation: let the original call through, surface a warn."""
    print(json.dumps({"systemMessage": f"{HOOK_NAME}: {message}"}, ensure_ascii=False))


def emit_rewrite(tool_input: dict, new_prompt: str) -> None:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": {**tool_input, "prompt": new_prompt},
        }
    }
    print(json.dumps(output, ensure_ascii=False))


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # a malformed payload must never break the hook
    if not isinstance(payload, dict):
        return 0

    event = _string(payload.get("hook_event_name") or payload.get("hookEventName"))
    if event and event != "PreToolUse":
        return 0

    tool_name = _string(payload.get("tool_name") or payload.get("toolName")).lower()
    if tool_name not in ("task", "agent"):
        return 0

    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        tool_input = payload.get("toolInput")
    if not isinstance(tool_input, dict):
        return 0

    prompt = _string(tool_input.get("prompt"))
    if not prompt:
        return 0

    action = detect_action(prompt)
    asset = extract_asset(prompt)
    if not action and not asset:
        return 0  # unrelated dispatch: silent pass-through, zero output
    if not asset:
        warn(
            f"OPSV action `opsv {action}` detected but no asset reference found "
            "in the prompt; dispatch proceeds without a Context Manifest."
        )
        return 0

    cli = resolve_cli()
    if not cli:
        warn("`opsv` CLI not found on PATH; dispatch proceeds without a Context Manifest.")
        return 0

    role = ROLE_BY_ACTION.get(action, DEFAULT_ROLE)
    cwd = _string(payload.get("cwd"))
    try:
        proc = subprocess.run(
            [cli, "work", "context", asset, "--role", role, "--json"],
            capture_output=True,
            text=True,
            timeout=CLI_TIMEOUT_SECONDS,
            cwd=cwd if cwd and os.path.isdir(cwd) else None,
        )
    except subprocess.TimeoutExpired:
        warn(f"`opsv work context {asset}` timed out after {CLI_TIMEOUT_SECONDS}s; dispatch proceeds.")
        return 0
    except Exception as exc:
        warn(f"failed to run `opsv work context {asset}` ({exc}); dispatch proceeds.")
        return 0

    if proc.returncode != 0:
        detail = _string(proc.stderr) or _string(proc.stdout)
        warn(
            f"`opsv work context {asset}` failed ({detail[:200] or 'unknown error'}); "
            "dispatch proceeds without a Context Manifest."
        )
        return 0

    try:
        manifest = json.loads(proc.stdout)
    except Exception:
        warn(f"`opsv work context {asset}` returned non-JSON output; dispatch proceeds.")
        return 0
    if not isinstance(manifest, dict):
        return 0

    block = build_injection_block(manifest)
    # Append-only rewrite: compose with other PreToolUse rewriters (Trellis)
    # instead of overwriting their injected content.
    emit_rewrite(tool_input, prompt + "\n\n" + block)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # any path exits 0 — never block a dispatch
        try:
            print(f"{HOOK_NAME}: unexpected error: {exc}", file=sys.stderr)
        except Exception:
            pass
        sys.exit(0)
