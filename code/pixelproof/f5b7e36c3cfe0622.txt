#!/usr/bin/env bash
# PixelProof — one-click local run (macOS / Linux). Needs Python 3.10+.
set -e
cd "$(dirname "$0")"
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
if [ ! -d .venv ]; then
  echo "Creating virtual environment..."
  $PY -m venv .venv
fi
. .venv/bin/activate
python -m pip install -q --upgrade pip >/dev/null
python -m pip install -q -e .
echo "Running the test-suite (every family x level must produce verified twins)..."
python -m unittest discover -s tests
echo "Auditing the demo dataset (re-deriving every answer from pixels)..."
python -m pixelproof audit data/demo | head -3
MODEL_ARG=""
if [ -n "$GROQ_API_KEY" ]; then
  MODEL_ARG="--model groq:qwen/qwen3.8-27b"
  echo "GROQ_API_KEY found: the 'Ask model' button will query qwen/qwen3.8-27b on Groq."
else
  echo "Tip: export GROQ_API_KEY=... before running to enable the live 'Ask model' button."
fi
python -m pixelproof studio --open $MODEL_ARG
