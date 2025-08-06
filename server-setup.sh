#!/bin/bash

# Data Formulator Production Server Setup
# Run this script on the target server after deployment

set -e

PROJECT_PATH="${1:-/opt/data-formulator}"
USER="${2:-dataform}"

echo "🔧 Data Formulator Production Setup"
echo "==================================="
echo "Project Path: $PROJECT_PATH"
echo "Service User: $USER"
echo ""

# Create dedicated user
echo "👤 Creating service user..."
if ! id "$USER" &>/dev/null; then
    useradd -m -s /bin/bash "$USER"
    echo "✅ User $USER created"
else
    echo "ℹ️  User $USER already exists"
fi

# Set ownership
echo "🔐 Setting permissions..."
chown -R "$USER:$USER" "$PROJECT_PATH"

# Create systemd service for backend
echo "⚙️  Creating backend systemd service..."
cat > /etc/systemd/system/data-formulator-backend.service << EOF
[Unit]
Description=Data Formulator Backend
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_PATH/py-src
Environment=PATH=$PROJECT_PATH/venv/bin
ExecStart=$PROJECT_PATH/venv/bin/python -m data_formulator
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create systemd service for frontend
echo "⚙️  Creating frontend systemd service..."
cat > /etc/systemd/system/data-formulator-frontend.service << EOF
[Unit]
Description=Data Formulator Frontend
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_PATH
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Create nginx configuration
echo "🌐 Creating nginx configuration..."
cat > /etc/nginx/sites-available/data-formulator << EOF
server {
    listen 80;
    server_name _;
    
    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable nginx site
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
fi
ln -sf /etc/nginx/sites-available/data-formulator /etc/nginx/sites-enabled/

# Create startup script
echo "🚀 Creating startup script..."
cat > "$PROJECT_PATH/start-services.sh" << EOF
#!/bin/bash
cd $PROJECT_PATH

# Start backend
systemctl start data-formulator-backend
systemctl enable data-formulator-backend

# Start frontend  
systemctl start data-formulator-frontend
systemctl enable data-formulator-frontend

# Start nginx
systemctl restart nginx
systemctl enable nginx

echo "✅ All services started!"
echo "🌐 Access at: http://\$(hostname -I | awk '{print \$1}')"
EOF

chmod +x "$PROJECT_PATH/start-services.sh"
chown "$USER:$USER" "$PROJECT_PATH/start-services.sh"

# Reload systemd
systemctl daemon-reload

echo ""
echo "✅ Production setup completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Configure $PROJECT_PATH/api-keys.env"
echo "   2. Run: $PROJECT_PATH/start-services.sh"
echo "   3. Check status: systemctl status data-formulator-backend"
echo "   4. Check logs: journalctl -u data-formulator-backend -f"
echo ""
echo "🔧 Service commands:"
echo "   • Start: systemctl start data-formulator-{backend,frontend}"
echo "   • Stop: systemctl stop data-formulator-{backend,frontend}"
echo "   • Restart: systemctl restart data-formulator-{backend,frontend}"
echo "   • Status: systemctl status data-formulator-{backend,frontend}"
echo "" 