# Data Formulator Deployment Guide

Bu rehber Data Formulator uygulamasını internet erişimi olmayan bir servera nasıl deploy edeceğinizi açıklar.

## 📦 Hazırlanmış Dosyalar

- `data-formulator-complete.tar.gz` - Tüm proje dosyaları (308MB)
- `deploy-to-server.sh` - Otomatik deployment script'i  
- `server-setup.sh` - Production server kurulum script'i

## 🚀 Deployment Yöntemleri

### Yöntem 1: Otomatik Deployment (Önerilen)

```bash
# 1. Script'i çalıştır
./deploy-to-server.sh username@server-ip [remote-path]

# Örnekler:
./deploy-to-server.sh root@192.168.1.100
./deploy-to-server.sh user@192.168.1.100 /home/user/data-formulator
```

### Yöntem 2: Manuel Transfer

```bash
# 1. Archive'i servera kopyala
scp ../data-formulator-complete.tar.gz username@server-ip:/tmp/

# 2. Serverde extract et
ssh username@server-ip
cd /opt/data-formulator  # veya istediğin klasör
tar -xzf /tmp/data-formulator-complete.tar.gz

# 3. Dependencies kur
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
npm install

# 4. Build et
npm run build
```

### Yöntem 3: RSYNC (Daha Hızlı)

```bash
# Tüm proje klasörünü sync et
rsync -avz --progress . username@server-ip:/opt/data-formulator/
```

## ⚙️ Server Kurulumu

### Development Mode

```bash
# Backend başlat
cd /opt/data-formulator
source venv/bin/activate
./local_server.sh

# Frontend başlat (yeni terminal)
npm start
```

### Production Mode

```bash
# 1. Production setup (root olarak çalıştır)
sudo ./server-setup.sh

# 2. Servisleri başlat
sudo /opt/data-formulator/start-services.sh

# 3. Status kontrol et
systemctl status data-formulator-backend
systemctl status data-formulator-frontend
```

## 🔧 Konfigürasyon

### API Keys Setup

```bash
cd /opt/data-formulator
cp api-keys.env.template api-keys.env
nano api-keys.env  # API key'leri ayarla
```

### Database Connections

`api-keys.env` dosyasında database bağlantı bilgilerini ayarlayın:

```env
# SQL Server
MSSQL_HOST=your-server
MSSQL_PORT=1433
MSSQL_DATABASE=your-db
MSSQL_USERNAME=your-user
MSSQL_PASSWORD=your-password

# MySQL
MYSQL_HOST=your-server
MYSQL_PORT=3306
# ... vs
```

## 🌐 Erişim

### Development Mode
- Frontend: `http://server-ip:5173`
- Backend: `http://server-ip:5000`

### Production Mode (Nginx)
- Uygulama: `http://server-ip` (port 80)

## 📋 Servis Yönetimi

```bash
# Başlat
systemctl start data-formulator-backend
systemctl start data-formulator-frontend

# Durdur  
systemctl stop data-formulator-backend
systemctl stop data-formulator-frontend

# Yeniden başlat
systemctl restart data-formulator-backend
systemctl restart data-formulator-frontend

# Status kontrol
systemctl status data-formulator-backend
systemctl status data-formulator-frontend

# Log'ları izle
journalctl -u data-formulator-backend -f
journalctl -u data-formulator-frontend -f
```

## 🔍 Troubleshooting

### Port Çakışması
```bash
# Port 5000 kullanımda ise
lsof -i :5000
kill -9 <PID>

# Port 5173 kullanımda ise  
lsof -i :5173
kill -9 <PID>
```

### Permission Sorunları
```bash
# Ownership düzelt
chown -R dataform:dataform /opt/data-formulator

# Executable permission
chmod +x /opt/data-formulator/local_server.sh
chmod +x /opt/data-formulator/start-services.sh
```

### Python Environment
```bash
# Virtual environment yeniden oluştur
cd /opt/data-formulator
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Node Dependencies
```bash
# Node modules yeniden kur
cd /opt/data-formulator
rm -rf node_modules package-lock.json
npm install
```

## 📊 Sistem Gereksinimleri

### Minimum
- **CPU**: 2 cores
- **RAM**: 4GB
- **Disk**: 10GB free space
- **OS**: Ubuntu 18.04+ / CentOS 7+ / Debian 9+

### Önerilen
- **CPU**: 4+ cores  
- **RAM**: 8GB+
- **Disk**: 20GB+ SSD
- **OS**: Ubuntu 20.04+ / CentOS 8+

### Dependencies
- **Python**: 3.8+
- **Node.js**: 16+
- **npm**: 8+
- **nginx**: 1.18+ (production)

## 🔐 Güvenlik

### Firewall
```bash
# Gerekli portları aç
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS (SSL kurulumu sonrası)
ufw enable
```

### SSL Sertifikası (İsteğe Bağlı)
```bash
# Let's Encrypt ile SSL
certbot --nginx -d your-domain.com
```

## 📈 İzleme

### Log Lokasyonları
- **Backend logs**: `journalctl -u data-formulator-backend`
- **Frontend logs**: `journalctl -u data-formulator-frontend`  
- **Nginx logs**: `/var/log/nginx/`
- **Uygulama logs**: `/opt/data-formulator/logs/`

### Performans İzleme
```bash
# System resources
htop
df -h
free -h

# Service status
systemctl list-units | grep data-formulator
```

## 🆘 Destek

Deployment sırasında sorun yaşarsanız:

1. Log dosyalarını kontrol edin
2. Service status'ları kontrol edin  
3. Port çakışmalarını kontrol edin
4. Permission'ları kontrol edin
5. Network bağlantısını test edin

## 📝 Notlar

- Archive dosyası tüm dependencies'i içerir (node_modules, venv, vs.)
- İlk kurulumda internet bağlantısı gerekmiyor
- Production mode nginx reverse proxy kullanır
- Development mode direkt port'lar üzerinden çalışır
- Tüm konfigürasyonlar `api-keys.env` dosyasında 