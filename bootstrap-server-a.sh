#!/usr/bin/env bash
# Gaafu TV bootstrap script for Server A (OVH baremetal)
# Run as root on a fresh Ubuntu/Debian server
# Usage: curl -fsSL <your-repo-raw>/bootstrap-a.sh | bash
# Or copy to server and run: bash bootstrap-a.sh

set -euo pipefail

echo "[+] Updating system..."
apt update && apt upgrade -y

echo "[+] Installing dependencies..."
apt install -y ffmpeg nginx nodejs npm certbot python3-certbot-nginx ufw

echo "[+] Creating directories..."
mkdir -p /opt/gaafu-tv/stream /var/www/hls /opt/gaafu-switch/data
chown -R www-data:www-data /var/www/hls /opt/gaafu-switch
chmod 700 /opt/gaafu-switch/data

echo "[+] Copying files from repo (assumes repo copied to /root/gaafu-tv or adjust)"
REPO_DIR="/root/gaafu-tv"
if [ ! -d "$REPO_DIR" ]; then
  echo "[!] Repo not found at $REPO_DIR"
  echo "    Copy the repo to $REPO_DIR first (git clone or scp)"
  exit 1
fi

# Stream files
cp "$REPO_DIR/stream/ladder.sh" /opt/gaafu-tv/stream/
cp "$REPO_DIR/stream/ladder.env.example" /opt/gaafu-tv/stream/ 2>/dev/null || true
cp "$REPO_DIR/stream/gaafu-ladder.service" /etc/systemd/system/
chmod +x /opt/gaafu-tv/stream/ladder.sh

# Switch files
cp "$REPO_DIR/admin/server.js" /opt/gaafu-switch/
cp "$REPO_DIR/admin/gaafu-switch.service" /etc/systemd/system/

echo "[+] Setting up encoder env..."
if [ ! -f /etc/gaafu-ladder.env ]; then
  cp /opt/gaafu-tv/stream/ladder.env.example /etc/gaafu-ladder.env
  chmod 600 /etc/gaafu-ladder.env
  echo "[!] Edit /etc/gaafu-ladder.env and set SRT_PASSPHRASE"
fi

echo "[+] Setting up switch env..."
if [ ! -f /etc/gaafu-switch.env ]; then
  cp "$REPO_DIR/admin/env.example" /etc/gaafu-switch.env
  chmod 600 /etc/gaafu-switch.env
  chown root:root /etc/gaafu-switch.env
  echo "[!] Edit /etc/gaafu-switch.env with strong secrets and domains"
  echo "    Generate secrets: openssl rand -hex 32"
fi

echo "[+] Nginx configs..."
cp "$REPO_DIR/stream/nginx.conf" /etc/nginx/sites-available/gaafu-origin
cp "$REPO_DIR/admin/nginx.conf" /etc/nginx/sites-available/gaafu-switch
ln -sf /etc/nginx/sites-available/gaafu-origin /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/gaafu-switch /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Add cache path for switch if not present
grep -q "proxy_cache_path.*switch" /etc/nginx/nginx.conf || sed -i '/http {/a\    proxy_cache_path /var/cache/nginx/switch levels=1 keys_zone=switch:1m max_size=10m inactive=1m use_temp_path=off;' /etc/nginx/nginx.conf
mkdir -p /var/cache/nginx/switch

echo "[+] Firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 9000/udp
echo "[!] Consider restricting 9000/udp to your studio IP: ufw allow from <STUDIO_IP> to any port 9000 proto udp"

echo "[+] Systemd..."
systemctl daemon-reload
systemctl enable --now gaafu-ladder
systemctl enable --now gaafu-switch
systemctl enable nginx

echo "[+] Next steps:"
echo "1. Edit /etc/gaafu-ladder.env (SRT_PASSPHRASE)"
echo "2. Edit /etc/gaafu-switch.env (ADMIN_PASSWORD >=16, SESSION_SECRET >=32, domains)"
echo "3. Run: certbot --nginx -d a.gaafu.tv -d switch.gaafu.tv"
echo "4. Restrict SRT to studio IP in ufw if desired"
echo "5. Start vMix to test"
echo ""
echo "[+] Status:"
systemctl status gaafu-ladder --no-pager | head -5
systemctl status gaafu-switch --no-pager | head -5
systemctl status nginx --no-pager | head -5
