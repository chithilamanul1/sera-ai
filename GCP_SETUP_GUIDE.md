# 🚀 Seranex Auto: Google Cloud (Vercel Style) Setup Guide

This guide explains how to get a "Push to Deploy" setup like Vercel using Google Cloud Run.

## 1. Method A: Cloud Build Trigger (Easiest & No Keys Needed!)

If you don't have permission to create Service Account keys, use this method. It's exactly like Vercel's GitHub integration.

1. **Go to Cloud Run**: In the [GCP Console](https://console.cloud.google.com/run).
2. **Create Service**: Click "Create Service".
3. **Connect Source**: Select "Continuously deploy new revisions from a source repository".
4. **Setup Cloud Build**:
   - Click "Set up with Cloud Build".
   - Select "GitHub" as the provider.
   - Select your repository (`seraauto`).
5. **Build Configuration**:
   - **Branch**: `^main$` (or your primary branch).
   - **Build Type**: Select **Dockerfile**.
   - **Source Context**: `/Dockerfile` (Leave it as default `/`).
6. **Cloud Run Settings**:
   - **Autoscaling**: Min 1 instance (Required for WhatsApp bot persistence).
   - **Ingress**: "Allow all traffic".
   - **Authentication**: "Allow unauthenticated invocations".
   - **Container Port**: `3000`.
   - **CPU**: "Always allocated".

---

## 2. Method B: GitHub Actions (Requires Keys)

(Use this only if you prefer managing the build in GitHub and have `IAM Admin` permissions)

Add these to your **GitHub Repository Settings > Secrets and Variables > Actions**:

- `GCP_PROJECT_ID`: Your Project ID (e.g., `seraauto-12345`).
- `GCP_SA_KEY`: Paste the entire content of that JSON key you downloaded.

## 3. Deployment Configuration (The Docker Way)

I have already created:

- [Dockerfile](file:///e:/desktop/seraauto/Dockerfile): Bundles the API and WhatsApp Bot.
- [deploy.yml](file:///e:/desktop/seraauto/.github/workflows/deploy.yml): The GitHub Action that triggers on push.

### Why this is better than a VM?

- **Auto-Scaling**: Only uses resources when needed (though we keep 1 instance alive for WhatsApp).
- **Vercel Experience**: Just `git push origin main` and watch the magic happen.
- **Rollbacks**: Each push creates a revision. You can roll back in 1 click.

## 4. Database (IMPORTANT)

Do NOT host MongoDB inside the container.

1. Use **MongoDB Atlas** (Free tier is fine).
2. Add your `MONGODB_URI` to the Cloud Run environment variables in the GCP Console.

## 5. Persistence (WhatsApp Session)

Cloud Run instances are "ephemeral". If the instance restarts, you will have to scan the QR code again.
**Solution**:

- In the future, we can mount a "Cloud Storage" bucket to keep the `.wwebjs_auth` folder persistent.
- For now, scanning once per deploy is the simplest way.
