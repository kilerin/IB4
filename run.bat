@echo off
REM IB4 CRYPTO DECK - Launch Script for Windows

echo 🚀 Starting IB4 CRYPTO DECK...

REM Check if virtual environment exists
if not exist "venv" (
    echo 📦 Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo 🔌 Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo 📥 Installing dependencies...
pip install -q -r requirements.txt

REM Run the application
echo 🌟 Starting Flask application...
echo 📍 Server will be available at: http://localhost:5000
echo.
python app.py

pause


