# 🚀 Seranex AI - Compute Engine (VM) Deployment Guide

This guide explains how to deploy the full Seranex AI system to a Google Cloud Compute Engine VM using **Git** and **PM2**.

## 1. Prerequisites

- A GCP Compute Engine VM (Ubuntu 22.04 LTS recommended).
- **SSH Access**: You should be able to SSH into your VM.
- **Git Token**: A GitHub Personal Access Token is required to clone private repos.

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

### Step 2: Clone Project

```bash
# Clone the repository
git clone https://github.com/chithilamanul1/sera-ai.git
cd sera-ai

# Create master .env file
nano .env
# (Paste variables from section 3, then press CTRL+O, ENTER, CTRL+X)
```

### Step 3: Setup WhatsApp Bot (The Engine)

```bash
cd ~/sera-ai/whatsapp-bot
npm install
cp ~/sera-ai/.env ~/sera-ai/whatsapp-bot/.env
pm2 start bot.js --name "seranex-whatsapp"
```

### Step 4: Setup API Server (Next.js)

```bash
cd ~/sera-ai
npm install
npm run build
pm2 start npm --name "seranex-api" -- start
```

### Step 5: Setup Discord Control Bot

```bash
cd ~/sera-ai/discord-bot
npm install
cp ~/sera-ai/.env ~/sera-ai/discord-bot/.env
pm2 start bot.js --name "seranex-discord"
```

### Step 6: Save PM2 State

```bash
pm2 save
pm2 startup
# (Copy and run the command PM2 gives you)
```

---

## 3. Environment Variables (Required)

Ensure your `.env` file in the root contains these variables:

| Variable | Value |
|----------|-------|
| `AI_PROVIDER` | `openai` |
| `MONGODB_URI` | `mongodb+srv://...` |
| `OPENAI_API_KEY` | `sk-proj-...` |
| `GEMINI_API_KEY` | `AIzaSy...` |
| `GROQ_API_KEY` | `gsk_...` |
| `SAMBANOVA_API_KEY` | `...` |
| `NVIDIA_API_KEY` | `nvapi-...` |
| `DISCORD_BOT_TOKEN` | `MTQ2ODY...` |
| `DISCORD_LOG_CHANNEL_ID` | `1469322569533624373` |
| `ZAPTOBOX_URL` | `http://localhost:3333` |
| `ZAPTOBOX_TOKEN` | `seraauto_zaptobox_secret_token_2026` |

---

## 4. How to Update Your Bot

Run these commands whenever you push updates to GitHub:

```bash
cd ~/sera-ai
git pull origin main

# Update WhatsApp Bot
cd  ~/sera-ai/whatsapp-bot && npm install && pm2 restart seranex-whatsapp

# Update API
cd ~/sera-ai && npm install && npm run build && pm2 restart seranex-api

# Update Discord
cd ~/sera-ai/discord-bot && npm install && pm2 restart seranex-discord
```

---

## 5. Helpful Commands

- `pm2 list`: View all running bots.
- `pm2 logs`: View real-time logs.
- `pm2 monit`: View CPU/Memory usage.
