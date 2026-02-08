/**
 * Seranex Discord Control Bot
 * 
 * Features:
 * - Live console log streaming
 * - WhatsApp bot status monitoring
 * - System stats and metrics
 * - Remote control commands
 */

import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, Events } from 'discord.js';
import axios from 'axios';

// ===============================================
// CONFIGURATION
// ===============================================

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const LOG_CHANNEL_ID = process.env.DISCORD_LOG_CHANNEL_ID;
const COMMAND_PREFIX = '!sera';
const API_URL = process.env.SERANEX_API || 'https://sera-ai-production.up.railway.app';

// Allowed admin user IDs
const ADMIN_IDS = (process.env.DISCORD_ADMIN_IDS || '').split(',');

// ===============================================
// DISCORD CLIENT SETUP
// ===============================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Handle login errors gracefully
client.on('error', (error) => {
    console.error('❌ Discord Client Error:', error.message);
    if (error.message.includes('disallowed intents')) {
        console.error('⚠️ Please enable MESSAGE CONTENT INTENT in Discord Developer Portal!');
        console.error('👉 https://discord.com/developers/applications → Bot → Privileged Gateway Intents');
    }
});

// ===============================================
// BOT STATE
// ===============================================

let stats = {
    messagesHandled: 0,
    errorsToday: 0,
    lastActivity: null,
    whatsappStatus: 'unknown',
    apiStatus: 'unknown',
    uptime: Date.now()
};

// ===============================================
// LOGGING HELPER
// ===============================================

async function logToChannel(level, message, details = null) {
    if (!LOG_CHANNEL_ID) return;

    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!channel) return;

        const colors = {
            info: 0x3498DB,
            success: 0x2ECC71,
            warning: 0xF39C12,
            error: 0xE74C3C,
            debug: 0x95A5A6
        };

        const emojis = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            debug: '🔧'
        };

        const embed = new EmbedBuilder()
            .setColor(colors[level] || 0x95A5A6)
            .setTitle(`${emojis[level] || '📝'} ${level.toUpperCase()}`)
            .setDescription(message.substring(0, 2000))
            .setTimestamp();

        if (details) {
            embed.addFields({
                name: 'Details',
                value: `\`\`\`json\n${JSON.stringify(details, null, 2).substring(0, 1000)}\n\`\`\``
            });
        }

        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error('Failed to log to Discord channel:', err.message);
    }
}

// ===============================================
// COMMAND HANDLERS
// ===============================================

const commands = {
    async status(message) {
        const uptime = Math.floor((Date.now() - stats.uptime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        // Check API health
        let apiHealth = '❓ Unknown';
        try {
            const res = await axios.get(`${API_URL}/api/health`, { timeout: 5000 });
            apiHealth = res.status === 200 ? '✅ Online' : '⚠️ Degraded';
            stats.apiStatus = 'online';
        } catch {
            apiHealth = '❌ Offline';
            stats.apiStatus = 'offline';
        }

        const embed = new EmbedBuilder()
            .setColor(0x00D4AA)
            .setTitle('📊 Seranex System Status')
            .setDescription('Current status of all Seranex components')
            .addFields(
                { name: '🤖 Discord Bot', value: '✅ Online', inline: true },
                { name: '🌐 API Server', value: apiHealth, inline: true },
                { name: '📱 WhatsApp', value: stats.whatsappStatus === 'connected' ? '✅ Connected' : '⚠️ Check Logs', inline: true },
                { name: '⏱️ Uptime', value: `${hours}h ${minutes}m`, inline: true },
                { name: '📨 Messages Today', value: `${stats.messagesHandled}`, inline: true },
                { name: '❌ Errors Today', value: `${stats.errorsToday}`, inline: true }
            )
            .setFooter({ text: 'Seranex Lanka AI System' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    async help(message) {
        const embed = new EmbedBuilder()
            .setColor(0x00D4AA)
            .setTitle('🤖 Seranex Bot Commands')
            .setDescription('Available commands for managing Seranex')
            .addFields(
                { name: '`!sera status`', value: 'Show system status and health', inline: false },
                { name: '`!sera logs`', value: 'Show recent error logs', inline: false },
                { name: '`!sera stats`', value: 'Show message statistics', inline: false },
                { name: '`!sera ping`', value: 'Check bot latency', inline: false },
                { name: '`!sera pause`', value: '⚠️ Pause AI responses (Admin)', inline: false },
                { name: '`!sera resume`', value: '⚠️ Resume AI responses (Admin)', inline: false },
                { name: '`!sera qr`', value: 'Get WhatsApp QR code link', inline: false }
            )
            .setFooter({ text: 'Use commands in the control channel' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    async ping(message) {
        const sent = await message.reply('🏓 Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        await sent.edit(`🏓 Pong! Latency: **${latency}ms** | API Latency: **${Math.round(client.ws.ping)}ms**`);
    },

    async stats(message) {
        try {
            const res = await axios.get(`${API_URL}/api/admin/stats`, { timeout: 10000 });
            const data = res.data;

            const embed = new EmbedBuilder()
                .setColor(0x00D4AA)
                .setTitle('📈 Seranex Statistics')
                .addFields(
                    { name: '💰 Revenue', value: `LKR ${(data.revenue || 0).toLocaleString()}`, inline: true },
                    { name: '📦 Pending Orders', value: `${data.pendingOrders || 0}`, inline: true },
                    { name: '💬 Active Chats', value: `${data.activeChats || 0}`, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (err) {
            await message.reply(`❌ Failed to fetch stats: ${err.message}`);
        }
    },

    async pause(message) {
        if (!ADMIN_IDS.includes(message.author.id)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        try {
            await axios.post(`${API_URL}/api/settings`, { isAiActive: false });
            await message.reply('⏸️ AI responses have been **PAUSED**. Customers will not receive AI replies.');
            await logToChannel('warning', 'AI Paused', { by: message.author.tag });
        } catch (err) {
            await message.reply(`❌ Failed to pause AI: ${err.message}`);
        }
    },

    async resume(message) {
        if (!ADMIN_IDS.includes(message.author.id)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        try {
            await axios.post(`${API_URL}/api/settings`, { isAiActive: true });
            await message.reply('▶️ AI responses have been **RESUMED**. Sera is back online!');
            await logToChannel('success', 'AI Resumed', { by: message.author.tag });
        } catch (err) {
            await message.reply(`❌ Failed to resume AI: ${err.message}`);
        }
    },

    async qr(message) {
        await message.reply('📱 Check the Railway logs for the QR code, or wait for a Discord notification when a new code is generated.\n\nIf you see a distorted QR in logs, the notification will include a **clickable link** to a clean QR image.');
    },

    async logs(message) {
        await message.reply('📋 Recent logs are automatically posted to this channel. Check the messages above for any errors or warnings.');
    }
};

// ===============================================
// EVENT HANDLERS
// ===============================================

client.once(Events.ClientReady, () => {
    console.log(`✅ Discord bot logged in as ${client.user.tag}`);

    // Set bot status
    client.user.setPresence({
        activities: [{ name: 'Seranex Lanka | !sera help', type: 3 }],
        status: 'online'
    });

    logToChannel('success', 'Discord Control Bot Started', {
        bot: client.user.tag,
        guilds: client.guilds.cache.size
    });
});

client.on('messageCreate', async (message) => {
    // Ignore bots and messages without prefix
    if (message.author.bot) return;
    if (!message.content.startsWith(COMMAND_PREFIX)) return;

    const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    if (command && commands[command]) {
        try {
            await commands[command](message, args);
        } catch (err) {
            console.error(`Command error (${command}):`, err);
            await message.reply(`❌ Error executing command: ${err.message}`);
        }
    } else if (command) {
        await message.reply(`❓ Unknown command: \`${command}\`. Use \`!sera help\` for available commands.`);
    }
});

// ===============================================
// API FOR EXTERNAL LOG PUSHING
// ===============================================

// This can be called from the WhatsApp bot or API to push logs
export async function pushLog(level, message, details = null) {
    await logToChannel(level, message, details);

    // Update stats
    if (level === 'error') stats.errorsToday++;
    stats.lastActivity = new Date();
}

export function updateWhatsAppStatus(status) {
    stats.whatsappStatus = status;
}

// ===============================================
// START BOT
// ===============================================

if (!DISCORD_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN is not set. Discord bot will not start.');
} else {
    client.login(DISCORD_TOKEN);
}

export default client;
