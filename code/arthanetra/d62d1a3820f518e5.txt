@echo off
REM One-command start on Windows:  run.bat   then open http://localhost:8000
cd /d %~dp0
REM API keys are read automatically from the .env file by the app.
cd backend
if not exist ..\.venv (python -m venv ..\.venv)
call ..\.venv\Scripts\activate.bat
pip install -q -r requirements.txt
echo ArthaNetra running at http://localhost:8000
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
