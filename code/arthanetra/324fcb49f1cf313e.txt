#!/usr/bin/env bash
# One-command start:  ./run.sh   then open http://localhost:8000
set -e
cd "$(dirname "$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
cd backend
python3 -m venv ../.venv 2>/dev/null || true
. ../.venv/bin/activate 2>/dev/null || true
pip install -q -r requirements.txt
echo "ArthaNetra running at http://localhost:${PORT:-8000}"
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
