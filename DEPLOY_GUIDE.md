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

## 6. 🚀 How to Update (Force Sync Everything)

Run these commands in order to ensure the latest changes are correctly built and running:

```bash
# Enter the project folder
cd ~/sera-ai

# 1. Pull latest code
git pull origin main

# 2. Re-install & Re-build
npm install
npm run build

# 3. Update Bots
cd whatsapp-bot && npm install && cd ..
cd discord-bot && npm install && cd ..

# 4. Restart everything (CRITICAL)
pm2 restart ecosystem.config.js --update-env
pm2 save
```

## 7. 🛠️ Troubleshooting 502 / 404 Errors

If you see a 502 error on Discord or 404 in the logs:

1. **Check if API is running**: Visit `http://YOUR_VM_IP:3000/api/health` in your browser.
   - If it says "Online" and shows "version: 1.1.0", you are on the latest code!
2. **Check API Logs**: Run `pm2 logs seranex-api` to see if there are build or start errors.
3. **Check Port 3000**: Ensure 3000 is open in GCP Firewall settings.
4. **Key Rotation Issues**: If you get 404 from Google, check `pm2 logs` for the "🛑 Full error" detail I added. It will tell you if the API is disabled or the key is invalid.

## 8. 🔑 Managing Keys

Instead of using 5 different keys, you can just set one "Perfect Key" in the database:

- Use `!sera key <YOUR_KEY>` in Discord.
- This will set the Primary Master Key.
- You can clear old keys using the same command with a new one; it will automatically move the old ones to the backup partition.
