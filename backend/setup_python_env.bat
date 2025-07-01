@echo off
IF NOT EXIST venv (
    echo Creating Python virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing required Python packages...
pip install youtube-transcript-api requests

echo Python environment setup complete!
echo To activate the environment manually, run: venv\Scripts\activate.bat 