/**
 * Seranex WhatsApp Bot (Baileys Engine)
 * Replaces whatsapp-web.js to completely eliminate Chrome/Puppeteer issues on GCP.
 */

import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import mongoose from 'mongoose';
import cron from 'node-cron';
import moment from 'moment';
import axios from 'axios';
import pino from 'pino';

// Baileys imports
import pkg from '@whiskeysockets/baileys';
// Defensive extraction for ESM/CJS interop
const makeWASocket = pkg.default || pkg;
const useMultiFileAuthState = pkg.useMultiFileAuthState || pkg.default?.useMultiFileAuthState;
const DisconnectReason = pkg.DisconnectReason || pkg.default?.DisconnectReason;
const downloadMediaMessage = pkg.downloadMediaMessage || pkg.default?.downloadMediaMessage;
const fetchLatestBaileysVersion = pkg.fetchLatestBaileysVersion || pkg.default?.fetchLatestBaileysVersion;

const momentFixed = moment.default || moment;

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
let sock; // Global Baileys socket

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
                content: `🔐 **WhatsApp Login QR (Baileys)**\n${details.qr_link}`
            });
            return;
        }

        const colors = { info: 0x3498DB, success: 0x2ECC71, warning: 0xF39C12, error: 0xE74C3C };

        await axios.post(DISCORD_CONSOLE_WEBHOOK, {
            embeds: [{
                title: `${level.toUpperCase()}: ${message.substring(0, 200)}`,
                color: colors[level] || 0x95A5A6,
                description: details ? `\`\`\`json\n${JSON.stringify(details, null, 2).substring(0, 2000)}\n\`\`\`` : undefined,
                footer: { text: 'Seranex WhatsApp Bot (Baileys)' },
                timestamp: new Date().toISOString()
            }]
        });
    } catch (err) {
        console.error(`❌ [Discord Log Failed]: ${err.message}`);
    }
}

// ===============================================
// INTERNAL MANAGEMENT SERVER 
// ===============================================
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('Seranex Baileys Bot is running'));

app.post('/send-message', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!sock) return res.status(503).json({ success: false, error: 'Client not ready' });
        if (!phone || !message) return res.status(400).json({ success: false, error: 'Missing info' });

        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });

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
        if (!sock) return false;
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        log('send', `Admin notification sent to ${phone}`);
        return true;
    } catch (error) {
        log('error', `Failed to send to ${phone}: ${error.message}`);
        return false;
    }
};

// ===============================================
// WHATSAPP CLIENT SETUP (BAILEYS)
// ===============================================

async function startBot() {
    log('info', 'Seranex Lanka WhatsApp Bot (Baileys v2.1) Starting...');
    log('info', `API Endpoint: ${SERANEX_API}`);

    if (MONGODB_URI) {
        try {
            await mongoose.connect(MONGODB_URI);
            log('success', 'Connected to MongoDB!');
        } catch (e) {
            log('error', `MongoDB connection failed: ${e.message}`);
        }
    }

    try {
        const authPath = './baileys_auth_info';
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authPath);

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'silent' }),
            browser: ['Seranex Auto', 'Chrome', '1.0.0']
        });

        sock.ev.on('creds.update', saveCreds);
    } catch (err) {
        log('error', `Failed to initialize Baileys: ${err.message}`, err);
        return;
    }

    // Connection Updates (QR / Logged In / Disconnect)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            log('info', '📱 WhatsApp QR Code generated');
            logToDiscord('info', '🔐 WhatsApp Login QR Available', {
                message: 'Scan this QR code with your phone (Linked Devices) to log in.',
                qr_link: qrImageUrl
            });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            log('warning', 'Connection closed due to', { reason: lastDisconnect.error?.message, shouldReconnect });
            logToDiscord('error', 'WhatsApp disconnected', { reason: lastDisconnect.error?.message });

            if (shouldReconnect) {
                log('info', 'Reconnecting...');
                startBot();
            } else {
                log('error', '🚨 Logged out! You must delete the "baileys_auth_info" folder and restart to generate a new QR.');
            }
        } else if (connection === 'open') {
            log('success', 'Seranex Lanka WhatsApp Bot is READY!');
            log('info', '📨 Listening for incoming messages...');
            logToDiscord('success', 'Bot is now online and ready (Baileys Engine)');
        }
    });

    // ===============================================
    // CALL HANDLER (Baileys)
    // ===============================================
    sock.ev.on('call', async (calls) => {
        for (const call of calls) {
            if (call.status === 'offer') {
                log('warning', `Missed call from ${call.from}`);
                setTimeout(async () => {
                    try {
                        const reply = '📞 *Missed Call Auto-Reply*\n\nSorry for the missed call! 📵\nWe have notified our admin and will get back to you as soon as possible. 👤\n\nIn the meantime, you can chat with **Sera** (our AI Assistant) right here! 👇\nJust type your question or requirement.';
                        await sock.sendMessage(call.from, { text: reply });
                    } catch (e) {
                        console.error('Failed to send missed call reply');
                    }
                }, 15000);
            }
        }
    });

    // ===============================================
    // MESSAGE HANDLER
    // ===============================================
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return; // Ignore appended messages

        for (const msg of m.messages) {
            if (!msg.message) continue;

            const remoteJid = msg.key.remoteJid;
            const isGroup = remoteJid.includes('@g.us');
            const isStatus = remoteJid === 'status@broadcast';

            if (CONFIG.IGNORE_STATUS && isStatus) continue;
            if (CONFIG.IGNORE_GROUPS && isGroup) {
                if (CONFIG.LOG_MESSAGES) log('warning', `Ignored group message from ${remoteJid}`);
                continue;
            }

            const fromMe = msg.key.fromMe;
            const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
            const customerName = msg.pushName || 'Customer';

            // Extract text/media content properly
            let messageText = '';
            let isVoice = false;
            let mimeType = '';
            let imageBase64 = null;

            const messageType = Object.keys(msg.message)[0];
            const realMessage = msg.message[messageType];

            if (messageType === 'conversation') {
                messageText = realMessage;
            } else if (messageType === 'extendedTextMessage') {
                messageText = realMessage.text;
            } else if (messageType === 'imageMessage') {
                messageText = realMessage.caption || '';
                mimeType = realMessage.mimetype || 'image/jpeg';
            } else if (messageType === 'videoMessage') {
                messageText = realMessage.caption || '';
            } else if (messageType === 'audioMessage') {
                isVoice = realMessage.ptt || false;
                mimeType = realMessage.mimetype;
            } else {
                continue; // System message, etc
            }

            // If I sent the message manually from phone
            if (fromMe && remoteJid) {
                if (messageText && !remoteJid.includes('@g.us')) {
                    try {
                        await axios.post(SERANEX_API.replace('/incoming', '/log-message'), {
                            phone: phoneNumber,
                            message: messageText,
                            role: 'assistant'
                        });
                        log('info', `[Auto-Pause] Logged manual reply for ${phoneNumber}. AI will step back.`);
                    } catch (e) { }
                }
                continue;
            }

            // Admin Pause Commands
            if (ADMIN_PHONES.includes(phoneNumber)) {
                if (messageText.toLowerCase() === '!sera pause') {
                    IS_BOT_PAUSED = true;
                    await sock.sendMessage(remoteJid, { text: '⏸️ Bot paused! I will stop replying until you say !sera continue' });
                    log('warning', `Bot paused by admin ${phoneNumber}`);
                    return;
                }
                if (messageText.toLowerCase() === '!sera continue') {
                    IS_BOT_PAUSED = false;
                    await sock.sendMessage(remoteJid, { text: '▶️ Bot resumed! I am back online.' });
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
            if (isVoice) {
                if (!CONFIG.VOICE_SUPPORT) {
                    await sock.sendMessage(remoteJid, { text: '🎤 Voice message support එන්න ඉන්නවා. Please text කරන්න. 🙏' });
                    return;
                }

                try {
                    log('info', `🎤 Processing voice from ${customerName}...`);
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    const base64Audio = buffer.toString('base64');

                    const response = await axios.post(SERANEX_API.replace('/incoming', '/transcribe'), {
                        audioBase64: base64Audio,
                        mimeType: mimeType
                    });

                    if (response.data.success && response.data.text) {
                        messageText = response.data.text;
                        log('success', `📝 Transcribed: "${messageText}"`);
                    } else {
                        log('error', 'Transcription failed - no text returned');
                        await sock.sendMessage(remoteJid, { text: 'Meka ahuwe nane sir. Type karanna kiyananako? 🙏 (AI error)' });
                        return;
                    }
                } catch (err) {
                    log('error', `Voice transcribe err: ${err.message}`);
                    await sock.sendMessage(remoteJid, { text: 'Voice eka process karanna podi error ekak awa sir. Type karanna please. 🙏' });
                    return;
                }
            }

            // Handle Image Download
            if (messageType === 'imageMessage') {
                try {
                    log('info', `🖼️ Processing image from ${customerName}...`);
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    imageBase64 = buffer.toString('base64');
                } catch (err) {
                    log('error', `Image download err: ${err.message}`);
                }
            }

            // Skip empty messages
            if ((!messageText || messageText.trim() === '') && !isVoice && !imageBase64) return;

            // Optional message logging
            let logMsg = messageText ? messageText.substring(0, 80) : '';
            if (imageBase64) logMsg += ' [IMAGE]';
            log('receive', `${customerName} (${phoneNumber}): ${logMsg}...`);

            // AI Processing
            if (CONFIG.AUTO_TYPING) {
                await sock.sendPresenceUpdate('composing', remoteJid);
            }

            let aiReply = '';
            let mood = 'neutral';
            let aiActions = [];

            try {
                const response = await axios.post(SERANEX_API, {
                    phone: phoneNumber,
                    message: messageText || (imageBase64 ? '[IMAGE_ATTACHED]' : ''),
                    name: customerName,
                    isVoice: isVoice,
                    imageBase64: imageBase64,
                    mimeType: mimeType
                }, { timeout: CONFIG.TIMEOUT });

                aiReply = response.data.reply || '';
                mood = response.data.mood || 'neutral';
                aiActions = response.data.actions || [];

                // Mood Alert
                if (mood === 'angry' || mood === 'frustrated') {
                    const alertMsg = `🚨 *Mood Alert!* 🚨\n\nCustomer *${customerName}* (${phoneNumber}) is feeling *${mood.toUpperCase()}*.\n\n💬 *Last Msg*: "${messageText}"\n\nPlease check ASAP!`;
                    try {
                        await sock.sendMessage(`${ADMIN_PHONES[0]}@s.whatsapp.net`, { text: alertMsg });
                    } catch (e) { }
                }

            } catch (error) {
                log('error', 'API call failed:', error.message);
                if (CONFIG.AUTO_TYPING) await sock.sendPresenceUpdate('paused', remoteJid);

                const status = error.response ? error.response.status : null;
                let errText = 'Technical issue ekak sir. Poddak inna. 🙏';
                if (status === 429) errText = 'AI poddak busy sir. Tikenakin try karamu da? 🙏';
                await sock.sendMessage(remoteJid, { text: errText });
                return;
            }

            if (CONFIG.AUTO_TYPING) {
                await sock.sendPresenceUpdate('paused', remoteJid);
            }

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
                        const audioBuffer = Buffer.from(speech.data.audioBase64, 'base64');
                        await sock.sendMessage(remoteJid, {
                            audio: audioBuffer,
                            ptt: true,
                            mimetype: 'audio/mpeg'
                        });
                        log('send', `Voice reply sent to ${phoneNumber}`);
                    } else {
                        await sock.sendMessage(remoteJid, { text: aiReply });
                    }
                } catch (e) {
                    log('error', `TTS Failed: ${e.message}`);
                    await sock.sendMessage(remoteJid, { text: aiReply });
                }
            } else if (aiReply.trim() !== '') {
                log('send', `Reply (${mood}): ${aiReply.substring(0, 80)}...`);
                await sock.sendMessage(remoteJid, { text: aiReply });
            }

            // ACTIONS
            for (const action of aiActions) {
                try {
                    log('info', `⚡ Executing Action: ${action.type}`);
                    const targetJid = action.to === 'CUSTOMER' ? remoteJid : `${action.to.replace(/\D/g, '')}@s.whatsapp.net`;

                    if (action.type === 'SEND_TEXT') {
                        await sock.sendMessage(targetJid, { text: action.text });
                    } else if (action.type === 'SEND_LOCATION') {
                        await sock.sendMessage(targetJid, { location: { degreesLatitude: action.latitude, degreesLongitude: action.longitude, name: action.description } });
                    } else if (action.type === 'SEND_FILE' && action.path) {
                        if (fs.existsSync(action.path)) {
                            const buffer = fs.readFileSync(action.path);
                            // Simple mimetype guessing based on extension
                            let mimetype = 'application/pdf';
                            if (action.path.endsWith('.jpg') || action.path.endsWith('.png')) mimetype = 'image/jpeg';

                            await sock.sendMessage(targetJid, { document: buffer, caption: action.caption || '', mimetype, fileName: action.path.split('/').pop() });
                        } else if (action.path.startsWith('http')) {
                            // Download from URL
                            const res = await axios.get(action.path, { responseType: 'arraybuffer' });
                            const ct = res.headers['content-type'];
                            const fileName = action.path.split('/').pop() || 'document.pdf';

                            if (ct && ct.includes('image')) {
                                await sock.sendMessage(targetJid, { image: res.data, caption: action.caption || '' });
                            } else {
                                await sock.sendMessage(targetJid, { document: res.data, caption: action.caption || '', mimetype: ct || 'application/pdf', fileName });
                            }
                        }
                    } else if (action.type === 'NOTIFY_STAFF') {
                        await sock.sendMessage(`${action.phone.replace(/\D/g, '')}@s.whatsapp.net`, { text: action.message_content });
                    }
                } catch (e) {
                    log('error', `Action error: ${e.message}`);
                }
            }

        }
    });

    // ===============================================
    // CRON JOBS
    // ===============================================

    cron.schedule('0 6 * * *', async () => {
        const today = momentFixed();
        const examDay = momentFixed(EXAM_DATE);
        const daysLeft = examDay.diff(today, 'days');
        const message = `🌅 *Good Morning, Boss!* \n\n📚 *Exam Countdown*: **${daysLeft} Days** left until O/Ls!\n🎯 *Focus Mode*: ACTIVATED.\n\n"Success is the sum of small efforts, repeated day in and day out." 💪\nLet's crush it today!`;
        try {
            await sock.sendMessage(`${OWNER_PHONE}@s.whatsapp.net`, { text: message });
            log('info', 'Sent exam countdown message');
        } catch (err) { }
    });

    cron.schedule('0 20 * * 0', async () => {
        log('info', '📊 Running Weekly Financial Report Cron...');
        try {
            const reportUrl = SERANEX_API.replace('/whatsapp/incoming', '/finance/report');
            const response = await axios.get(reportUrl);
            if (response.data && response.data.success) {
                const ownerJid = `${ADMIN_PHONES[0]}@s.whatsapp.net`;
                await sock.sendMessage(ownerJid, { text: response.data.report });
                log('success', 'Sent weekly financial report to owner.');
            }
        } catch (e) {
            log('error', 'Sunday Report Failed:', e.message);
        }
    });
}

// Global Exception Handlers
process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    log('error', 'Uncaught Exception:', err.message);
});

// START
startBot();
