# 🚀 Seranex AI - Compute Engine (VM) Deployment Guide

This guide explains how to deploy the Seranex AI system to a Google Cloud Compute Engine VM using **Git** and **PM2**.

## 1. Prerequisites

- A GCP Compute Engine VM (Ubuntu 22.04 LTS or similar).
- Google Cloud SDK (`gcloud`) installed.
- **SSH Access**: You should be able to SSH into your VM.

---

## 2. Master Command Guide (One-Time Setup)

Connect to your VM and run these commands:

### Step 1: Install Node.js, Git & PM2

```bash
# Update system
sudo apt-get update

# Install Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Install PM2 globally
sudo npm install -g pm2
```

### Step 2: Clone & Prepare Project

```bash
# Clone the repository (Use your GitHub Token as the password)
git clone https://github.com/chithilamanul1/sera-ai.git
cd sera-ai

# Install dependencies
npm install

# Build the Next.js app
npm run build
```

### Step 3: Configure Environment Variables

Create a `.env` file in the root directory:

```bash
nano .env
# (After pasting your variables, press CTRL+O, ENTER, CTRL+X to save)
```

### Step 4: Start Main Bot with PM2

```bash
# Start the production server
pm2 start npm --name "seranex-api" -- start

# Configure PM2 to start on boot
pm2 save
pm2 startup
# (Run the command PM2 provides in the terminal output)
```

### Step 5: Setup Discord Control Bot

```bash
# Navigate to the discord-bot folder
cd ~/sera-ai/discord-bot

# Install dependencies
npm install

# Copy the environment variables to the bot folder
cp ~/sera-ai/.env ~/sera-ai/discord-bot/.env

# Start with PM2
pm2 start bot.js --name "seranex-discord"

# Save PM2 state again
pm2 save
```

---

## 3. Environment Variables (Required)

Ensure your `.env` file contains these variables:

| Variable | Value |
|----------|-------|
| `AI_PROVIDER` | `openai` |
| `MONGODB_URI` | `mongodb+srv://furynetworkslk_db_user:xPD9sZY3Wps7euhi@serabot.4rnpgr5.mongodb.net/?appName=serabot` |
| `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/...` |
| `DISCORD_ADMIN_IDS` | `1448949659451265045` |
| `DISCORD_BOT_TOKEN` | `MTQ2ODY0NjQ2MzIzNTE2MjM1NQ...` |
| `DISCORD_LOG_CHANNEL_ID` | `1469322569533624373` |
| `OPENAI_API_KEY` | `sk-proj-...` |
| `GEMINI_API_KEY` | `AIzaSyDXShJ3ugrj5ILtVyjI4b9sGAGHGI9pegE` |
| `GEMINI_API_KEY_1-4` | (Add keys 1 through 4 as provided) |
| `GROQ_API_KEY` | `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` |
| `SAMBANOVA_API_KEY` | `4e758b94-8eda-41a1-8c34-51856fa42ef0` |
| `NVIDIA_API_KEY` | `nvapi-V_fckzuryu5No-Tu7KqUAv2hPwVA1XaNEUFfJVkr9Lk5gnJNe...` |
| `OWNER_PERSONAL_PHONE` | `0772148511` |
| `SERANEX_API` | `http://localhost:3000/api/whatsapp/incoming` |
| `ZAPTOBOX_URL` | `http://localhost:3333` |
| `ZAPTOBOX_TOKEN` | `seraauto_zaptobox_secret_token_2026` |

---

## 4. How to Update Your Bot

Whenever you push new code to Git, run these commands on the VM:

```bash
cd ~/sera-ai
git pull origin main

# Update Main Bot
npm install
npm run build
pm2 restart seranex-api

# Update Discord Bot
cd discord-bot
npm install
pm2 restart seranex-discord
```

---

## 5. Webhook Configuration

Once the bot is running, configure your Zaptobox Dashboard with:

- **Webhook URL**: `http://[YOUR_VM_IP]:3000/api/whatsapp/zaptobox`
