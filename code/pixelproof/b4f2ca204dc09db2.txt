@echo off
REM PixelProof - one-click local run (Windows). Needs Python 3.10+ (python.org, tick "Add to PATH").
cd /d "%~dp0"
if not exist .venv (
  echo Creating virtual environment...
  python -m venv .venv || goto :error
)
call .venv\Scripts\activate.bat
python -m pip install -q --upgrade pip >nul
python -m pip install -q -e . || goto :error
echo Running the test-suite...
python -m unittest discover -s tests || goto :error
echo Auditing the demo dataset...
python -m pixelproof audit data/demo
set MODEL_ARG=
if defined GROQ_API_KEY (
  set MODEL_ARG=--model groq:qwen/qwen3.8-27b
  echo GROQ_API_KEY found: the "Ask model" button will query qwen/qwen3.8-27b on Groq.
) else (
  echo Tip: run "set GROQ_API_KEY=..." first to enable the live "Ask model" button.
)
python -m pixelproof studio --open %MODEL_ARG%
goto :eof
:error
echo Something failed - see the message above.
pause
