@echo off
echo Starting backend server and ngrok tunnel...

REM Check if ngrok is installed
where ngrok >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ngrok is not installed or not in PATH.
    echo Please install ngrok from https://ngrok.com/download
    exit /b 1
)

REM Start backend server in background
start cmd /k "cd %~dp0 && npm run dev"

REM Wait for server to start
echo Waiting for server to start... (5 seconds)
timeout /t 5 /nobreak >nul

REM Start ngrok
echo Starting ngrok tunnel to localhost:5000
ngrok http 5000

echo Remember to update your Twitter app settings with the ngrok URL
echo And update your .env file with the new callback URLs 