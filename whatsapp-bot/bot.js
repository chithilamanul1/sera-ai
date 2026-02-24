/**
 * Seranex WhatsApp Bot (whatsapp-web.js Engine)
 * Replaces Baileys to eliminate MAC decryption errors with real headless browser syncing.
 * Includes aggressive Puppeteer memory mitigations for GCP.
 */

import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import mongoose from 'mongoose';
import cron from 'node-cron';
import moment from 'moment';
import axios from 'axios';
import pino from 'pino';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';

// --- DATABASE MODELS ---
const MutedContactSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    reason: { type: String, default: 'Human Handoff' },
    mutedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date }
});
const MutedContact = mongoose.models.MutedContact || mongoose.model('MutedContact', MutedContactSchema);

// ===============================================
// CONFIGURATION
// ===============================================

const API_BASE = process.env.SERANEX_API_BASE || 'http://127.0.0.1:3000';
const SERANEX_API = `${API_BASE}/api/whatsapp/incoming`;
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '94768290477,94772148511').split(',');
const DISCORD_CONSOLE_WEBHOOK = (process.env.DISCORD_CONSOLE_WEBHOOK || '').trim();
const MONGODB_URI = process.env.MONGODB_URI;

// --- EXAM MODE CONFIG ---
const EXAM_DATE = '2026-05-18';
const OWNER_PHONE = process.env.OWNER_PHONE || ADMIN_PHONES[0];

const CONFIG = {
    AUTO_TYPING: true,
    IGNORE_GROUPS: true,
    IGNORE_STATUS: true,
    LOG_MESSAGES: true,
    VOICE_SUPPORT: true,
    VOICE_REPLY: true,
    MAX_RETRIES: 3,
    TIMEOUT: 60000,
};

let IS_BOT_PAUSED = false;

// ===============================================
// LOGGING
// ===============================================

function log(level, message, data = null) {
    const timestamp = new Date().toLocaleString('en-LK');
    const emoji = { info: '📘', success: '✅', warning: '⚠️', error: '❌', message: '💬', send: '📤', receive: '📩' };
    const prefix = emoji[level] || '📝';
    console.log(`${prefix} [${timestamp}] ${message}`);

    if (data && CONFIG.LOG_MESSAGES) {
        if (data instanceof Error) {
            console.log('   └─', data.stack || data.message);
        } else {
            console.log('   └─', JSON.stringify(data).substring(0, 500));
        }
    }

    if (level === 'error' || level === 'warning') {
        logToDiscord(level, message, data);
    }
}

async function logToDiscord(level, message, details = null) {
    if (!DISCORD_CONSOLE_WEBHOOK || !DISCORD_CONSOLE_WEBHOOK.startsWith('http')) return;

    try {
        if (details && details.qr_link) {
            await axios.post(DISCORD_CONSOLE_WEBHOOK, {
                content: `🔐 **WhatsApp Login QR (Web.js)**\n${details.qr_link}`
            });
            return;
        }

        const colors = { info: 0x3498DB, success: 0x2ECC71, warning: 0xF39C12, error: 0xE74C3C };

        await axios.post(DISCORD_CONSOLE_WEBHOOK, {
            embeds: [{
                title: `${level.toUpperCase()}: ${message.substring(0, 200)}`,
                color: colors[level] || 0x95A5A6,
                description: details ? `\`\`\`json\n${JSON.stringify(details, null, 2).substring(0, 2000)}\n\`\`\`` : undefined,
                footer: { text: 'Seranex WhatsApp Bot (Web.js)' },
                timestamp: new Date().toISOString()
            }]
        });
    } catch (err) {
        console.error(`❌ [Discord Log Failed]: ${err.message}`);
    }
}

// ===============================================
// WHATSAPP CLIENT SETUP (whatsapp-web.js)
// ===============================================

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './whatsapp_auth_data'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Fix GCP Memory Issues
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// ===============================================
// INTERNAL MANAGEMENT SERVER 
// ===============================================
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('Seranex Web.js Bot is running'));

app.post('/send-message', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!client.info) return res.status(503).json({ success: false, error: 'Client not ready' });
        if (!phone || !message) return res.status(400).json({ success: false, error: 'Missing info' });

        const jid = phone.includes('@c.us') ? phone : `${phone.replace(/\D/g, '')}@c.us`;
        await client.sendMessage(jid, message);

        log('send', `API sent message to ${jid}`);
        res.json({ success: true });
    } catch (err) {
        log('error', `Failed to send API message: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(3001, () => {
    log('success', '📡 Internal Management Server running on port 3001');
});

// Admin global function
global.sendWhatsAppMessage = async (phone, message) => {
    try {
        if (!client.info) return false;
        const jid = phone.includes('@') ? phone : `${phone}@c.us`;
        await client.sendMessage(jid, message);
        log('send', `Admin notification sent to ${phone}`);
        return true;
    } catch (error) {
        log('error', `Failed to send to ${phone}: ${error.message}`);
        return false;
    }
};

// ===============================================
// EVENTS
// ===============================================

client.on('qr', (qr) => {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
    log('info', '📱 WhatsApp QR Code generated');
    qrcode.generate(qr, { small: true });
    console.log(`\n🔗 QR Image URL: ${qrImageUrl}\n`);
    logToDiscord('info', '🔐 WhatsApp Login QR Available', {
        message: 'Scan this QR code with your phone to log in.',
        qr_link: qrImageUrl
    });
});

client.on('ready', () => {
    log('success', 'Seranex Lanka WhatsApp Bot is READY! (Web.js Engine)');
    log('info', '📨 Listening for incoming messages...');
    logToDiscord('success', 'Bot is now online and ready (Web.js Engine)');
});

client.on('authenticated', () => {
    log('success', '✅ Authenticated successfully.');
});

client.on('auth_failure', (msg) => {
    log('error', `AUTHENTICATION FAILURE: ${msg}`);
});

client.on('disconnected', (reason) => {
    log('error', `🚨 Client was logged out: ${reason}`);
    log('error', 'Restarting process to ensure clean exit.');
    process.exit(1);
});

client.on('call', async (call) => {
    log('warning', `Missed call from ${call.from}`);
    setTimeout(async () => {
        try {
            const reply = '📞 *Missed Call Auto-Reply*\n\nSorry for the missed call! 📵\nWe have notified our admin and will get back to you as soon as possible. 👤\n\nIn the meantime, you can chat with **Sera** (our AI Assistant) right here! 👇\nJust type your question or requirement.';
            await client.sendMessage(call.from, reply);
        } catch (e) {
            console.error('Failed to send missed call reply');
        }
    }, 15000);
});

// ===============================================
// MESSAGE HANDLER
// ===============================================

client.on('message_create', async (msg) => {
    const fromMe = msg.fromMe;
    const remoteJid = msg.from; // e.g., 94772148511@c.us
    const to = msg.to;

    // We process incoming messages AND outgoing messages (to detect manual replies)
    const phoneNumber = (fromMe ? to : remoteJid).replace('@c.us', '').replace('@g.us', '');
    const isGroup = remoteJid.includes('@g.us') || to.includes('@g.us');
    const isStatus = remoteJid === 'status@broadcast' || to === 'status@broadcast';

    if (CONFIG.IGNORE_STATUS && isStatus) return;
    if (CONFIG.IGNORE_GROUPS && isGroup) return;

    let messageText = msg.body;
    let isVoice = false;
    let mimeType = '';
    let imageBase64 = null;
    let customerName = 'Customer';

    try {
        const contact = await msg.getContact();
        customerName = contact.name || contact.pushname || 'Customer';
    } catch (e) { }

    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            if (media) {
                mimeType = media.mimetype;
                if (mimeType.includes('image')) {
                    imageBase64 = media.data;
                } else if (mimeType.includes('audio') || mimeType.includes('ptt')) {
                    isVoice = true;
                    // web.js doesn't give a direct base64 for audio processing easily without media.data,
                    // we can use media.data which is base64 encoded.
                    imageBase64 = media.data;
                }
            }
        } catch (err) {
            log('error', `Media download err: ${err.message}`);
        }
    }

    // If I sent the message manually from phone
    if (fromMe) {
        if (messageText && !isGroup) {
            try {
                await axios.post(SERANEX_API.replace('/incoming', '/log-message'), {
                    phone: phoneNumber,
                    message: messageText,
                    role: 'assistant'
                });
                log('info', `[Auto-Pause] Logged manual reply for ${phoneNumber}. AI will step back.`);
            } catch (e) { }
        }
        return;
    }

    // Admin Pause Commands
    if (ADMIN_PHONES.includes(phoneNumber)) {
        if (messageText.toLowerCase() === '!sera pause') {
            IS_BOT_PAUSED = true;
            await msg.reply('⏸️ Bot paused! I will stop replying until you say !sera continue');
            log('warning', `Bot paused by admin ${phoneNumber}`);
            return;
        }
        if (messageText.toLowerCase() === '!sera continue') {
            IS_BOT_PAUSED = false;
            await msg.reply('▶️ Bot resumed! I am back online.');
            log('success', `Bot resumed by admin ${phoneNumber}`);
            return;
        }
    }

    // Human Handoff (Muted Contacts)
    const isMuted = await MutedContact.findOne({ phone: phoneNumber });
    if (isMuted) {
        if (isMuted.expiresAt && new Date() > isMuted.expiresAt) {
            await MutedContact.deleteOne({ phone: phoneNumber });
            log('info', `🔊 AI Auto-unmuted for ${phoneNumber} (Session Expired)`);
        } else {
            return;
        }
    }

    if (IS_BOT_PAUSED && !ADMIN_PHONES.includes(phoneNumber)) return;

    // Handle Voice Transcription
    if (isVoice && imageBase64) {
        if (!CONFIG.VOICE_SUPPORT) {
            await msg.reply('🎤 Voice message support එන්න ඉන්නවා. Please text කරන්න. 🙏');
            return;
        }
        try {
            log('info', `🎤 Processing voice from ${customerName}...`);
            const response = await axios.post(SERANEX_API.replace('/incoming', '/transcribe'), {
                audioBase64: imageBase64,
                mimeType: mimeType
            });

            if (response.data.success && response.data.text) {
                messageText = response.data.text;
                log('success', `📝 Transcribed: "${messageText}"`);
            } else {
                log('error', 'Transcription failed - no text returned');
                await msg.reply('Meka ahuwe nane sir. Type karanna kiyananako? 🙏 (AI error)');
                return;
            }
        } catch (err) {
            log('error', `Voice transcribe err: ${err.message}`);
            await msg.reply('Voice eka process karanna podi error ekak awa sir. Type karanna please. 🙏');
            return;
        }
    }

    // Skip empty messages
    if ((!messageText || messageText.trim() === '') && !isVoice && !imageBase64) return;

    let logMsg = messageText ? messageText.substring(0, 80) : '';
    if (msg.hasMedia && !isVoice) logMsg += ' [IMAGE]';
    log('receive', `${customerName} (${phoneNumber}): ${logMsg}...`);

    let aiReply = '';
    let mood = 'neutral';
    let aiActions = [];

    // Simulate typing
    const chat = await msg.getChat();
    if (CONFIG.AUTO_TYPING) await chat.sendStateTyping();

    try {
        const botNumber = client.info?.wid?.user || process.env.BOT_PHONE;

        const response = await axios.post(SERANEX_API, {
            phone: phoneNumber,
            botNumber: botNumber, // Built-in Web.js Client Info
            message: messageText || (msg.hasMedia && !isVoice ? '[IMAGE_ATTACHED]' : ''),
            name: customerName,
            isVoice: isVoice,
            imageBase64: !isVoice && msg.hasMedia ? imageBase64 : null,
            mimeType: !isVoice && msg.hasMedia ? mimeType : null
        }, { timeout: CONFIG.TIMEOUT });

        aiReply = response.data.reply || '';
        mood = response.data.mood || 'neutral';
        aiActions = response.data.actions || [];

        if (mood === 'angry' || mood === 'frustrated') {
            const alertMsg = `🚨 *Mood Alert!* 🚨\n\nCustomer *${customerName}* (${phoneNumber}) is feeling *${mood.toUpperCase()}*.\n\n💬 *Last Msg*: "${messageText}"\n\nPlease check ASAP!`;
            try {
                await client.sendMessage(`${ADMIN_PHONES[0]}@c.us`, alertMsg);
            } catch (e) { }
        }

    } catch (error) {
        log('error', 'API call failed:', error.message);
        if (CONFIG.AUTO_TYPING) await chat.clearState();

        const status = error.response ? error.response.status : null;
        let errText = 'Technical issue ekak sir. Poddak inna. 🙏';
        if (status === 429) errText = 'AI poddak busy sir. Tikenakin try karamu da? 🙏';
        await msg.reply(errText);
        return;
    }

    if (CONFIG.AUTO_TYPING) await chat.clearState();

    let forceVoice = false;
    if (aiReply.includes('[SEND_AS_VOICE]')) {
        aiReply = aiReply.replace('[SEND_AS_VOICE]', '').trim();
        forceVoice = true;
    }

    // Reply Voice or Text
    if ((CONFIG.VOICE_REPLY && isVoice) || forceVoice) {
        try {
            log('info', `🎤 Generating TTS for: "${aiReply.substring(0, 20)}..."`);
            const speech = await axios.post(SERANEX_API.replace('/incoming', '/speak'), { text: aiReply }, { timeout: 60000 });

            if (speech.data.success) {
                const media = new MessageMedia('audio/mpeg', speech.data.audioBase64, 'audio.mp3');
                await client.sendMessage(remoteJid, media, { sendAudioAsVoice: true });
                log('send', `Voice reply sent to ${phoneNumber}`);
            } else {
                await msg.reply(aiReply);
            }
        } catch (e) {
            log('error', `TTS Failed: ${e.message}`);
            await msg.reply(aiReply);
        }
    } else if (aiReply.trim() !== '') {
        log('send', `Reply (${mood}): ${aiReply.substring(0, 80)}...`);
        await msg.reply(aiReply);
    }

    // ACTIONS
    for (const action of aiActions) {
        try {
            log('info', `⚡ Executing Action: ${action.type}`);
            const targetJid = action.to === 'CUSTOMER' ? remoteJid : `${action.to.replace(/\D/g, '')}@c.us`;

            if (action.type === 'SEND_TEXT') {
                await client.sendMessage(targetJid, action.text);
            } else if (action.type === 'SEND_FILE' && action.path) {
                if (fs.existsSync(action.path)) {
                    const media = MessageMedia.fromFilePath(action.path);
                    await client.sendMessage(targetJid, media, { caption: action.caption || '' });
                } else if (action.path.startsWith('http')) {
                    const media = await MessageMedia.fromUrl(action.path);
                    await client.sendMessage(targetJid, media, { caption: action.caption || '' });
                }
            } else if (action.type === 'NOTIFY_STAFF') {
                await client.sendMessage(`${action.phone.replace(/\D/g, '')}@c.us`, action.message_content);
            }
        } catch (e) {
            log('error', `Action error: ${e.message}`);
        }
    }
});

// ===============================================
// CRON JOBS
// ===============================================

cron.schedule('0 6 * * *', async () => {
    const today = moment();
    const examDay = moment(EXAM_DATE);
    const daysLeft = examDay.diff(today, 'days');
    const message = `🌅 *Good Morning, Boss!* \n\n📚 *Exam Countdown*: **${daysLeft} Days** left until O/Ls!\n🎯 *Focus Mode*: ACTIVATED.\n\n"Success is the sum of small efforts, repeated day in and day out." 💪\nLet's crush it today!`;
    try {
        await client.sendMessage(`${OWNER_PHONE}@c.us`, message);
        log('info', 'Sent exam countdown message');
    } catch (err) { }
});

// START
log('info', 'Seranex Lanka WhatsApp Bot Starting...');
log('info', `Working Directory: ${process.cwd()}`);
log('info', `API Endpoint: ${SERANEX_API}`);

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI).then(() => {
        log('success', 'Connected to MongoDB!');
        client.initialize();
    }).catch((e) => log('error', `MongoDB connection failed: ${e.message}`));
} else {
    client.initialize();
}
