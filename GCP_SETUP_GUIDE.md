# 🚀 Seranex AI - GCP Deployment Guide

This guide explains how to deploy the Seranex AI system to Google Cloud Platform (GCP).

## 1. Prerequisites

- A GCP Account and Project.
- Google Cloud SDK (`gcloud`) installed.
- Docker installed (if using Cloud Run).

## 2. Deployment Options

### Option A: Google Cloud Run (Recommended)

Cloud Run is the easiest way to deploy this Next.js app.

1. **Build and Submit Image**:

   ```bash
   gcloud builds submit --tag gcr.io/[PROJECT_ID]/seraauto
   ```

2. **Deploy**:

   ```bash
   gcloud run deploy seraauto \
     --image gcr.io/[PROJECT_ID]/seraauto \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

### Option B: Compute Engine (VPS)

If you prefer a standard VM:

1. Create a VM instance (e2-medium recommended).
2. Install Node.js & Docker.
3. Clone the repo and run with PM2 or Docker Compose.

## 3. Environment Variables (Critical)

You MUST set these variables in the GCP Console (Cloud Run -> Edit & Deploy New Revision -> Variables):

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Your MongoDB connection string. |
| `ZAPTOBOX_URL` | Your Zaptobox instance URL. |
| `ZAPTOBOX_TOKEN` | Your Zaptobox secret token. |
| `DISCORD_WEBHOOK_URL` | Webhook for error logs. |
| `OPENAI_API_KEY` | OpenAI Key. |
| `GEMINI_API_KEY` | Primary Gemini Key. |
| `GROQ_API_KEY` | Groq Key. |
| `SAMBANOVA_API_KEY` | SambaNova Key. |
| `NVIDIA_API_KEY` | NVIDIA Key. |

## 4. Webhook Configuration

Once deployed, copy your Service URL (e.g., `https://seraauto-xyz.a.run.app`) and update your Zaptobox dashboard:

- **Webhook URL**: `https://your-url.a.run.app/api/whatsapp/zaptobox`

## 5. Manual AI Override

The system automatically pauses the AI for a customer if you (the owner) reply manually from your WhatsApp app. To unpause, use the admin command:

- `!unpause [phone_number]`
