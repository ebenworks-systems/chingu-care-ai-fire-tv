#!/usr/bin/env bash
# Downloads the Piper voice the hub speaks with (LJSpeech, US English; the
# dataset is public domain). About 110 MB, once.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p voices
BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/high
for f in en_US-ljspeech-high.onnx en_US-ljspeech-high.onnx.json; do
  [ -s "voices/$f" ] || curl -fsSL -o "voices/$f" "$BASE/$f"
done
