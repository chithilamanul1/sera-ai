/**
 * Seranex Notifications
 * Discord webhooks and WhatsApp notifications to admins
 */

import axios from 'axios';

// Discord Webhooks
const PRIMARY_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || '';
const DISCORD_ORDERS_WEBHOOK = process.env.DISCORD_ORDERS_WEBHOOK || PRIMARY_WEBHOOK;
const DISCORD_COMPLAINTS_WEBHOOK = process.env.DISCORD_COMPLAINTS_WEBHOOK || PRIMARY_WEBHOOK;
const DISCORD_CONSOLE_WEBHOOK = process.env.DISCORD_CONSOLE_WEBHOOK || PRIMARY_WEBHOOK;

// Message queue for WhatsApp admin notifications
interface QueuedMessage {
    phone: string;
    message: string;
    timestamp: Date;
    priority: 'high' | 'normal' | 'low';
}

const messageQueue: QueuedMessage[] = [];

// ===============================================
// DISCORD NOTIFICATIONS
// ===============================================

interface NotificationData {
    phone?: string;
    customerName?: string;
    requirements?: any;
    suggestedQuote?: any;
    quotation?: any;
    quoteId?: string;
    orderId?: string;
    message?: string;
    timestamp?: string;
}

/**
 * Send notification to Discord
 */
export async function sendDiscordNotification(
    type: 'order' | 'quote' | 'complaint',
    data: NotificationData
): Promise<boolean> {
    try {
        let webhookUrl = '';
        let embed: any = {};

        const timestamp = new Date().toISOString();

        if (type === 'order') {
            webhookUrl = DISCORD_ORDERS_WEBHOOK;
            embed = {
                title: '🎉 New Order Confirmed!',
                color: 0x00FF00, // Green
                fields: [
                    { name: '📱 Customer Phone', value: data.phone || 'N/A', inline: true },
                    { name: '👤 Name', value: data.customerName || 'Customer', inline: true },
                    { name: '💰 Total', value: `Rs. ${data.quotation?.total?.toLocaleString() || 0}`, inline: true },
                    { name: '💳 Advance (40%)', value: `Rs. ${data.quotation?.advance?.toLocaleString() || 0}`, inline: true },
                    { name: '📋 Requirements', value: formatRequirements(data.requirements), inline: false }
                ],
                footer: { text: 'Seranex Lanka Bot' },
                timestamp
            };
        } else if (type === 'quote') {
            webhookUrl = DISCORD_ORDERS_WEBHOOK;
            embed = {
                title: '📝 New Quote Pending Approval',
                color: 0xFFAA00, // Orange
                fields: [
                    { name: '📱 Customer Phone', value: data.phone || 'N/A', inline: true },
                    { name: '👤 Name', value: data.customerName || 'Customer', inline: true },
                    { name: '💰 Suggested Total', value: `Rs. ${data.suggestedQuote?.total?.toLocaleString() || 'TBD'}`, inline: true },
                    { name: '📋 Requirements', value: formatRequirements(data.requirements), inline: false },
                    { name: '🔗 Quote ID', value: `\`${data.quoteId || 'N/A'}\``, inline: false }
                ],
                footer: { text: '💡 Reply via WhatsApp: !sera approve <id> or !sera reject <id>' },
                timestamp
            };
        } else if (type === 'complaint') {
            webhookUrl = DISCORD_COMPLAINTS_WEBHOOK;
            embed = {
                title: '⚠️ Customer Complaint',
                color: 0xFF0000, // Red
                fields: [
                    { name: '📱 Customer Phone', value: data.phone || 'N/A', inline: true },
                    { name: '💬 Message', value: data.message?.substring(0, 1000) || 'N/A', inline: false }
                ],
                footer: { text: '🔴 URGENT - Please respond immediately!' },
                timestamp
            };
        }

        if (webhookUrl) {
            await axios.post(webhookUrl, {
                embeds: [embed]
            }, {
                timeout: 5000
            });
            console.log(`[Discord] ✅ Sent ${type} notification`);
            return true;
        } else {
            console.warn(`[Discord] ⚠️ No webhook URL configured for ${type}`);
            return false;
        }
    } catch (error: any) {
        console.error('[Discord] ❌ Failed to send notification:', error.message);
        return false;
    }
}

/**
 * Send console/log message to Discord
 */
export async function sendConsoleLog(
    level: 'info' | 'warn' | 'error',
    message: string,
    details?: any
): Promise<boolean> {
    if (!DISCORD_CONSOLE_WEBHOOK) {
        console.log(`[Console ${level.toUpperCase()}] ${message}`);
        return false;
    }

    try {
        const colors: Record<string, number> = {
            info: 0x3498DB,   // Blue
            warn: 0xF39C12,   // Yellow
            error: 0xE74C3C   // Red
        };

        const emojis: Record<string, string> = {
            info: 'ℹ️',
            warn: '⚠️',
            error: '🚨'
        };

        const embed = {
            title: `${emojis[level]} ${level.toUpperCase()}: ${message.substring(0, 200)}`,
            color: colors[level],
            description: details ? `\`\`\`json\n${JSON.stringify(details, null, 2).substring(0, 1000)}\n\`\`\`` : undefined,
            footer: { text: 'Seranex Bot Console' },
            timestamp: new Date().toISOString()
        };

        await axios.post(DISCORD_CONSOLE_WEBHOOK, {
            embeds: [embed]
        }, {
            timeout: 5000
        });

        return true;
    } catch (error: any) {
        console.error('[Console Webhook] Failed:', error.message);
        return false;
    }
}

/**
 * Send error to Discord console
 */
export async function sendErrorToDiscord(error: Error | string, context?: string): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    await sendConsoleLog('error', context || 'System Error', {
        message: errorMessage,
        stack: errorStack?.substring(0, 500),
        time: new Date().toISOString()
    });
}

// ===============================================
// WHATSAPP ADMIN NOTIFICATIONS
// ===============================================

/**
 * Queue WhatsApp message to admin
 * Messages are stored and picked up by the bot
 */
export async function sendWhatsAppToAdmin(
    phone: string,
    message: string,
    priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
    messageQueue.push({
        phone,
        message,
        timestamp: new Date(),
        priority
    });

    console.log(`[WhatsApp Queue] Added message to ${phone} (${priority} priority)`);

    // If global sendWhatsAppMessage is available (set by bot.js), use it
    if (typeof global !== 'undefined' && (global as any).sendWhatsAppMessage) {
        try {
            await (global as any).sendWhatsAppMessage(phone, message);
            console.log(`[WhatsApp] ✅ Sent to ${phone}`);
        } catch (error: any) {
            console.error(`[WhatsApp] ❌ Failed to send to ${phone}:`, error.message);
        }
    }
}

/**
 * Get pending messages for a phone number
 */
export function getPendingMessages(phone?: string): QueuedMessage[] {
    if (phone) {
        return messageQueue.filter(m => m.phone === phone);
    }
    return [...messageQueue];
}

/**
 * Clear sent messages from queue
 */
export function clearSentMessages(phone: string): void {
    const index = messageQueue.findIndex(m => m.phone === phone);
    if (index > -1) {
        messageQueue.splice(index, 1);
    }
}

// ===============================================
// FORMATTING HELPERS
// ===============================================

/**
 * Format requirements object for display
 */
function formatRequirements(requirements: any): string {
    if (!requirements) return 'No details provided';

    if (typeof requirements === 'string') {
        return requirements.substring(0, 500);
    }

    try {
        const lines: string[] = [];

        if (requirements.product) lines.push(`📦 Product: ${requirements.product}`);
        if (requirements.quantity) lines.push(`🔢 Quantity: ${requirements.quantity}`);
        if (requirements.size) lines.push(`📐 Size: ${requirements.size}`);
        if (requirements.material) lines.push(`🎨 Material: ${requirements.material}`);
        if (requirements.design) lines.push(`🖼️ Design: ${requirements.design}`);
        if (requirements.deadline) lines.push(`⏰ Deadline: ${requirements.deadline}`);
        if (requirements.notes) lines.push(`📝 Notes: ${requirements.notes}`);

        if (lines.length === 0) {
            return JSON.stringify(requirements, null, 2).substring(0, 500);
        }

        return lines.join('\n');
    } catch {
        return String(requirements).substring(0, 500);
    }
}

/**
 * Format quotation as text for WhatsApp
 */
export function formatQuotationText(quotation: any): string {
    if (!quotation) return 'Quotation pending...';

    let text = `📝 *Seranex Lanka - Quotation*\n\n`;

    if (quotation.items && quotation.items.length > 0) {
        quotation.items.forEach((item: any, index: number) => {
            text += `${index + 1}. ${item.name}: Rs. ${item.price?.toLocaleString() || '0'}\n`;
        });
    } else {
        text += `_Items to be confirmed_\n`;
    }

    text += `\n━━━━━━━━━━━━━━━\n`;
    text += `💰 *Total: Rs. ${quotation.total?.toLocaleString() || 'TBD'}*\n`;

    if (quotation.total) {
        const advance = Math.round(quotation.total * 0.4);
        text += `💳 *Advance (40%): Rs. ${advance.toLocaleString()}*\n`;
    }

    if (quotation.notes) {
        text += `\n📝 ${quotation.notes}\n`;
    }

    return text;
}

/**
 * Format bank details for WhatsApp
 */
import config from '../whitelabel/config';

/**
 * Format bank details for WhatsApp
 */
export function getBankDetailsText(): string {
    const { bank } = config;
    if (!bank) return "Bank details not configured.";

    return `
💳 *Payment Details*

🏦 Bank: ${bank.name}
📍 Branch: ${bank.branch}
🔢 Account: ${bank.accountNumber}
👤 Name: ${bank.accountName}

⚠️ Please pay 40% advance to confirm your order.
📸 Send payment slip after transfer.

Thank you! 🙏
`;
}

/**
 * Format order confirmation message
 */
export function formatOrderConfirmation(order: any): string {
    return `
🎉 *Order Confirmed!*
━━━━━━━━━━━━━━━

📋 Order ID: ${order._id}
📱 Customer: ${order.phone}
👤 Name: ${order.customerName}

💰 Total: Rs. ${order.quotation?.total?.toLocaleString() || 0}
💳 Advance Due: Rs. ${order.quotation?.advance?.toLocaleString() || 0}

📦 Status: ${order.status}
💵 Payment: ${order.paymentStatus}

Created: ${new Date(order.createdAt).toLocaleString('en-LK')}
`;
}
