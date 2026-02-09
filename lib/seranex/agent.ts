import { Conversation, BotSettings, PendingQuote, Order } from '@/models/Seranex';
import { sendDiscordNotification, sendWhatsAppToAdmin, sendConsoleLog } from './notifications';
import { generateQuotePDF } from '@/lib/pdf-service';
import dbConnect from '@/lib/db';
import os from 'os';

// Admin phone numbers from env
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '').split(',').filter(Boolean);
const OWNER_PERSONAL_PHONE = process.env.OWNER_PERSONAL_PHONE || '94772148511';
const SERANEX_PHONE = process.env.SERANEX_PHONE || '94728382638';
const RIYON_PHONE = process.env.RIYON_PHONE || '94768290477';

// Bank details
const BANK_DETAILS = `
💳 *ගෙවීම් විස්තර / Payment Details*

🏦 Bank: ${process.env.BANK_NAME || 'HNB BANK'}
📍 Branch: ${process.env.BANK_BRANCH || 'Seeduwa Branch'}
🔢 Account: ${process.env.BANK_ACCOUNT || '209020108826'}
👤 Name: ${process.env.BANK_HOLDER || 'BJS FERNANDO'}

⚠️ Advance: ${process.env.ADVANCE_PERCENTAGE || '40'}% required to confirm order
`;

// ===============================================
// ADMIN & AUTHENTICATION
// ===============================================

/**
 * Check if phone number is an admin
 */
import { TEAM_ROLES } from './roles';

/**
 * Check if phone number is an admin
 * Now includes FAMILY members to allow them to use commands like !sera voice
 */
export function isAdmin(phone: string): boolean {
    const cleanPhone = phone.replace(/\D/g, '');

    // Check Configured Admin Phones
    const isConfigAdmin = ADMIN_PHONES.some(admin => {
        const cleanAdmin = admin.replace(/\D/g, '');
        return cleanPhone.includes(cleanAdmin) || cleanAdmin.includes(cleanPhone);
    });

    if (isConfigAdmin) return true;

    // Check Family Members (Amma/Thaththa)
    if (cleanPhone === TEAM_ROLES.FAMILY.MOM || cleanPhone === TEAM_ROLES.FAMILY.DAD) {
        return true;
    }

    return false;
}

/**
 * Check if message is an admin command
 */
export function isAdminCommand(message: string): boolean {
    const trimmed = message.trim().toLowerCase();
    return trimmed.startsWith('!sera') || trimmed.startsWith('!admin');
}

/**
 * Parse admin command into action and arguments
 */
export function parseAdminCommand(message: string): { command: string; args: string[] } {
    const parts = message.trim().substring(5).trim().split(/\s+/); // Remove "!sera"
    const command = parts[0]?.toLowerCase() || 'help';
    const args = parts.slice(1);
    return { command, args };
}

/**
 * Handle admin command and return reply
 */
export async function handleAdminCommand(phone: string, messageText: string): Promise<string> {
    const { command, args } = parseAdminCommand(messageText);

    switch (command) {
        case 'status':
        case 'stats': {
            const stats = await getBotStats();
            const system = stats.system || {};

            return `📊 *Seranex Bot Status*
    
🟢 Status: Online
⏰ Business: ${stats.isBusinessHours ? 'Opened' : 'Closed'}
🖥️ Server: ${system.platform || 'Unknown'}
💾 RAM: ${system.memory || 'Unknown'}
⏱️ Uptime: ${system.uptime || 'Unknown'}

📈 *Business Stats:*
💬 Conversations: ${stats.totalConversations}
📝 Pending Quotes: ${stats.pendingQuotes}
📦 Active Orders: ${stats.activeOrders}
✅ Completed: ${stats.completedOrders}

🕐 Time: ${new Date().toLocaleString('en-LK')}`;
        }

        case 'orders': {
            const status = args[0] || undefined;
            const orders = await getOrdersByStatus(status);

            if (orders.length === 0) {
                return `📦 No ${status || 'pending'} orders found.`;
            }

            let response = `📦 *Orders${status ? ` (${status})` : ''}:*\n\n`;
            orders.slice(0, 10).forEach((order: any, i: number) => {
                response += `${i + 1}. ${order.customerName || 'Customer'}\n`;
                response += `   📱 ${order.phone}\n`;
                response += `   💰 Rs. ${order.quotation?.total?.toLocaleString() || 0}\n`;
                response += `   📊 ${order.status}\n\n`;
            });

            return response;
        }

        case 'quotes':
        case 'pending': {
            const quotes = await getPendingQuotes();

            if (quotes.length === 0) {
                return `📝 No pending quotes!`;
            }

            let response = `📝 *Pending Quotes:*\n\n`;
            quotes.forEach((quote: any, i: number) => {
                response += `${i + 1}. ID: \`${quote._id}\`\n`;
                response += `   📱 ${quote.phone}\n`;
                response += `   👤 ${quote.customerName}\n`;
                response += `   📋 ${JSON.stringify(quote.requirements || {}).substring(0, 100)}\n\n`;
            });

            response += `\n💡 Use: !sera approve <id> or !sera reject <id>`;
            return response;
        }

        case 'approve': {
            const quoteId = args[0];
            if (!quoteId) {
                return `❌ Usage: !sera approve <quote_id>`;
            }

            try {
                const quote = await approveQuote(quoteId, phone);
                if (quote) {
                    return `✅ Quote ${quoteId} approved!\n\nCustomer ${quote.phone} will be notified.`;
                }
                return `❌ Quote not found: ${quoteId}`;
            } catch (e: any) {
                return `❌ Error approving quote: ${e.message}`;
            }
        }

        case 'reject': {
            const quoteId = args[0];
            const reason = args.slice(1).join(' ') || 'No reason provided';

            if (!quoteId) {
                return `❌ Usage: !sera reject <quote_id> [reason]`;
            }

            try {
                const quote = await rejectQuote(quoteId, phone, reason);
                if (quote) {
                    return `❌ Quote ${quoteId} rejected.\nReason: ${reason}`;
                }
                return `❌ Quote not found: ${quoteId}`;
            } catch (e: any) {
                return `❌ Error rejecting quote: ${e.message}`;
            }
        }

        case 'price': {
            const priceInstruction = args.join(' ');
            if (!priceInstruction) {
                const current = await getSetting('price_guidelines') || 'None set';
                return `📊 *Current Price Guidelines:*\n\n${current}\n\n💡 Usage: !sera price <item> = Rs. <price>`;
            }

            const current = await getSetting('price_guidelines') || '';
            await saveSetting('price_guidelines', current + '\n' + priceInstruction, phone);
            return `✅ Price guideline added:\n"${priceInstruction}"`;
        }

        case 'busy': {
            const state = args[0]?.toLowerCase();
            if (state === 'on' || state === 'true' || state === 'yes') {
                await saveSetting('is_busy', true, phone);
                return `📴 *Busy Mode ACTIVATED*\nI will now tell personal/family contacts that you are in school!`;
            } else if (state === 'off' || state === 'false' || state === 'no') {
                await saveSetting('is_busy', false, phone);
                return `🟢 *Busy Mode DEACTIVATED*\nBack to normal.`;
            } else {
                const current = await getSetting('is_busy') || false;
                return `📴 *Busy Mode is currently: ${current ? 'ON' : 'OFF'}*\n💡 Usage: !sera busy on/off`;
            }
        }

        case 'note':
        case 'instruction': {
            const instruction = args.join(' ');
            if (!instruction) {
                const current = await getSetting('custom_instructions') || 'None set';
                return `📝 *Current Instructions:*\n\n${current}`;
            }

            const current = await getSetting('custom_instructions') || '';
            await saveSetting('custom_instructions', current + '\n' + instruction, phone);
            return `✅ Instruction saved:\n"${instruction}"`;
        }

        case 'voice':
        case 'say': {
            const text = args.join(' ');
            if (!text) return `❌ Usage: !sera voice <text to speak>`;
            return `[SEND_AS_VOICE]${text}`;
        }

        case 'settings': {
            const settings = await getAllSettings();
            let response = `⚙️ *Bot Settings:*\n\n`;

            for (const [key, value] of Object.entries(settings)) {
                const displayValue = typeof value === 'string'
                    ? value.substring(0, 100)
                    : JSON.stringify(value).substring(0, 100);
                response += `• ${key}: ${displayValue}\n`;
            }

            return response || `⚙️ No custom settings configured.`;
        }

        case 'clear': {
            const setting = args[0];
            if (setting === 'instructions') {
                await saveSetting('custom_instructions', '', phone);
                return `✅ Custom instructions cleared.`;
            } else if (setting === 'prices') {
                await saveSetting('price_guidelines', '', phone);
                return `✅ Price guidelines cleared.`;
            }
            return `❌ Usage: !sera clear <instructions|prices>`;
        }

        case 'help':
        default: {
            return `🤖 *Seranex Admin Commands*

📊 *Status:*
• !sera status - Bot status & stats

📦 *Orders:*
• !sera orders - List pending orders
• !sera orders <status> - Filter by status

📝 *Quotes:*
• !sera quotes - Pending quotes
• !sera approve <id> - Approve quote
• !sera reject <id> [reason] - Reject quote

💰 *Settings:*
• !sera busy on/off - Handle family calls (Class Mode)
• !sera price <item>=<price> - Add pricing
• !sera note <instruction> - Add instruction
• !sera settings - View all settings
• !sera clear <instructions|prices> - Clear settings

💡 Examples:
!sera price sticker 100pc = Rs.2500
!sera note always greet in Sinhala first`;
        }
    }
}

/**
 * Simple rate limiter for incoming messages
 */
const rateLimits: Record<string, { count: number; lastReset: number }> = {};

export function checkRateLimit(phone: string): boolean {
    const now = Date.now();
    const limit = 20; // max 20 messages per minute
    const windowMs = 60000;

    if (!rateLimits[phone]) {
        rateLimits[phone] = { count: 1, lastReset: now };
        return true;
    }

    const { count, lastReset } = rateLimits[phone];

    if (now - lastReset > windowMs) {
        rateLimits[phone] = { count: 1, lastReset: now };
        return true;
    }

    if (count >= limit) {
        return false;
    }

    rateLimits[phone].count++;
    return true;
}

// ===============================================
// CONVERSATION MANAGEMENT
// ===============================================

/**
 * Get or create conversation (Atomic Upsert)
 */
export async function getConversation(phone: string): Promise<any> {
    await dbConnect();
    const conv = await Conversation.findOneAndUpdate(
        { phone },
        {
            $setOnInsert: {
                messages: [],
                customerMood: 'neutral',
                isCustomer: true,
                orderStatus: 'none',
                requirements: {},
                createdAt: new Date()
            },
            $set: {
                updatedAt: new Date()
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return conv;
}

/**
 * Add message to conversation history
 */
export async function addMessage(phone: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    await dbConnect();
    await Conversation.findOneAndUpdate(
        { phone },
        {
            $push: {
                messages: {
                    $each: [{ role, content, timestamp: new Date() }],
                    $slice: -50 // Keep only last 50 messages
                }
            },
            $set: { updatedAt: new Date() }
        },
        { upsert: true }
    );
}

/**
 * Get conversation history for AI context
 */
export async function getHistory(phone: string, limit: number = 15): Promise<Array<{ role: string; content: string }>> {
    const conv = await getConversation(phone);
    const recentMessages = conv.messages?.slice(-limit) || [];
    return recentMessages.map((m: any) => ({
        role: m.role,
        content: m.content
    }));
}

/**
 * Update conversation order status
 */
export async function updateOrderStatus(phone: string, status: string, requirements?: any): Promise<void> {
    await dbConnect();
    const update: any = { orderStatus: status, updatedAt: new Date() };
    if (requirements) {
        update.requirements = requirements;
    }
    await Conversation.findOneAndUpdate({ phone }, { $set: update });
}

// ===============================================
// FRIEND DETECTION (Sri Lankan Slang)
// ===============================================

/**
 * Detect if user is likely a personal friend (not customer)
 * 
 * SMARTER LOGIC:
 * - Requires MULTIPLE friend signals (not just one word)
 * - Must have NO business-related words at all
 * - Only triggers on very clearly casual/personal conversations
 */
export function detectFriend(messages: string[]): boolean {
    const text = messages.join(' ').toLowerCase();

    // Friend signals - casual Sri Lankan slang (from real chats)
    const friendSignals = [
        // Classic slang
        /මචං|මචන්|machang|macho|machan/i,
        /යකෝ|යකො|yako|yakko/i,
        /බල්ලෝ|ballo|balla/i,
        // Real friend chat patterns (from user's examples)
        /pako|pakaya|hutto|huthi|hutho/i,
        /ponnaya|ponni|karia|kariya/i,
        /palayan|pala pala/i,
        /kohetd|koheda|kohed|kohe/i,
        /wren|wareng|warang/i,
        /parata|cls|class/i,
        /set na|set nane|set eka/i,
        /el ek|ella|el/i,
        /hariye|hari bn|aiye|aiyo/i,
        // Hangout/casual
        /drink|beer|arrack|party|hangout|outing/i,
        /game එමු|play කරමු|match බලමු/i,
        /yan|yamu|enwa|ennada/i,
        // Questions about whereabouts
        /mokada karanne|free da|busy da/i,
        /inne|innawada|kohomada/i,
    ];

    // Business signals - web development related
    const businessSignals = [
        /website|web site|වෙබ්|site/i,
        /app|application|mobile|phone/i,
        /software|system|program/i,
        /price|මිල|cost|rate|charge/i,
        /quote|quotation|estimate/i,
        /business|company|shop|store|restaurant/i,
        /page|pages|පිටු/i,
        /design|logo|brand/i,
        /domain|hosting|server/i,
        /ecommerce|e-commerce|online/i,
        /order|orde|ඕඩර්/i,
        /project|work|job/i,
        /one|ඕනෙ|need|want/i,
    ];

    // Count friend signals
    const friendCount = friendSignals.filter(p => p.test(text)).length;

    // Check for ANY business signal
    const hasBusinessSignal = businessSignals.some(p => p.test(text));

    // Only flag as friend if:
    // 1. At least 2 friend signals present
    // 2. NO business signals at all
    // 3. Message is very short (likely casual)
    const isShortMessage = text.length < 100;

    return friendCount >= 2 && !hasBusinessSignal && isShortMessage;
}

// ===============================================
// MOOD ANALYSIS
// ===============================================

export type CustomerMood = 'frustrated' | 'angry' | 'happy' | 'satisfied' | 'urgent' | 'confused' | 'neutral';

/**
 * Analyze customer mood from message
 * Enhanced with Sinhala patterns
 */
export function analyzeMood(message: string): CustomerMood {
    const text = message.toLowerCase();

    // Angry/Frustrated patterns
    const angryPatterns = [
        /angry|frustrated|upset|terrible|worst|horrible|disgusting/i,
        /කෝපයි|ඉවසිල්ල නැහැ|බලන්නෑ|පරණ|අකමැති/i,
        /waste|useless|pathetic|stupid|idiot/i,
        /rip off|scam|cheat|fraud/i,
        /never again|worst experience|disappointed/i,
        /wtf|what the|seriously\?|are you kidding/i,
        /!!+|\?\?+/  // Multiple punctuation indicates frustration
    ];

    // Happy/Satisfied patterns
    const happyPatterns = [
        /thanks|thank you|awesome|great|excellent|perfect|amazing/i,
        /ස්තුති|සතුටුයි|හොඳයි|නියමයි|සුපිරි/i,
        /love it|beautiful|wonderful|fantastic/i,
        /happy|pleased|satisfied|impressed/i,
        /❤️|😍|🥰|💖|👍|🙏|✨/
    ];

    // Urgent patterns
    const urgentPatterns = [
        /urgent|asap|immediately|right now|today/i,
        /ඉක්මන්|දැන්ම|හදිසි|ඉක්මනින්/i,
        /rush|emergency|deadline|hurry/i,
        /need it by|must have|critical/i,
        /⚡|🔥|‼️|❗/
    ];

    // Confused patterns
    const confusedPatterns = [
        /confused|don't understand|what do you mean/i,
        /තේරුනේ නැ|මොකක්ද|කොහොමද/i,
        /how does|can you explain|not sure/i,
        /\?\s*$/  // Ends with question mark
    ];

    if (angryPatterns.some(p => p.test(text))) return 'frustrated';
    if (happyPatterns.some(p => p.test(text))) return 'happy';
    if (urgentPatterns.some(p => p.test(text))) return 'urgent';
    if (confusedPatterns.some(p => p.test(text))) return 'confused';

    return 'neutral';
}

/**
 * Check if mood requires escalation
 */
export function needsEscalation(mood: CustomerMood): boolean {
    return mood === 'frustrated' || mood === 'angry';
}

// ===============================================
// SETTINGS MANAGEMENT
// ===============================================

/**
 * Save bot setting to MongoDB
 */
export async function saveSetting(key: string, value: any, updatedBy: string): Promise<void> {
    await dbConnect();
    await BotSettings.findOneAndUpdate(
        { key },
        {
            $set: {
                value,
                updatedBy,
                updatedAt: new Date()
            }
        },
        { upsert: true }
    );
}

/**
 * Get bot setting from MongoDB
 */
export async function getSetting(key: string): Promise<any> {
    await dbConnect();
    const setting = await BotSettings.findOne({ key });
    return setting?.value;
}

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<any> {
    await dbConnect();
    const settings = await BotSettings.find({});
    const result: any = {};
    settings.forEach((s: any) => {
        result[s.key] = s.value;
    });
    return result;
}

// ===============================================
// QUOTATION SYSTEM
// ===============================================

/**
 * Create pending quote for admin approval
 */
export async function createPendingQuote(
    phone: string,
    customerName: string,
    requirements: any,
    suggestedQuote: any
): Promise<any> {
    await dbConnect();

    const quote = await PendingQuote.create({
        phone,
        customerName,
        requirements,
        suggestedQuote,
        adminApproved: false,
        createdAt: new Date()
    });

    // Notify admins via Discord
    await sendDiscordNotification('quote', {
        phone,
        customerName,
        requirements,
        suggestedQuote,
        quoteId: quote._id.toString()
    });

    // Log to console webhook
    await sendConsoleLog('info', `New quote created for ${phone}`, { quoteId: quote._id });

    return quote;
}

/**
 * Approve a pending quote
 */
export async function approveQuote(quoteId: string, adminPhone: string, finalQuote?: any): Promise<any> {
    await dbConnect();

    const quote = await PendingQuote.findByIdAndUpdate(
        quoteId,
        {
            $set: {
                adminApproved: true,
                adminPhone,
                ...(finalQuote && { suggestedQuote: finalQuote })
            }
        },
        { new: true }
    );

    if (quote) {
        // Update conversation status
        await updateOrderStatus(quote.phone, 'quote_sent', quote.requirements);

        // Store quotation in conversation
        await Conversation.findOneAndUpdate(
            { phone: quote.phone },
            { $set: { quotation: quote.suggestedQuote } }
        );

        await sendConsoleLog('info', `Quote ${quoteId} approved by ${adminPhone}`);
    }

    return quote;
}

/**
 * Reject a pending quote
 */
export async function rejectQuote(quoteId: string, adminPhone: string, reason?: string): Promise<any> {
    await dbConnect();

    const quote = await PendingQuote.findByIdAndDelete(quoteId);

    if (quote) {
        await updateOrderStatus(quote.phone, 'none');
        await sendConsoleLog('info', `Quote ${quoteId} rejected by ${adminPhone}: ${reason || 'No reason'}`);
    }

    return quote;
}

/**
 * Get pending quotes
 */
export async function getPendingQuotes(): Promise<any[]> {
    await dbConnect();
    return await PendingQuote.find({ adminApproved: false }).sort({ createdAt: -1 });
}

// ===============================================
// ORDER MANAGEMENT
// ===============================================

/**
 * Confirm order and notify
 */
export async function confirmOrder(phone: string, quotation: any): Promise<any> {
    await dbConnect();

    const conv = await getConversation(phone);
    const advancePercentage = parseInt(process.env.ADVANCE_PERCENTAGE || '40') / 100;

    const order = await Order.create({
        phone,
        customerName: conv.requirements?.name || 'Customer',
        requirements: conv.requirements,
        quotation: {
            items: quotation.items || [],
            total: quotation.total || 0,
            advance: Math.round((quotation.total || 0) * advancePercentage)
        },
        status: 'pending_payment',
        paymentStatus: 'pending',
        createdAt: new Date()
    });

    // Update conversation status
    await updateOrderStatus(phone, 'confirmed');

    // Notify via Discord
    await sendDiscordNotification('order', {
        orderId: order._id.toString(),
        phone,
        customerName: order.customerName,
        requirements: order.requirements,
        quotation: order.quotation
    });

    // Send WhatsApp to owner
    await sendWhatsAppToAdmin(OWNER_PERSONAL_PHONE,
        `🎉 New Order Confirmed!\n\nCustomer: ${phone}\nTotal: Rs. ${quotation.total?.toLocaleString()}\nAdvance: Rs. ${order.quotation.advance?.toLocaleString()}`
    );

    // Generate PDF Invoice/Quote
    try {
        const pdfPath = await generateQuotePDF({
            id: order._id.toString(),
            clientName: order.customerName,
            clientPhone: phone,
            items: order.quotation.items,
            total: order.quotation.total,
            advance: order.quotation.advance
        }, 'QUOTATION');

        console.log(`[Seranex] 📄 PDF generated: ${pdfPath}`);

        // Notify Discord about PDF
        await sendConsoleLog('info', `PDF Quotation generated for ${phone}`, { pdfPath });

        return { order, pdfPath };
    } catch (pdfErr) {
        const errorMessage = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
        console.error('[Seranex] ❌ PDF Generation failed:', errorMessage);
        return { order, pdfPath: null };
    }
}

/**
 * Update order status
 */
export async function updateOrder(orderId: string, updates: any): Promise<any> {
    await dbConnect();
    return await Order.findByIdAndUpdate(orderId, { $set: updates }, { new: true });
}

/**
 * Get orders by status
 */
export async function getOrdersByStatus(status?: string): Promise<any[]> {
    await dbConnect();
    const query = status ? { status } : {};
    return await Order.find(query).sort({ createdAt: -1 });
}

/**
 * Get order by phone
 */
export async function getOrderByPhone(phone: string): Promise<any> {
    await dbConnect();
    return await Order.findOne({ phone }).sort({ createdAt: -1 });
}

// ===============================================
// COMPLAINT HANDLING
// ===============================================

/**
 * Handle customer complaint
 */
export async function handleComplaint(phone: string, message: string): Promise<void> {
    // Send to complaints Discord webhook
    await sendDiscordNotification('complaint', {
        phone,
        message,
        timestamp: new Date().toISOString()
    });

    // Notify Riyon directly
    await sendWhatsAppToAdmin(RIYON_PHONE,
        `⚠️ Complaint Alert!\n\nFrom: ${phone}\nMessage: ${message}`
    );

    // Log it
    await sendConsoleLog('warn', `Complaint from ${phone}`, { message });
}

// ===============================================
// BUSINESS HOURS
// ===============================================

/**
 * Check if current time is within business hours
 * Business hours: Mon-Sat 8AM-8PM, Sun 9AM-5PM (Sri Lanka Time)
 */
export function isBusinessHours(): boolean {
    const now = new Date();
    // Convert to Sri Lanka time (UTC+5:30)
    const sriLankaOffset = 5.5 * 60 * 60 * 1000;
    const sriLankaTime = new Date(now.getTime() + sriLankaOffset);

    const day = sriLankaTime.getUTCDay(); // 0 = Sunday
    const hour = sriLankaTime.getUTCHours();

    if (day === 0) {
        // Sunday: 9 AM - 5 PM
        return hour >= 9 && hour < 17;
    } else if (day >= 1 && day <= 6) {
        // Mon-Sat: 8 AM - 8 PM
        return hour >= 8 && hour < 20;
    }

    return false;
}

/**
 * Get business hours message
 */
export function getBusinessHoursMessage(): string {
    return `
🕐 *After Hours Notice*

Thank you for reaching out! 🙏

Our business hours:
📅 Mon-Sat: 8:00 AM - 8:00 PM
📅 Sunday: 9:00 AM - 5:00 PM

I've noted your message and our team will respond first thing during business hours!

Urgent? Call: +94 76 829 0477
`;
}

// ===============================================
// STATISTICS
// ===============================================

/**
 * Get bot statistics
 */
export async function getBotStats(): Promise<any> {
    await dbConnect();

    const [
        totalConversations,
        pendingQuotes,
        activeOrders,
        completedOrders
    ] = await Promise.all([
        Conversation.countDocuments({}),
        PendingQuote.countDocuments({ adminApproved: false }),
        Order.countDocuments({ status: { $in: ['pending_payment', 'payment_received', 'in_progress'] } }),
        Order.countDocuments({ status: 'completed' })
    ]);

    // System resources
    const freeMem = os.freemem() / (1024 * 1024 * 1024);
    const totalMem = os.totalmem() / (1024 * 1024 * 1024);
    const uptime = os.uptime(); // seconds

    return {
        totalConversations,
        pendingQuotes,
        activeOrders,
        completedOrders,
        isBusinessHours: isBusinessHours(),
        serverTime: new Date().toISOString(),
        system: {
            memory: `${(totalMem - freeMem).toFixed(2)}GB / ${totalMem.toFixed(2)}GB`,
            uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            platform: os.platform(),
            cpuLoad: os.loadavg()[0] || 0
        }
    };
}
