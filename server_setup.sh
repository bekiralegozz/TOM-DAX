#!/bin/bash
# DAX Application Server Setup Script

echo "=== DAX Application Server Setup ==="

# 1. Install system dependencies
echo "Installing system dependencies..."
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip git

# Install Node.js
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install ODBC Driver for SQL Server
echo "Installing ODBC Driver for SQL Server..."
sudo apt-get install -y unixodbc-dev
curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
curl https://packages.microsoft.com/config/ubuntu/20.04/prod.list | sudo tee /etc/apt/sources.list.d/msprod.list
sudo apt-get update
sudo apt-get install -y msodbcsql17

# 2. Clone the project
echo "Cloning project repository..."
git clone https://github.com/bekiralegozz/TOM-DAX.git
cd TOM-DAX
git checkout server-mode

# 3. Setup Python environment
echo "Setting up Python virtual environment..."
python3.11 -m venv venv
source venv/bin/activate

# 4. Install Python dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r py-src/requirements.txt

# 5. Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# 6. Build frontend
echo "Building frontend..."
npm run build

# 7. Setup environment variables
echo "Setting up environment variables..."
cp py-src/api-keys.env.example py-src/api-keys.env

echo "=== Setup Complete ==="
echo "Please edit py-src/api-keys.env with your API keys"
echo "Then run: cd py-src && python -m data_formulator.app --port 5000" 