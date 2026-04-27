@echo off
cd /d "%~dp0"
echo Iniciando bot de Telegram...
start "Bot Gastos" cmd /k "python bot.py"
echo Iniciando backend FastAPI...
start "Backend Gastos" cmd /k "python -m uvicorn backend.main:app --reload --port 8000"
echo Iniciando frontend React...
start "Frontend Gastos" cmd /k "cd frontend && npm run dev"
echo.
echo Los tres servicios se iniciaron:
echo   - Bot Telegram
echo   - Backend API en http://localhost:8000
echo   - Frontend en http://localhost:3000
timeout /t 4 >nul
