#!/bin/bash

# IB4 CRYPTO DECK - Launch Script

echo "🚀 Starting IB4 CRYPTO DECK..."
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to create virtual environment"
        exit 1
    fi
fi

# Activate virtual environment
echo "🔌 Activating virtual environment..."
source venv/bin/activate

# Install/upgrade dependencies
echo "📥 Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies"
    exit 1
fi

# Create database if it doesn't exist
if [ ! -f "crypto_deck.db" ]; then
    echo "💾 Database will be created on first run..."
fi

# Run the application
echo ""
echo "=" | head -c 50
echo ""
echo "🌟 Starting Flask application..."
echo "📍 Server will be available at: http://localhost:5001"
echo "   Press Ctrl+C to stop the server"
echo ""
echo "=" | head -c 50
echo ""
python app.py

