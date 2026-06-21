# graphify llm.py 补丁 — 支持自定义 Extraction Prompt

## 修改文件

`graphify/graphify/llm.py`（pip 安装路径通常在 `site-packages/graphify/llm.py`）

## 改动说明

在 `_EXTRACTION_SYSTEM` 赋值之后添加环境变量读取逻辑，
允许用户通过 `GRAPHIFY_EXTRACTION_PROMPT_FILE` 指定自定义 prompt 文件。

## 补丁内容

在 llm.py 中找到这段代码（约第 148 行）：

```python
_EXTRACTION_SYSTEM = """\
You are a graphify semantic extraction agent...
..."""
```

在其下方（即 `_EXTRACTION_SYSTEM` 字符串结束后的空行处）添加：

```python
# ---- graphify-script patch: support custom extraction prompt via env var ----
_CUSTOM_PROMPT_FILE = os.environ.get("GRAPHIFY_EXTRACTION_PROMPT_FILE", "")
if _CUSTOM_PROMPT_FILE:
    _custom_path = Path(_CUSTOM_PROMPT_FILE)
    if _custom_path.exists():
        _EXTRACTION_SYSTEM = _custom_path.read_text(encoding="utf-8")
    else:
        import sys
        print(
            f"[graphify] WARNING: GRAPHIFY_EXTRACTION_PROMPT_FILE={_CUSTOM_PROMPT_FILE} "
            f"not found, using default extraction prompt.",
            file=sys.stderr,
        )
# --------------------------------------------------------------------
```

## 完整改动后的上下文

```python
_EXTRACTION_SYSTEM = """\
You are a graphify semantic extraction agent. Extract a knowledge graph fragment from the files provided.
Output ONLY valid JSON — no explanation, no markdown fences, no preamble.

Rules:
- EXTRACTED: relationship explicit in source (import, call, citation, reference)
- INFERRED: reasonable inference (shared data structure, implied dependency)
- AMBIGUOUS: uncertain — flag for review, do not omit

Node ID format: lowercase, only [a-z0-9_], no dots or slashes.
Format: {stem}_{entity} where stem = filename without extension, entity = symbol name (both normalised).

Output exactly this schema:
{"nodes":[{"id":"stem_entity","label":"Human Readable Name","file_type":"code|document|paper|image|rationale|concept","source_file":"relative/path","source_location":null,"source_url":null,"captured_at":null,"author":null,"contributor":null}],"edges":[{"source":"node_id","target":"node_id","relation":"calls|implements|references|cites|conceptually_related_to|shares_data_with|semantically_similar_to","confidence":"EXTRACTED|INFERRED|AMBIGUOUS","confidence_score":1.0,"source_file":"relative/path","source_location":null,"weight":1.0}],"hyperedges":[],"input_tokens":0,"output_tokens":0}
"""

# ---- graphify-script patch: support custom extraction prompt via env var ----
_CUSTOM_PROMPT_FILE = os.environ.get("GRAPHIFY_EXTRACTION_PROMPT_FILE", "")
if _CUSTOM_PROMPT_FILE:
    _custom_path = Path(_CUSTOM_PROMPT_FILE)
    if _custom_path.exists():
        _EXTRACTION_SYSTEM = _custom_path.read_text(encoding="utf-8")
    else:
        print(
            f"[graphify] WARNING: GRAPHIFY_EXTRACTION_PROMPT_FILE={_CUSTOM_PROMPT_FILE} "
            f"not found, using default extraction prompt.",
            file=sys.stderr,
        )
# --------------------------------------------------------------------


def _read_files(paths: list[Path], root: Path) -> str:
    """Return file contents formatted for the extraction prompt."""
    ...
```

## 使用方式

```bash
# 设置环境变量指向自定义 prompt 文件
export GRAPHIFY_EXTRACTION_PROMPT_FILE="/path/to/graphify-script/extraction_prompt.md"

# 正常运行 graphify
graphify . --backend ollama --no-viz
```

## 恢复默认

```bash
unset GRAPHIFY_EXTRACTION_PROMPT_FILE
# 或者
GRAPHIFY_EXTRACTION_PROMPT_FILE="" graphify . --backend ollama --no-viz
```

## 一键打补丁脚本

```bash
#!/bin/bash
# 找到 llm.py 并打补丁
LLM_PY=$(python -c "import graphify.llm; print(graphify.llm.__file__)" 2>/dev/null)
if [ -z "$LLM_PY" ]; then
    echo "graphify not installed"
    exit 1
fi

# 检查是否已打过补丁
if grep -q "GRAPHIFY_EXTRACTION_PROMPT_FILE" "$LLM_PY"; then
    echo "Patch already applied to $LLM_PY"
    exit 0
fi

# 在 _EXTRACTION_SYSTEM 字符串结束后插入补丁代码
python3 << 'PYEOF'
import re

llm_py = "$LLM_PY"  # will be replaced by shell
with open(llm_py, 'r') as f:
    content = f.read()

# 找到 _EXTRACTION_SYSTEM 字符串结束位置（连续的三个引号后）
# 目标：在 """ 和下一个 def/空白之间插入补丁
patch_code = '''
# ---- graphify-script patch: support custom extraction prompt via env var ----
_CUSTOM_PROMPT_FILE = os.environ.get("GRAPHIFY_EXTRACTION_PROMPT_FILE", "")
if _CUSTOM_PROMPT_FILE:
    _custom_path = Path(_CUSTOM_PROMPT_FILE)
    if _custom_path.exists():
        _EXTRACTION_SYSTEM = _custom_path.read_text(encoding="utf-8")
    else:
        print(
            f"[graphify] WARNING: GRAPHIFY_EXTRACTION_PROMPT_FILE={_CUSTOM_PROMPT_FILE} "
            f"not found, using default extraction prompt.",
            file=sys.stderr,
        )
# --------------------------------------------------------------------
'''

# 匹配 _EXTRACTION_SYSTEM 的结束 """
pattern = r'(_EXTRACTION_SYSTEM\s*=\s*""".*?""")'
match = re.search(pattern, content, re.DOTALL)
if match:
    end_pos = match.end()
    new_content = content[:end_pos] + patch_code + content[end_pos:]
    with open(llm_py, 'w') as f:
        f.write(new_content)
    print(f"Patch applied to {llm_py}")
else:
    print("Could not find _EXTRACTION_SYSTEM in llm.py")
PYEOF
```
