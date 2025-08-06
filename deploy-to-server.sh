#!/bin/bash

# Data Formulator Complete Deployment Script
# Usage: ./deploy-to-server.sh username@server-ip

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 username@server-ip [remote-path]"
    echo "Example: $0 root@192.168.1.100"
    echo "Example: $0 user@192.168.1.100 /home/user/projects"
    exit 1
fi

SERVER="$1"
REMOTE_PATH="${2:-/opt/data-formulator}"
ARCHIVE="../data-formulator-complete.tar.gz"

echo "🚀 Data Formulator Deployment"
echo "================================"
echo "Server: $SERVER"
echo "Remote Path: $REMOTE_PATH"
echo "Archive: $ARCHIVE"
echo ""

# Check if archive exists
if [ ! -f "$ARCHIVE" ]; then
    echo "❌ Archive not found: $ARCHIVE"
    echo "Creating archive now..."
    tar -czf "$ARCHIVE" .
    echo "✅ Archive created: $(ls -lh $ARCHIVE | awk '{print $5}')"
fi

echo "📤 Step 1: Transferring project files..."
scp "$ARCHIVE" "$SERVER:/tmp/"

echo "📁 Step 2: Setting up directory structure..."
ssh "$SERVER" "mkdir -p $REMOTE_PATH"

echo "📦 Step 3: Extracting project..."
ssh "$SERVER" "cd $REMOTE_PATH && tar -xzf /tmp/data-formulator-complete.tar.gz"

echo "🐍 Step 4: Setting up Python environment..."
ssh "$SERVER" "cd $REMOTE_PATH && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"

echo "📦 Step 5: Installing Node.js dependencies..."
ssh "$SERVER" "cd $REMOTE_PATH && npm install"

echo "🔧 Step 6: Setting up configuration..."
ssh "$SERVER" "cd $REMOTE_PATH && cp api-keys.env.template api-keys.env"

echo "🏗️  Step 7: Building frontend..."
ssh "$SERVER" "cd $REMOTE_PATH && npm run build"

echo "🧹 Step 8: Cleanup..."
ssh "$SERVER" "rm /tmp/data-formulator-complete.tar.gz"

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Next steps on server ($SERVER):"
echo "   1. cd $REMOTE_PATH"
echo "   2. Configure api-keys.env with your settings"
echo "   3. Start backend: source venv/bin/activate && ./local_server.sh"
echo "   4. Start frontend: npm start"
echo ""
echo "🌐 Server will be available at: http://server-ip:5173 (frontend) and http://server-ip:5000 (backend)" 