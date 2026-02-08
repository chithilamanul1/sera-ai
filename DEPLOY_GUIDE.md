# ☁️ Seranex Lanka Bot: Google Cloud Deployment Guide

This guide will help you deploy the bot to a Google Cloud VM (Compute Engine).

## 1. Create a VM Instance

- **OS**: Ubuntu 22.04 LTS (x86/64)
- **Machine Type**: e2-medium (2 vCPUs, 4 GB memory)
- **Firewall**: Allow HTTP/HTTPS traffic
- **Port**: Ensure port 3000 is open in the Google Cloud Firewall rules for the API.

## 2. Install Dependencies

Connect to your VM via SSH and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (v20+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [ [arch=amd64,arm64] signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# Install Chrome Dependencies (for Puppeteer)
sudo apt-get install -y libgbm-dev libnss3 libatk-bridge2.0-0 libgtk-3-0 libasound2
```

## 3. Setup Project

```bash
# Clone/Copy your project to the VM
cd seraauto

# Install root dependencies (API)
npm install
npm run build

# Install bot dependencies
cd whatsapp-bot
npm install
cd ..
```

## 4. Run with PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start all processes
pm2 start ecosystem.config.js

# Setup PM2 to start on boot
pm2 startup
pm2 save
```

## 5. Monitoring

- `pm2 logs`: View real-time logs.
- `pm2 status`: View process status.
- `pm2 restart seranex-bot`: Restart only the bot.
- `pm2 restart seranex-api`: Restart only the API.
