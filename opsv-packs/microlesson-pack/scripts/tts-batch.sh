#!/usr/bin/env bash
# tts-batch.sh — 批量 TTS 语音合成（VoxCPM2）
#
# 用法:
#   ./tts-batch.sh <metadata_file> [--voice ref.wav] [--model /path/to/voxcpm2.gguf] [--ref-text "transcription"] [--output-dir /path/to/output]
#
# 输入文件格式 (TSV):
#   slide_id<TAB>text<TAB>output_wav
#
# 示例:
#   # 默认中性音色
#   ./tts-batch.sh slides.tsv
#
#   # 音色克隆
#   ./tts-batch.sh slides.tsv --voice speaker.wav --ref-text "参考文本" --i-have-rights
#
#   # 使用 qwen3-tts VoiceDesign
#   ./tts-batch.sh slides.tsv --backend qwen3-tts --instruct "温柔女声，语速适中"

set -euo pipefail

# ========== 默认配置 ==========
CRISP="${CRISP_BIN:-/home/uncle7/code/CrispASR/build/bin/crispasr}"
BACKEND="voxcpm2"
VOICE=""
REF_TEXT=""
MODEL="/home/uncle7/.cache/crispasr/voxcpm2-q4_k.gguf"
OUTPUT_DIR="./tts_output"
I_HAVE_RIGHTS=false
THREADS=4
VERBOSE=false

usage() {
    cat <<EOF
tts-batch.sh — 批量 TTS 语音合成

用法: $0 <metadata_file> [OPTIONS]

参数:
  metadata_file    TSV 文件，每行: slide_id<TAB>text<TAB>output_wav

选项:
  --backend NAME   TTS 后端: voxcpm2 (默认)
  --voice PATH     参考音频路径（音色克隆）
  --ref-text TEXT  参考音频的文本转录
  --model PATH     VoxCPM2 模型 GGUF 路径（默认: ~/.cache/crispasr/voxcpm2-q4_k.gguf）
  --output-dir DIR 输出目录（默认: ./tts_output）
  --i-have-rights  确认拥有语音克隆权限（必须与 --voice 一起使用）
  --threads N      线程数（默认: 4）
  --crisp PATH     crispasr 二进制路径
  --verbose        显示详细输出
  --dry-run        只显示命令，不执行
  -h, --help       显示此帮助

示例:
  $0 slides.tsv --backend voxcpm2
  $0 slides.tsv --backend voxcpm2 --voice speaker.wav --ref-text "hello" --i-have-rights
  $0 slides.tsv --backend qwen3-tts --instruct "温柔女声"
EOF
    exit 0
}

# ========== 参数解析 ==========
METADATA_FILE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --backend)
            BACKEND="$2"; shift 2 ;;
        --voice)
            VOICE="$2"; shift 2 ;;
        --ref-text)
            REF_TEXT="$2"; shift 2 ;;
        --model)
            MODEL="$2"; shift 2 ;;
        --output-dir)
            OUTPUT_DIR="$2"; shift 2 ;;
        --i-have-rights)
            I_HAVE_RIGHTS=true; shift ;;
        --threads)
            THREADS="$2"; shift 2 ;;
        --crisp)
            CRISP="$2"; shift 2 ;;
        --verbose)
            VERBOSE=true; shift ;;
        --dry-run)
            DRY_RUN=true; shift ;;
        -h|--help)
            usage ;;
        -*)
            echo "未知选项: $1" >&2; exit 1 ;;
        *)
            if [[ -z "$METADATA_FILE" ]]; then
                METADATA_FILE="$1"; shift
            else
                echo "意外的参数: $1" >&2; exit 1
            fi
            ;;
    esac
done

if [[ -z "$METADATA_FILE" ]]; then
    echo "错误: 请指定 TSV 元数据文件" >&2
    exit 1
fi

if [[ ! -f "$METADATA_FILE" ]]; then
    echo "错误: 文件不存在: $METADATA_FILE" >&2
    exit 1
fi

# ========== 验证 ==========
if [[ ! -x "$CRISP" ]]; then
    echo "错误: crispasr 不可执行: $CRISP" >&2
    exit 1
fi

if [[ "$BACKEND" != "voxcpm2" ]]; then
    echo "错误: 仅支持 voxcpm2 后端" >&2
    exit 1
fi

if [[ -n "$VOICE" && ! -f "$VOICE" ]]; then
    echo "错误: 参考音频不存在: $VOICE" >&2
    exit 1
fi

if [[ -n "$VOICE" && "$I_HAVE_RIGHTS" != true ]]; then
    echo "错误: 使用 --voice 必须同时指定 --i-have-rights" >&2
    exit 1
fi

# Remove stale empty qwen3-tts model warning
# No extra validation needed for voxcpm2

# ========== 输出目录 ==========
mkdir -p "$OUTPUT_DIR"

# ========== 统计 ==========
TOTAL=0
SUCCESS=0
FAILED=0
SKIPPED=0

# ========== 处理函数 ==========
build_cmd() {
    local cmd="$CRISP"
    cmd+=" --tts \"$1\""
    cmd+=" --backend $BACKEND"
    cmd+=" --threads $THREADS"

    if [[ -n "$MODEL" ]]; then
        cmd+=" --model $MODEL"
    fi

    if [[ -n "$VOICE" ]]; then
        cmd+=" --voice $VOICE"
    fi

    if [[ -n "$REF_TEXT" ]]; then
        cmd+=" --ref-text \"$REF_TEXT\""
    fi

    if [[ "$I_HAVE_RIGHTS" == true ]]; then
        cmd+=" --i-have-rights"
    fi

    cmd+=" --tts-output \"$2\""

    if [[ "$VERBOSE" == true ]]; then
        cmd+=" --verbose"
    fi

    echo "$cmd"
}

process_line() {
    local line="$1"
    local slide_id text output_wav

    # 解析 TSV: slide_id<TAB>text<TAB>output_wav
    slide_id=$(echo "$line" | cut -f1)
    text=$(echo "$line" | cut -f2)
    output_wav=$(echo "$line" | cut -f3)

    # 构建完整输出路径
    if [[ "$output_wav" != /* ]]; then
        output_wav="$OUTPUT_DIR/$output_wav"
    fi

    # 确保输出目录存在
    mkdir -p "$(dirname "$output_wav")"

    # 跳过已存在的
    if [[ -f "$output_wav" ]]; then
        echo "[SKIP] $slide_id (already exists)"
        ((SKIPPED++)) || true
        return
    fi

    # 构建命令
    local cmd
    cmd=$(build_cmd "$text" "$output_wav")

    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY-RUN] $slide_id: $cmd"
        ((SUCCESS++)) || true
        return
    fi

    # 执行
    if [[ "$VERBOSE" == true ]]; then
        echo "[RUN] $slide_id ..."
        echo "  $cmd"
    fi

    local cmd_output
    if cmd_output=$(eval "$cmd" 2>&1); then
        if [[ -f "$output_wav" ]]; then
            echo "[OK]   $slide_id -> $(basename "$output_wav")"
            ((SUCCESS++)) || true
        else
            echo "[FAIL] $slide_id (no output file)"
            ((FAILED++)) || true
            [[ "$VERBOSE" == true ]] && echo "  stderr: $cmd_output"
        fi
    else
        echo "[FAIL] $slide_id (crispasr exit=$?)"
        ((FAILED++)) || true
        [[ "$VERBOSE" == true ]] && echo "  stderr: $cmd_output"
    fi
}

# ========== 主循环 ==========
echo "========================================"
echo "  TTS Batch Processor"
echo "========================================"
echo "  Backend:    $BACKEND"
echo "  CrispASR:   $CRISP"
echo "  Model:      ${MODEL:-auto}"
echo "  Voice:      ${VOICE:-none}"
echo "  Output Dir: $OUTPUT_DIR"
echo "  Dry Run:    $DRY_RUN"
echo "========================================"
echo ""

while IFS=$'\t' read -r slide_id text output_wav || [[ -n "$slide_id" ]]; do
    # 跳过空行和注释
    [[ -z "$slide_id" || "$slide_id" == \#* ]] && continue

    ((TOTAL++)) || true
    process_line "$slide_id"$'\t'"$text"$'\t'"$output_wav"
done < "$METADATA_FILE"

echo ""
echo "========================================"
echo "  完成"
echo "  总计: $TOTAL | 成功: $SUCCESS | 跳过: $SKIPPED | 失败: $FAILED"
echo "========================================"

if [[ $FAILED -gt 0 ]]; then
    exit 1
fi
