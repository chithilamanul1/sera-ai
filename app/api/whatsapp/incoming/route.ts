/**
 * Seranex Lanka WhatsApp API
 * Main handler for incoming WhatsApp messages
 * 
 * Features:
 * - AI responses via OpenAI/Gemini
 * - Admin commands (!sera)
 * - Mood analysis & escalation
 * - Friend detection
 * - Quotation workflow
 * - Order management
 */

import { NextRequest, NextResponse } from 'next/server';
import dns from 'node:dns';
import axios from 'axios';

// FORCE IPv4 to fix "Error fetching" / Timeout issues with Gemini/OpenAI
dns.setDefaultResultOrder('ipv4first');

import OpenAI from 'openai';
import dbConnect from '@/lib/db';
import {
    getConversation,
    addMessage,
    getHistory,
    isAdmin,
    isAdminCommand,
    parseAdminCommand,
    saveSetting,
    getSetting,
    getAllSettings,
    detectFriend,
    analyzeMood,
    needsEscalation,
    createPendingQuote,
    approveQuote,
    rejectQuote,
    getPendingQuotes,
    confirmOrder,
    getOrdersByStatus,
    handleComplaint,
    updateOrderStatus,
    getBotStats
} from '@/lib/seranex/agent';
import {
    FRIEND_REDIRECT_MESSAGE,
    COMPLAINT_TRANSFER_MESSAGE,
    ORDER_CONFIRMATION_TEMPLATE
} from '@/lib/seranex/prompts';
import { generateSystemPrompt } from '@/lib/whitelabel/prompts';
import { getUserRole, CUSTOMER_TYPES } from '@/lib/seranex/roles';
import { sendErrorToDiscord } from '@/lib/seranex/notifications';
import { Conversation } from '@/models/Seranex';
import { detectTitle } from '@/lib/seranex/gender-detection';
import { updateUserMemory, UserProfile } from '@/lib/seranex/memory';
import { generateAIResponse } from '@/lib/ai/engine';

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Config
const OWNER_PERSONAL_PHONE = process.env.OWNER_PERSONAL_PHONE || '94772148511';
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'; // 'openai' or 'gemini'

// Rate limiting - simple in-memory tracker
const requestTimestamps: Map<string, number[]> = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // Per phone number

/**
 * Check rate limit for a phone number
 */
function checkRateLimit(phone: string): boolean {
    const now = Date.now();
    const timestamps = requestTimestamps.get(phone) || [];

    // Remove old timestamps
    const recentTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);

    if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
        return false; // Rate limited
    }

    recentTimestamps.push(now);
    requestTimestamps.set(phone, recentTimestamps);
    return true;
}

// ===============================================
// MAIN POST HANDLER
// ===============================================

export async function POST(req: NextRequest) {
    const startTime = Date.now();

    try {
        await dbConnect();
        const body = await req.json();

        const { phone, message, name, voiceData } = body;

        if (!phone || !message) {
            return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 });
        }

        console.log(`\n[Seranex] ━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[Seranex] 📩 From: ${phone}`);
        console.log(`[Seranex] 💬 Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);

        // Rate limit check
        if (!isAdmin(phone) && !checkRateLimit(phone)) {
            console.log(`[Seranex] ⚠️ Rate limited: ${phone}`);
            return NextResponse.json({
                reply: 'ටිකක් පොඩ්ඩක් රැඳී සිටින්න. Too many messages. Please wait a moment. ⏳',
                model: 'rate-limit'
            });
        }

        // Get or create conversation
        const conv = await getConversation(phone);

        // ===============================================
        // ADMIN COMMANDS
        // ===============================================
        if (isAdmin(phone) && isAdminCommand(message)) {
            console.log(`[Seranex] 👑 Admin command detected`);
            const reply = await handleAdminCommand(phone, message);
            await addMessage(phone, 'user', message);
            await addMessage(phone, 'assistant', reply);
            return NextResponse.json({ reply, model: 'admin-command' });
        }

        // ===============================================
        // MOOD ANALYSIS
        // ===============================================
        const mood = analyzeMood(message);
        console.log(`[Seranex] 😊 Mood: ${mood}`);
        await Conversation.findOneAndUpdate({ phone }, { customerMood: mood });

        // ===============================================
        // COMPLAINT/ESCALATION HANDLING
        // ===============================================
        if (needsEscalation(mood)) {
            console.log(`[Seranex] 🚨 Escalating frustrated customer`);
            await handleComplaint(phone, message);
            await addMessage(phone, 'user', message);
            await addMessage(phone, 'assistant', COMPLAINT_TRANSFER_MESSAGE);
            return NextResponse.json({
                reply: COMPLAINT_TRANSFER_MESSAGE,
                model: 'complaint-handler',
                mood
            });
        }

        // ===============================================
        // FRIEND DETECTION
        // ===============================================
        const history = await getHistory(phone, 15);
        const recentUserMessages = history.filter(m => m.role === 'user').map(m => m.content);
        recentUserMessages.push(message);

        // Check if this is a new conversation (less than 3 messages) and seems like a friend
        if (recentUserMessages.length <= 3 && detectFriend(recentUserMessages)) {
            console.log(`[Seranex] 🤝 Friend detected, redirecting`);
            await addMessage(phone, 'user', message);
            await addMessage(phone, 'assistant', FRIEND_REDIRECT_MESSAGE);
            await Conversation.findOneAndUpdate({ phone }, { isCustomer: false });
            return NextResponse.json({
                reply: FRIEND_REDIRECT_MESSAGE,
                model: 'friend-detector',
                mood
            });
        }

        // ===============================================
        // AI RESPONSE GENERATION
        // ===============================================

        // Identify User Role & Memory
        const userRole = getUserRole(phone);
        const userProfile: UserProfile = {
            bondLevel: 0,
            style: 'unknown',
            interests: [],
            language: 'en',
            ...(conv.userProfile || {})
        };
        console.log(`[Seranex] 👤 Role: ${userRole.type} | Bond: ${userProfile.bondLevel}/100`);


        // ===============================================
        // SMART TITLE DETECTION
        // ===============================================
        let customerTitle = 'sir';
        let titleInfo = { title: 'sir', gender: 'unknown', isBusiness: false, isFrequent: false };

        try {
            titleInfo = detectTitle(name || 'Customer', conv?.isFrequentCustomer || false);
            customerTitle = titleInfo.title;

            // Override if Family
            if (userRole.type === CUSTOMER_TYPES.FAMILY) {
                customerTitle = userRole.name;
            }
        } catch (e) {
            console.error('Title detection error:', e);
        }

        // Get any custom instructions from MongoDB
        const customInstructions = await getSetting('custom_instructions') || '';
        const priceGuidelines = await getSetting('price_guidelines') || '';

        // Build system prompt with customizations
        let systemPrompt = generateSystemPrompt(); // Dynamic base prompt

        // --- 🧠 INJECT USER MEMORY (THE BOND) ---
        if (userProfile.interests && userProfile.interests.length > 0) {
            systemPrompt += `\n\n### 🧠 USER MEMORY (IMPORTANT)\n- This user likes: ${userProfile.interests.join(', ')}.\n- Use this info to personalize your response.\n- Bond Level: ${userProfile.bondLevel}/100.`;

            if (userProfile.bondLevel > 50) {
                systemPrompt += `\n- Bond is HIGH. Be warmer, more personal, and friendly!`;
            }
        }

        // Ensure Amma/Thaththa is clearly in memory
        if (userRole.type === CUSTOMER_TYPES.FAMILY) {
            systemPrompt += `\n- This is his ${userRole.name}. You MUST call them "${userRole.name}" in every appropriate sentence.`;
        } else if (userProfile.name) {
            systemPrompt += `\n- User's Name: ${userProfile.name}. Use it occasionally.`;
        }
        // ----------------------------------------

        // --- INJECT ROLE-SPECIFIC INSTRUCTIONS ---
        const isBusy = await getSetting('is_busy') || false;

        if (userRole.type === CUSTOMER_TYPES.FRIEND) {
            systemPrompt += `\n\n### 🎭 MODE: BEST FRIEND (RUDE/FUNNY)\n- This user is a close friend. DO NOT be professional.\n- Use slang words like "Ado", "Machang", "Bn".\n- Be slightly rude but funny. Roast them if they ask stupid questions.\n- Speak in Singlish or Sinhala as appropriate.`;
        } else if (userRole.type === CUSTOMER_TYPES.FAMILY) {
            systemPrompt += `\n\n### 🏠 MODE: FAMILY (${userRole.name.toUpperCase()})\n- This is his ${userRole.name}. BE VERY POLITE AND CREATIVE.`;
            if (isBusy) {
                systemPrompt += `\n- !!! IMPORTANT !!! He is currently in SCHOOL and CANNOT ANSWER RIGHT NOW.
- Tell them politely and creatively that he is busy studying and will call back.
- Use a caring, protective tone. e.g., "Don't worry Auntie/Amma, he's just focusing on his school work right now! I'm Sera, and I'll make sure he calls you back the second he's free. ❤️"`;
            } else {
                systemPrompt += `\n- He is available, but you are still his AI assistant. Be polite.`;
            }
        } else if (userRole.type === CUSTOMER_TYPES.STAFF) {
            systemPrompt += `\n\n### 🛠 MODE: STAFF (INTERNAL)\n- This user is a staff member. Be concise, technical, and direct.\n- No sales talk. Just facts and data.`;
        } else {
            systemPrompt += `\n\n### 💼 MODE: PROFESSIONAL SALES\n- Treat this user as a valued customer.\n- Focus on closing the sale and being helpful.`;
        }

        if (customInstructions) {
            systemPrompt += `\n\n### ADMIN CUSTOM INSTRUCTIONS\n${customInstructions}`;
        }
        if (priceGuidelines) {
            systemPrompt += `\n\n### PRICE GUIDELINES\n${priceGuidelines}`;
        }

        // Add context about current order status if any
        if (conv.orderStatus && conv.orderStatus !== 'none') {
            systemPrompt += `\n\n### CURRENT ORDER STATUS: ${conv.orderStatus}`;
            if (conv.requirements) {
                systemPrompt += `\nCustomer Requirements: ${JSON.stringify(conv.requirements)}`;
            }
        }

        // Inject dynamic title instruction
        systemPrompt += `\n\n### CRITICAL INSTRUCTION FOR THIS CUSTOMER\n`;
        systemPrompt += `You are talking to **${name || 'Customer'}**.\n`;
        systemPrompt += `Based on their name, you MUST address them as "**${customerTitle}**".\n`;
        systemPrompt += `DO NOT use any other title. Use "${customerTitle}" naturally in your sentences.\n`;

        if (titleInfo.isBusiness) {
            systemPrompt += `This is a BUSINESS account. Be professional.\n`;
        } else if (titleInfo.isFrequent && userRole.type !== CUSTOMER_TYPES.FRIEND) {
            systemPrompt += `This is a FREQUENT customer. Be friendly and use "aiye/akke"!\n`;
        } else if (userRole.type === CUSTOMER_TYPES.LEAD) {
            systemPrompt += `This appears to be a NEW/UNKNOWN customer. Always use "sir/miss".\n`;
        }

        // Generate AI response
        let reply = '';
        let usedModel = '';
        let aiActions: any[] = [];

        // 2. Call AI (OpenAI -> Gemini -> Fallback)
        try {
            // Use the centralized engine with God Mode features
            const aiResponse = await generateAIResponse(
                message,
                history.map(m => ({ role: m.role as any, content: m.content })),
                {
                    phone,
                    customerName: name || 'Customer',
                    customerId: conv.customerId
                },
                systemPrompt // Pass the dynamic system prompt we built
            );

            reply = aiResponse.text;
            usedModel = aiResponse.usedModel;
            aiActions = aiResponse.actions || [];

            // Log actions if any
            if (aiActions.length > 0) {
                console.log(`[Seranex] ⚡ Captured ${aiActions.length} God Mode actions.`);
            }

        } catch (aiError: any) {
            console.error(`[Seranex] ❌ AI Error:`, aiError.message);
            await sendErrorToDiscord(aiError, 'AI Generation Failed');

            // Fallback response
            reply = 'Sorry, I\'m having a moment! 🙏 Please try again or contact us directly at +94 76 829 0477\n\nසමාවන්න, මොහොතක් රැඳී නැවත උත්සාහ කරන්න.';
            usedModel = 'fallback';
        }

        // ===============================================
        // SPECIAL TRIGGER HANDLING
        // ===============================================

        // Check if AI wants to generate a quote
        if (reply.includes('[GENERATE_QUOTE]')) {
            reply = reply.replace('[GENERATE_QUOTE]', '');
            await createPendingQuote(phone, name || 'Customer', conv.requirements, {
                items: [],
                total: 0,
                notes: 'Awaiting admin pricing'
            });
            await updateOrderStatus(phone, 'pending_quote');

            reply += '\n\n📝 Your requirements have been sent to our team. They will send you a quotation shortly!';
        }

        // Check if order should be confirmed
        if (reply.includes('[CONFIRM_ORDER]') ||
            (message.toLowerCase().includes('confirm') && conv.orderStatus === 'quote_sent' && conv.quotation)) {
            reply = reply.replace('[CONFIRM_ORDER]', '');
            await confirmOrder(phone, conv.quotation);
            reply = ORDER_CONFIRMATION_TEMPLATE(conv.quotation);
        }

        // Check for escalation trigger
        if (reply.includes('[ESCALATE]')) {
            reply = reply.replace('[ESCALATE]', '');
            await handleComplaint(phone, `Customer needs human assistance. Last message: ${message}`);
        }

        // ===============================================
        // SAVE & RESPOND
        // ===============================================

        await addMessage(phone, 'user', message);
        await addMessage(phone, 'assistant', reply);

        // 4. Background Memory Update (The Bond)
        updateUserMemory(phone, message, reply).catch((err: any) => {
            console.error('[Memory] Background update failed:', err);
        });

        const responseTime = Date.now() - startTime;
        console.log(`[Seranex] ✅ Reply sent (${responseTime}ms, ${usedModel})`);
        console.log(`[Seranex] 📤 ${reply.substring(0, 80)}...`);

        return NextResponse.json({
            reply,
            model: usedModel,
            mood,
            orderStatus: conv.orderStatus,
            responseTime,
            actions: aiActions
        });

    } catch (error: unknown) {
        console.error('[Seranex] ❌ CRITICAL ERROR:', error);

        // Log to file
        const fs = require('fs');
        const errorLog = `\n[${new Date().toISOString()}] ${error instanceof Error ? error.stack : error}\n`;
        fs.appendFileSync('error.log', errorLog);

        // Send to Discord
        if (error instanceof Error) {
            await sendErrorToDiscord(error, 'API Route Error');
        }

        // Return friendly error
        const reply = 'Sorry, we are facing a technical issue. Please try again later. 🙏\n\nසමාවන්න, තාක්ෂණික දෝෂයක් මතු වී ඇත. කරුණාකර මද වේලාවකින් නැවත උත්සාහ කරන්න.';

        return NextResponse.json({
            reply,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// AI Provider functions removed in favor of lib/ai/engine.ts


// ===============================================
// ADMIN COMMAND HANDLER
// ===============================================

async function handleAdminCommand(phone: string, message: string): Promise<string> {
    const { command, args } = parseAdminCommand(message);

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
            } catch (e) {
                return `❌ Error approving quote: ${e instanceof Error ? e.message : 'Unknown error'}`;
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
            } catch (e) {
                return `❌ Error rejecting quote: ${e instanceof Error ? e.message : 'Unknown error'}`;
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
                return `📴 *Busy Mode ACTIVATED*
I will now tell personal/family contacts that you are in school!`;
            } else if (state === 'off' || state === 'false' || state === 'no') {
                await saveSetting('is_busy', false, phone);
                return `🟢 *Busy Mode DEACTIVATED*
Back to normal.`;
            } else {
                const current = await getSetting('is_busy') || false;
                return `📴 *Busy Mode is currently: ${current ? 'ON' : 'OFF'}*
💡 Usage: !sera busy on/off`;
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
            // Return a special prefix that the bot.js will catch to send as voice
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

// ===============================================
// HEALTH CHECK
// ===============================================

export async function GET() {
    const stats = await getBotStats().catch(() => ({}));

    return NextResponse.json({
        status: 'Seranex Lanka AI Ready',
        business: 'Printing & Customization',
        location: 'Seeduwa, Sri Lanka',
        aiProvider: AI_PROVIDER,
        ...stats
    });
}
