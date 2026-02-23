# 🚀 Seranex AI - Compute Engine (VM) Deployment Guide

This guide explains how to deploy the Seranex AI system to a Google Cloud Compute Engine VM using **Git** and **PM2**.

## 1. Prerequisites

- A GCP Compute Engine VM (Ubuntu 22.04 LTS or similar).
- Google Cloud SDK (`gcloud`) installed.
- **SSH Access**: You should be able to SSH into your VM.

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
# Clone the repository
git clone https://github.com/chithilamanul1/sera-ai.git
cd sera-ai

# Install dependencies
npm install

# Build the Next.js app
npm run build
```

### Step 3: Configure Environment Variables

Create a `.env` file and add all your keys (see section 3 for details):

```bash
nano .env
# (After pasting your variables, press CTRL+O, ENTER, CTRL+X to save)
```

### Step 4: Start with PM2

```bash
# Start the production server
pm2 start npm --name "seranex" -- start

# Configure PM2 to start on boot
pm2 save
pm2 startup
# (Run the command PM2 provides in the terminal output)
```

---

## 3. Environment Variables (Required)

Ensure your `.env` file contains at least these variables:

| Variable | Value |
|----------|-------|
| `AI_PROVIDER` | `openai` |
| `MONGODB_URI` | `mongodb+srv://furynetworkslk_db_user:xPD9sZY3Wps7euhi@serabot.4rnpgr5.mongodb.net/?appName=serabot` |
| `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/1469322793618243827/wFHjBB_09oKZzELmh5LrJTxcywsqRw99pad4U0kxPA7nfDy6n3Kc4Dt9oEenrjNP5IZx` |
| `DISCORD_ADMIN_IDS` | `1448949659451265045` |
| `DISCORD_BOT_TOKEN` | `MTQ2ODY0NjQ2MzIzNTE2MjM1NQ.GtmqA4.c_Lt6FnnVM2-BaIUQuJCD8Nid8Pcke-Bv3Xidw` |
| `DISCORD_LOG_CHANNEL_ID` | `1469322569533624373` |
| `OPENAI_API_KEY` | `sk-proj...` |
| `GEMINI_API_KEY` | `AIzaSyDXShJ3ugrj5ILtVyjI4b9sGAGHGI9pegE` |
| `GEMINI_API_KEY_1` | `AIzaSyAJv-lGzbkugfjn4DNXeGWFVh1pvp6MySg` |
| `GEMINI_API_KEY_2` | `AIzaSyDWZAtKeuFb6InlwwgAJmRjq-Y_JZEnbR4` |
| `GEMINI_API_KEY_3` | `AIzaSyBh-Jm_uOLyZXvnvigojSGW6eG2D-mG-08` |
| `GEMINI_API_KEY_4` | `AIzaSyC-1Oj73JVFC5ROJdANCqbKjb-YnaYQbAI` |
| `GROQ_API_KEY` | `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` |
| `SAMBANOVA_API_KEY` | `4e758b94-8eda-41a1-8c34-51856fa42ef0` |
| `NVIDIA_API_KEY` | `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` |
| `OWNER_PERSONAL_PHONE` | `0772148511` |
| `SERANEX_API` | `http://localhost:3000/api/whatsapp/incoming` |
| `ZAPTOBOX_URL` | `http://localhost:3333` |
| `ZAPTOBOX_TOKEN` | `your_secret_token` |

---

## 4. How to Update Your Bot

Whenever you push new code to Git, run these commands on the VM:

```bash
cd sera-ai
git pull origin main
npm install
npm run build
pm2 restart seranex
```

---

## 5. Webhook Configuration

Once the bot is running, configure your Zaptobox Dashboard with:

- **Webhook URL**: `http://[YOUR_VM_IP]:3000/api/whatsapp/zaptobox`
