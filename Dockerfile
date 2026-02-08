# Use Node.js 20 base image
FROM node:20-slim

# Install system dependencies for Puppeteer/Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libasound2 \
    libgbm-dev \
    fonts-liberation \
    libappindicator3-1 \
    libxshmfence1 \
    lsb-release \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use the installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy root dependencies first for caching
COPY package*.json ./
RUN npm install

# Build Next.js app
COPY . .
RUN npm run build

# Setup WhatsApp Bot dependencies
WORKDIR /app/whatsapp-bot
RUN npm install

# Setup Discord Bot dependencies
WORKDIR /app/discord-bot
RUN npm install

# Install PM2 globally to manage multiple processes
RUN npm install -g pm2

# Final workdir back to root
WORKDIR /app

# Cloud Run defaults to port 8080 or uses the PORT env var
# Our ecosystem.config.js uses PORT 3000 by default, so we'll match that
EXPOSE 3000

# Start both API and Bot using PM2-Runtime
CMD ["pm2-runtime", "ecosystem.config.js"]
