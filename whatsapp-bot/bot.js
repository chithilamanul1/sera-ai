/**
 * White-Label WhatsApp AI Bot
 * Configurable bot for any business - can be resold
 * 
 * Features:
 * - Connects via QR code scan (like WhatsApp Web)
 * - Forwards messages to AI API
 * - Config-based branding and services
 * - Voice message transcription (coming soon)
 * - Status message filtering
 * - Auto-typing indicator
 * - Admin notifications
 * - Error handling with Discord logging
 */

import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, RemoteAuth, MessageMedia, Location } = pkg;
import qrcode from 'qrcode-terminal';
import axios from 'axios';
import cron from 'node-cron';
import moment from 'moment';
import mongoose from 'mongoose';
import { MongoStore } from 'wwebjs-mongo';

// ===============================================
// CONFIGURATION
// ===============================================

const SERANEX_API = process.env.SERANEX_API || 'http://localhost:3000/api/whatsapp/incoming';
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '94768290477,94772148511').split(',');
const DISCORD_CONSOLE_WEBHOOK = process.env.DISCORD_CONSOLE_WEBHOOK || '';
const MONGODB_URI = process.env.MONGODB_URI;

// --- EXAME MODE CONFIG ---
const EXAM_DATE = '2026-05-18'; // O/L Exam Date (Placeholder)
const OWNER_PHONE = process.env.OWNER_PHONE || '94728382638'; // Replaced hardcoded number

// Feature toggles (inspired by KHAN-MD)
const CONFIG = {
    AUTO_TYPING: true,           // Show typing indicator when processing
    AUTO_READ: false,            // Auto-read incoming messages
    IGNORE_GROUPS: true,         // Ignore group messages
    IGNORE_STATUS: true,         // Ignore status broadcasts
    LOG_MESSAGES: true,          // Log messages to console
    VOICE_SUPPORT: true,         // Voice message transcription with Whisper
    VOICE_REPLY: true,           // Reply with voice if user sent voice
    MAX_RETRIES: 3,              // Max API retries
    TIMEOUT: 60000,              // API timeout in ms
};

// Global State
let IS_BOT_PAUSED = false;

// ===============================================
// LOGGING
// ===============================================

function log(level, message, data = null) {
    const timestamp = new Date().toLocaleString('en-LK');
    const emoji = {
        info: '📘',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        message: '💬',
        send: '📤',
        receive: '📩'
    };

    const prefix = emoji[level] || '📝';
    console.log(`${prefix} [${timestamp}] ${message}`);

    if (data && CONFIG.LOG_MESSAGES) {
        console.log('   └─', JSON.stringify(data).substring(0, 200));
    }

    // AUTO-SEND errors and warnings to Discord
    if (level === 'error' || level === 'warning') {
        logToDiscord(level, message, data);
    }
}

async function logToDiscord(level, message, details = null) {
    if (!DISCORD_CONSOLE_WEBHOOK) return;

    try {
        const colors = {
            info: 0x3498DB,
            success: 0x2ECC71,
            warning: 0xF39C12,
            error: 0xE74C3C
        };

        await axios.post(DISCORD_CONSOLE_WEBHOOK, {
            embeds: [{
                title: `${level.toUpperCase()}: ${message.substring(0, 200)}`,
                color: colors[level] || 0x95A5A6,
                description: details ? `\`\`\`json\n${JSON.stringify(details, null, 2).substring(0, 1000)}\n\`\`\`` : undefined,
                footer: { text: 'Seranex WhatsApp Bot' },
                timestamp: new Date().toISOString()
            }]
        });
    } catch (err) {
        // DO NOT use log() here to avoid infinite loop
        console.error(`❌ [Discord Log Failed]: ${err.message}`);
    }
}

// ===============================================
// WHATSAPP CLIENT SETUP
// ===============================================

// ===============================================
// INITIALIZE CLIENT
// ===============================================

log('info', 'Seranex Lanka WhatsApp Bot Starting...');
log('info', `API Endpoint: ${SERANEX_API}`);
if (DISCORD_CONSOLE_WEBHOOK) {
    log('success', `Discord Logging Enabled: ${DISCORD_CONSOLE_WEBHOOK.substring(0, 40)}...`);
    // Test the webhook immediately
    logToDiscord('success', '🤖 WhatsApp Bot Process Started', {
        api_endpoint: SERANEX_API,
        node_env: process.env.NODE_ENV,
        platform: process.platform
    });
} else {
    log('warning', 'Discord Logging DISABLED (Webhook missing)');
}

let client;

if (MONGODB_URI) {
    log('info', 'Using MongoDB for Session Storage...');
    await mongoose.connect(MONGODB_URI);
    const store = new MongoStore({ mongoose: mongoose });

    client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000
        }),
        puppeteer: {
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            protocolTimeout: 180000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ]
        },
        authTimeoutMs: 60000, // Wait 60s for auth
        qrMaxRetries: 5
    });

    client.on('remote_session_saved', () => {
        log('success', 'Remote session saved to MongoDB!');
    });
} else {
    log('warning', 'MONGODB_URI missing, falling back to LocalAuth (Session will lost on restart)');
    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './session'
        }),
        puppeteer: {
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            protocolTimeout: 180000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ]
        },
        authTimeoutMs: 60000,
        qrMaxRetries: 5
    });
}

// ===============================================
// EVENT HANDLERS
// ===============================================

// Pairing code for authentication (more reliable than QR)
client.on('code', async (code) => {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════');
    console.log('📱 WHATSAPP PAIRING CODE');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log(`   CODE: ${code}`);
    console.log('');
    console.log('   1. Open WhatsApp on your phone');
    console.log('   2. Go to Settings > Linked Devices');
    console.log('   3. Tap "Link a Device"');
    console.log('   4. Tap "Link with phone number instead"');
    console.log(`   5. Enter this code: ${code}`);
    console.log('');
    console.log('   ⏰ Code expires in 10 minutes');
    console.log('═══════════════════════════════════════════════════');
    console.log('\n');

    log('info', `📱 Pairing Code Generated: ${code}`);

    // Send to Discord
    await logToDiscord('warning', '🔐 WhatsApp Pairing Code', {
        code: code,
        instructions: [
            '1. Open WhatsApp on your phone',
            '2. Settings > Linked Devices > Link a Device',
            '3. Tap "Link with phone number instead"',
            `4. Enter code: ${code}`,
            '⏰ Expires in 10 minutes'
        ].join('\n'),
        expires_in: '10 minutes'
    });
});

// QR Code fallback (if pairing code fails)
client.on('qr', async (qr) => {
    console.log('\n');
    log('info', '📱 QR Code generated. Requesting Pairing Code for better reliability...');
    console.log('');
    qrcode.generate(qr, { small: false });
    console.log('');

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
    console.log('🔗 QR Link:', qrImageUrl);
    console.log('\n');

    // EXPLICITLY REQUEST PAIRING CODE
    // We increase delay to 20 seconds to ensure 'window.onCodeReceivedEvent' is defined
    // and RegistrationUtils is loaded by the browser (crucial for cloud containers).
    setTimeout(async () => {
        try {
            if (!client || !OWNER_PHONE) return;

            log('info', `🔐 Requesting Pairing Code for ${OWNER_PHONE} (20s delay attempt)...`);
            const code = await client.requestPairingCode(OWNER_PHONE).catch(e => {
                return { error: e.message || 'Unknown pairing error' };
            });

            if (code && typeof code === 'string') {
                log('success', `✅ Pairing Code received: ${code}`);
            } else if (code && code.error) {
                throw new Error(code.error);
            }
        } catch (err) {
            log('error', `Failed to request pairing code: ${err.message}`);

            // Fallback instruction
            await logToDiscord('error', 'Pairing Code Request Failed', {
                error: err.message,
                tip: 'Railway is being slow. If this fails, the QR Link above is your best bet!',
                phone_attempted: OWNER_PHONE
            });
        }
    }, 20000);

    await logToDiscord('info', '📱 QR Code Available', {
        message: 'Pairing code has been requested. If it fails, use this QR as fallback.',
        qr_link: qrImageUrl
    });
});

// Authentication successful
client.on('authenticated', () => {
    log('success', 'WhatsApp Authenticated!');
    logToDiscord('success', 'WhatsApp Bot authenticated and connected');
});

// Authentication failure
client.on('auth_failure', (error) => {
    log('error', 'Authentication failed:', error);
    logToDiscord('error', 'WhatsApp authentication failed', { error: error.message || error });
});

// Client ready
client.on('ready', async () => {
    log('success', 'Seranex Lanka WhatsApp Bot is READY!');
    log('info', '📨 Listening for incoming messages...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Notify via Discord
    await logToDiscord('success', 'Bot is now online and ready', {
        time: new Date().toISOString(),
        adminPhones: ADMIN_PHONES
    });
});

// ===============================================
// CALL HANDLER - Auto-reject with message
// ===============================================

client.on('call', async (call) => {
    console.log('📞 Incoming call detected:', call.from);

    // Log missed call
    log('warning', `Missed call from ${call.from}`);

    // Wait 15 seconds to let it ring on the owner's phone naturally
    // User requested "leave that call to ring... he will cut... AFTER that you send a message"
    setTimeout(async () => {
        try {
            await client.sendMessage(call.from,
                '📞 *Missed Call Auto-Reply*\n\n' +
                'Sorry for the missed call! 📵\n' +
                'We have notified our admin and will get back to you as soon as possible. 👤\n\n' +
                'In the meantime, you can chat with **Sera** (our AI Assistant) right here! 👇\n' +
                'Just type your question or requirement.\n\n' +
                '––––––––––––––––––––\n' +
                '📞 **මගහැරුණු ඇමතුම**\n' +
                'සමාවන්න, අපට ඇමතුමට පිළිතුරු දීමට නොහැකි විය.\n' +
                'අපගේ Admin දැනුවත් කර ඇති අතර ඉක්මනින් ඔබට ඇමතුමක් ලබා දෙනු ඇත. 👤\n\n' +
                'මේ අතරතුර ඔබට **Sera** (අපගේ AI සහායක) සමඟ මෙහි chat කළ හැක! 👇\n' +
                'ඔබගේ අවශ්‍යතාවය මෙහි මැසේජ් කරන්න.'
            );
        } catch (e) {
            console.error('Failed to send missed call reply:', e);
        }
    }, 15000); // 15 seconds delay
});

// ===============================================
// MESSAGE HANDLER
// ===============================================

client.on('message', async (message) => {
    try {
        console.log(`[DEBUG] Received message from ${message.from}: ${message.body}`);

        // Skip status broadcasts
        if (CONFIG.IGNORE_STATUS && message.from === 'status@broadcast') {
            if (CONFIG.LOG_MESSAGES) {
                console.log(`[DEBUG] Skipped status broadcast from ${message.from}`);
            }
            return;
        }

        // Skip group messages
        if (CONFIG.IGNORE_GROUPS && message.from.includes('@g.us')) {
            if (CONFIG.LOG_MESSAGES) {
                log('warning', `Ignored group message from ${message.from.split('@')[0]}`);
            }
            return;
        }

        // Skip messages from self
        if (message.fromMe) {
            if (CONFIG.LOG_MESSAGES) {
                console.log(`[DEBUG] Skipped message from self (fromMe: true)`);
            }
            return;
        }

        const phoneNumber = message.from.replace('@c.us', '');
        let messageText = message.body || '';
        const customerName = message._data?.notifyName || 'Customer';

        // ===============================================
        // ADMIN PAUSE COMMANDS
        // ===============================================
        if (ADMIN_PHONES.includes(phoneNumber)) {
            if (messageText.toLowerCase() === '!sera pause') {
                IS_BOT_PAUSED = true;
                await message.reply('⏸️ Bot paused! I will stop replying until you say !sera continue');
                log('warning', `Bot paused by admin ${phoneNumber}`);
                return;
            }
            if (messageText.toLowerCase() === '!sera continue') {
                IS_BOT_PAUSED = false;
                await message.reply('▶️ Bot resumed! I am back online.');
                log('success', `Bot resumed by admin ${phoneNumber}`);
                return;
            }
        }

        // Check if paused
        if (IS_BOT_PAUSED && !ADMIN_PHONES.includes(phoneNumber)) {
            return;
        }

        // ===============================================
        // VOICE MESSAGE HANDLING
        // Uses OpenAI Whisper for Sinhala/English transcription
        // ===============================================
        if (message.hasMedia && message.type === 'ptt') {
            if (!CONFIG.VOICE_SUPPORT) {
                log('receive', `Voice message from ${customerName} (${phoneNumber})`);
                await message.reply(
                    '🎤 Voice messages coming soon! Please type your message.\n\n' +
                    'Voice message support එන්න ඉන්නවා. Please text කරන්න. 🙏'
                );
                return;
            }

            // Download and transcribe voice message
            try {
                log('info', `🎤 Processing voice from ${customerName}...`);
                const media = await message.downloadMedia();

                if (media && media.data) {
                    // Send to API for transcription
                    const response = await axios.post(SERANEX_API.replace('/incoming', '/transcribe'), {
                        audioBase64: media.data,
                        mimeType: media.mimetype
                    });

                    if (response.data.success && response.data.text) {
                        messageText = response.data.text;
                        log('success', `📝 Transcribed: "${messageText}" (${response.data.language})`);

                        // Transcription successful, proceeding to reply...
                    } else {
                        log('error', 'Transcription failed - no text returned');
                        await message.reply('Meka ahuwe nane sir. Type karanna kiyananako? 🙏 (AI error)');
                        return;
                    }
                }
            } catch (transcribeError) {
                if (transcribeError.response && transcribeError.response.data) {
                    log('error', `Voice Transcription API Error Detail: ${JSON.stringify(transcribeError.response.data)}`);
                }
                log('error', `Voice transcription error: ${transcribeError.message}`);
                await message.reply('Voice eka process karanna podi error ekak awa sir. Type karanna please. 🙏');
                return;
            }
        }

        // Skip empty messages
        if (!messageText || messageText.trim() === '') {
            if (message.hasMedia) {
                log('receive', `Media without caption from ${customerName} (${phoneNumber})`);
                // Silently ignore images/files without captions to prevent spam
                // during multi-file uploads
            }
            return;
        }

        log('receive', `${customerName} (${phoneNumber}): ${messageText.substring(0, 80)}${messageText.length > 80 ? '...' : ''}`);

        // ===============================================
        // TYPING INDICATOR
        // ===============================================
        if (CONFIG.AUTO_TYPING) {
            try {
                const chat = await message.getChat();
                if (chat.sendTyping) {
                    await chat.sendTyping();
                } else if (chat.sendStateTyping) {
                    await chat.sendStateTyping();
                }
            } catch {
                log('warning', 'Could not send typing state (Chat might not support it)');
            }
        }

        // ===============================================
        // CALL SERANEX API
        // ===============================================
        let aiReply = '';
        let mood = 'neutral';
        let aiActions = [];
        let retries = CONFIG.MAX_RETRIES;

        while (retries > 0) {
            try {
                const response = await axios.post(SERANEX_API, {
                    phone: phoneNumber,
                    message: messageText,
                    name: customerName,
                    isVoice: message.type === 'ptt'
                }, {
                    timeout: CONFIG.TIMEOUT,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                aiReply = response.data.reply || '';
                mood = response.data.mood || 'neutral';
                aiActions = response.data.actions || [];

                // --- 🚨 HIGH PRIORITY MOOD ALERT ---
                if (mood === 'angry' || mood === 'frustrated') {
                    const riyonPhone = '94768290477'; // Riyon
                    const alertMsg = `🚨 *Mood Alert!* 🚨\n\nCustomer *${customerName}* (${phoneNumber}) is feeling *${mood.toUpperCase()}*.\n\n💬 *Last Msg*: "${messageText}"\n\nPlease check ASAP!`;

                    try {
                        await client.sendMessage(riyonPhone + '@c.us', alertMsg);
                        log('info', `🚨 Alerted Riyon about angry customer: ${customerName}`);
                    } catch (err) {
                        log('error', `Failed to alert Riyon: ${err.message}`);
                    }
                }

                break; // Success!

            } catch (error) {
                retries--;

                if (error.response && error.response.data) {
                    log('error', `API Error Detail: ${JSON.stringify(error.response.data)}`);
                }

                if (retries > 0) {
                    log('warning', `API call failed, retrying... (${CONFIG.MAX_RETRIES - retries}/${CONFIG.MAX_RETRIES})`);
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    throw error;
                }
            }
        }

        // ===============================================
        // SEND REPLY
        // ===============================================
        const moodEmoji = {
            frustrated: '😤',
            angry: '😡',
            happy: '😊',
            urgent: '⚡',
            confused: '🤔',
            neutral: '📤'
        };

        log('send', `Reply (${moodEmoji[mood] || '📤'} ${mood}): ${aiReply.substring(0, 80)}...`);

        // Stop typing and send reply
        if (CONFIG.AUTO_TYPING) {
            try {
                const chat = await message.getChat();
                if (chat.clearState) await chat.clearState();
            } catch {
                // Ignore
            }
        }

        // --- NEW: Manual Voice Command Handling ---
        let forceVoice = false;
        if (aiReply.includes('[SEND_AS_VOICE]')) {
            aiReply = aiReply.replace('[SEND_AS_VOICE]', '').trim();
            forceVoice = true;
        }

        // Send reply (Text or Voice)
        if ((CONFIG.VOICE_REPLY && message.type === 'ptt') || forceVoice) {
            try {
                log('info', `🎤 Generating TTS for: "${aiReply.substring(0, 20)}..."`);

                // Generate TTS
                const speech = await axios.post(SERANEX_API.replace('/incoming', '/speak'), {
                    text: aiReply
                }, {
                    timeout: 30000 // 30 seconds timeout for TTS
                });

                log('info', `✅ TTS Generated (Provider: ${speech.data.provider})`);

                if (speech.data.success) {
                    const media = new MessageMedia(speech.data.mimeType, speech.data.audioBase64);
                    await message.reply(media, undefined, { sendAudioAsVoice: true });
                    log('send', `Voice reply sent to ${phoneNumber}`);
                } else {
                    log('warning', 'TTS returned success=false, falling back to text');
                    await message.reply(aiReply); // Fallback to text
                }
            } catch (err) {
                log('error', `TTS Failed: ${err.message}`);
                await message.reply(aiReply); // Fallback to text
            }
        } else if (aiReply.trim() !== '') {
            await message.reply(aiReply);
        }

        // ===============================================
        // PROCESS ACTIONS (GOD MODE)
        // ===============================================
        for (const action of aiActions) {
            try {
                log('info', `⚡ Executing Action: ${action.type}`);

                switch (action.type) {
                    case 'SEND_TEXT':
                        await client.sendMessage(action.to === 'CUSTOMER' ? message.from : action.to, action.text);
                        break;

                    case 'SEND_LOCATION':
                        const loc = new Location(action.latitude, action.longitude, action.description);
                        await client.sendMessage(action.to === 'CUSTOMER' ? message.from : action.to, loc);
                        break;

                    case 'SEND_FILE':
                        // Assuming path is accessible to the bot (or URL)
                        // If it's a local path, read it and convert to MessageMedia
                        // For now, let's assume the API provides a URL or base64
                        if (action.path) {
                            // Future implementation for file sending
                            log('warning', `File sending action detected for ${action.path} - skipped (implement file access)`);
                        }
                        break;

                    case 'NOTIFY_STAFF':
                        await client.sendMessage(action.phone + '@c.us', action.message_content);
                        break;
                }
            } catch (actionErr) {
                log('error', `Failed to execute action ${action.type}: ${actionErr.message}`);
            }
        }

    } catch (error) {
        log('error', 'Message handler error:', error.message);
        await logToDiscord('error', 'Message handling failed', {
            error: error.message,
            stack: error.stack?.substring(0, 500)
        });

        // Send user-friendly error message
        const errorMessage = getErrorMessage(error);
        await message.reply(errorMessage);
    }
});

// ===============================================
// ERROR MESSAGE HELPER
// ===============================================

function getErrorMessage(error) {
    if (error.response) {
        const status = error.response.status;

        if (status === 429) {
            return 'AI poddak busy sir. Tikenakin try karamu da? 🙏';
        }

        if (status === 401 || status === 403) {
            return 'Bot maintain wenawa sir. Poddak inna. 🔧';
        }

        return `Technical issue ekak sir (Error ${status}). Poddak inna. 🙏`;
    }

    if (error.code === 'ECONNREFUSED') {
        return 'Server offline sir. Tikenakin try karanna. 🔌';
    }

    if (error.code === 'ETIMEDOUT') {
        return 'Connection slow sir. Ayeth try karanna? ⏰';
    }

    return 'Poddak busy sir, tikenakin try karanna please. 🙏';
}

// ===============================================
// ADMIN MESSAGE SENDER
// ===============================================

async function sendMessageTo(phone, message) {
    try {
        const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        await client.sendMessage(chatId, message);
        log('send', `Admin notification sent to ${phone}`);
        return true;
    } catch (error) {
        log('error', `Failed to send to ${phone}:`, error.message);
        return false;
    }
}

// Export for external use (notifications from API)
global.sendWhatsAppMessage = sendMessageTo;

// ===============================================
// DISCONNECTION HANDLING
// ===============================================

client.on('disconnected', async (reason) => {
    log('error', 'WhatsApp disconnected:', reason);
    await logToDiscord('error', 'Bot disconnected', { reason });

    log('info', 'Restarting in 10 seconds...');
    setTimeout(() => {
        client.initialize();
    }, 10000);
});

// ===============================================
// GRACEFUL SHUTDOWN
// ===============================================

process.on('SIGINT', async () => {
    log('info', 'Shutting down gracefully...');
    await client.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (reason) => {
    // Better error logging - stringify the whole thing
    const errorDetails = reason ? {
        message: reason.message || 'No message',
        name: reason.name || 'Unknown',
        stack: reason.stack || 'No stack',
        raw: JSON.stringify(reason, Object.getOwnPropertyNames(reason || {}), 2)
    } : { raw: String(reason) };

    log('error', 'Unhandled Rejection:', errorDetails);
    logToDiscord('error', 'Unhandled Promise Rejection', errorDetails);
});

// ===============================================
// CRON JOBS (EXAM & DAILY TASKS)
// ===============================================

// 1. Morning Motivation & Exam Countdown (6:00 AM)
cron.schedule('0 6 * * *', async () => {
    const today = moment();
    const examDay = moment(EXAM_DATE);
    const daysLeft = examDay.diff(today, 'days');

    const message = `🌅 *Good Morning, Boss!* \n\n` +
        `📚 *Exam Countdown*: **${daysLeft} Days** left until O/Ls!\n` +
        `🎯 *Focus Mode*: ACTIVATED.\n\n` +
        `"Success is the sum of small efforts, repeated day in and day out." 💪\n` +
        `Let's crush it today!`;

    try {
        await client.sendMessage(OWNER_PHONE + '@c.us', message);
        log('info', 'Sent exam countdown message');
    } catch (err) {
        log('error', `Failed to send countdown: ${err.message}`);
    }
});

// ===============================================
// START
// ===============================================

log('info', 'Initializing WhatsApp connection (Microsoft Edge)...');
setTimeout(() => {
    client.initialize();
}, 5000);

cron.schedule('0 20 * * 0', async () => {
    log('info', '📊 Running Weekly Financial Report Cron...');

    try {
        const reportUrl = SERANEX_API.replace('/whatsapp/incoming', '/finance/report');
        const response = await axios.get(reportUrl);

        if (response.data && response.data.success) {
            const reportText = response.data.report;
            const ownerPhone = ADMIN_PHONES[0]; // Primary owner
            const ownerJid = ownerPhone.includes('@c.us') ? ownerPhone : `${ownerPhone}@c.us`;

            await client.sendMessage(ownerJid, reportText);
            log('success', 'Sent weekly financial report to owner.');
        } else {
            throw new Error(response.data.error || 'Failed to fetch report');
        }
    } catch (e) {
        log('error', 'Sunday Report Failed:', e.message);
    }
});
