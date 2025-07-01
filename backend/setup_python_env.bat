@echo off
echo Setting up Python virtual environment...

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed. Please install Python 3.x
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Upgrade pip
python -m pip install --upgrade pip

REM Install required packages
pip install youtube-transcript-api

REM Make transcript fetcher executable
echo Making transcript fetcher executable...
icacls src\transcript_fetcher.py /grant Everyone:F

REM Test the setup
python src\transcript_fetcher.py --test

REM Deactivate virtual environment
deactivate

echo Python environment setup completed 