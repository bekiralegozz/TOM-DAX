# DAX Application Server Kurulum Rehberi

Bu rehber, DAX uygulamasını sunucuda baştan kurmak için gerekli tüm adımları içerir.

## Sistem Gereksinimleri

- Ubuntu 20.04+ veya benzer Linux dağıtımı
- Python 3.11+
- Node.js 18+
- Nginx (opsiyonel, reverse proxy için)
- En az 2GB RAM
- En az 10GB disk alanı

## 1. Hızlı Kurulum

```bash
# 1. Setup scriptini çalıştırın
chmod +x server_setup.sh
./server_setup.sh

# 2. API anahtarlarını yapılandırın
cd TOM-DAX
cp py-src/api-keys.env.example py-src/api-keys.env
nano py-src/api-keys.env  # OpenAI API anahtarınızı ekleyin

# 3. Uygulamayı test edin
cd py-src
source ../venv/bin/activate
python -m data_formulator.app --port 5000
```

## 2. Production Kurulumu

### Sistem Servisi Olarak Çalıştırma

```bash
# 1. Uygulamayı /opt dizinine taşıyın
sudo mv TOM-DAX /opt/
sudo chown -R www-data:www-data /opt/TOM-DAX

# 2. Systemd servisini kurun
sudo cp /opt/TOM-DAX/dax.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dax
sudo systemctl start dax

# 3. Servis durumunu kontrol edin
sudo systemctl status dax
```

### Nginx Reverse Proxy Kurulumu

```bash
# 1. Nginx'i yükleyin
sudo apt install nginx

# 2. Site konfigürasyonunu kurun
sudo cp /opt/TOM-DAX/nginx.conf /etc/nginx/sites-available/dax
sudo ln -s /etc/nginx/sites-available/dax /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# 3. Nginx'i yeniden başlatın
sudo nginx -t
sudo systemctl restart nginx
```

## 3. Veritabanı Bağlantıları

Uygulama aşağıdaki veritabanlarına bağlanır:

### MSSQL (Veri Kaynağı)
- Server: 172.34.12.80:1433
- Database: AdventureWorksDW2019
- User: data_formulator_user
- Password: data_form12345

### PostgreSQL (Kimlik Doğrulama)
- Host: tb34tstextdb01
- Port: 5432
- Database: ai_core
- User: ai_core_owner
- Password: En6OtjrJxbREweki

## 4. Güvenlik Duvarı Ayarları

```bash
# Port 80'i açın (Nginx için)
sudo ufw allow 80

# Port 5000'i sadece localhost için açın
sudo ufw allow from 127.0.0.1 to any port 5000
```

## 5. İzleme ve Logging

```bash
# Uygulama loglarını görüntüleyin
sudo journalctl -u dax -f

# Nginx loglarını görüntüleyin
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 6. Sorun Giderme

### Yaygın Sorunlar

1. **Python bağımlılık hataları**
   ```bash
   cd /opt/TOM-DAX
   source venv/bin/activate
   pip install --upgrade -r py-src/requirements.txt
   ```

2. **ODBC Driver sorunları**
   ```bash
   # Driver'ı yeniden yükleyin
   sudo apt-get install --reinstall msodbcsql17
   ```

3. **Permission sorunları**
   ```bash
   sudo chown -R www-data:www-data /opt/TOM-DAX
   sudo chmod +x /opt/TOM-DAX/venv/bin/python
   ```

4. **Port kullanımda hatası**
   ```bash
   # Port 5000'i kullanan processları kontrol edin
   sudo netstat -tlnp | grep :5000
   ```

## 7. Güncelleme

```bash
# 1. Yeni kodu çekin
cd /opt/TOM-DAX
sudo git pull origin server-mode

# 2. Frontend'i yeniden build edin
sudo npm run build

# 3. Servisi yeniden başlatın
sudo systemctl restart dax
```

## 8. Yedekleme

```bash
# 1. Uygulama dosyalarını yedekleyin
sudo tar -czf dax-backup-$(date +%Y%m%d).tar.gz -C /opt TOM-DAX

# 2. Nginx konfigürasyonunu yedekleyin
sudo cp /etc/nginx/sites-available/dax /opt/TOM-DAX/nginx-backup.conf
```

## Destek

Herhangi bir sorun yaşarsanız:
1. Logları kontrol edin: `sudo journalctl -u dax -f`
2. Servis durumunu kontrol edin: `sudo systemctl status dax`
3. Nginx durumunu kontrol edin: `sudo systemctl status nginx` 