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
import fs from 'fs';
import dbConnect from '@/lib/db';
import {
    getConversation,
    addMessage,
    getHistory,
    isAdmin,
    isAdminCommand,
    handleAdminCommand,
    checkRateLimit,
    analyzeMood,
    needsEscalation,
    detectFriend,
    handleComplaint,
    updateOrderStatus,
    confirmOrder,
    getSetting,
    createPendingQuote,
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
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'; // 'openai' or 'gemini'


// Rate limiting moved to agent.ts

// ===============================================
// MAIN POST HANDLER
// ===============================================

export async function POST(req: NextRequest) {
    const startTime = Date.now();

    try {
        await dbConnect();
        const body = await req.json();

        const { phone, message, name } = body;


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
            } else if (userRole.type === CUSTOMER_TYPES.FRIEND) {
                customerTitle = 'bn'; // Default friend title
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

        if (userRole.name === 'Sad Friend') {
            systemPrompt += `\n\n### 💖 SPECIAL MODE: SUPPORTIVE FRIEND (+94705163032)\n- This user is a close friend who is often sad or going through a hard time.\n- **DO NOT ROAST HIM.** **DO NOT BE RUDE.**\n- Be an empathetic, supportive listener. Use "Bn" or "Malli" gently.\n- If he shares problems, listen and offer kind words.`;
        } else if (userRole.type === CUSTOMER_TYPES.FRIEND) {
            systemPrompt += `\n\n### 🎭 MODE: BEST FRIEND (RUDE/FUNNY)\n- This user is a close friend. DO NOT be professional.\n- Use slang words like "Ado", "Machang", "Bn", "Oi", "Hutto".\n- Be slightly rude but funny. Roast them if they ask stupid questions.\n- Speak in Singlish or Sinhala as appropriate.`;
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
            // Check if the conversation was owner-initiated (History search)
            const hasOwnerMessage = history.some(m => m.role === 'assistant');
            if (hasOwnerMessage && history.length < 10) {
                systemPrompt += `\n\n### 🤝 MODE: VENDOR / PERSONAL CONTACT (OWNER-INITIATED)\n- It looks like the OWNER initiated this chat. This might be a vendor or a personal contact.\n- DO NOT try to sell them Seranex services unless they ask.\n- Be helpful and professional, or mirror the owner's tone if appropriate.`;
            } else {
                systemPrompt += `\n\n### 💼 MODE: PROFESSIONAL SALES\n- Treat this user as a valued customer.\n- Focus on closing the sale and being helpful.`;
            }
        }

        // Add Routing Cascade Logic
        systemPrompt += `\n\n### 🚦 PROJECT ROUTING CASCADE\n- If a new lead needs a project handled:\n  1. **Primary Contact**: Riyon (Co-Owner).\n  2. **If Riyon says "Ba" / "Busy"**: Ask the owner if we should route to Senior Staff.\n  3. **Fallback**: Route to Staff WordPress or Staff React.`;


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
        let aiActions: Record<string, any>[] = [];

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

        } catch (aiError: any) { // Explicitly keeping any for AI error objects
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

        // Check for [ORDER: JSON] trigger
        if (reply.includes('[ORDER:')) {
            try {
                const match = reply.match(/\[ORDER:\s*({[\s\S]*?})\s*\]/);
                if (match && match[1]) {
                    const orderData = JSON.parse(match[1]);
                    const { order, pdfPath } = await confirmOrder(phone, orderData);
                    reply = reply.replace(/\[ORDER:[\s\S]*?\]/g, '').trim();
                    console.log(`[Seranex] 📦 Auto-confirmed order for ${phone}`);

                    // If PDF was generated, attach it as an action
                    if (pdfPath) {
                        aiActions.push({
                            type: 'SEND_FILE',
                            to: 'CUSTOMER',
                            path: pdfPath,
                            caption: `✅ Order confirmed! I've attached your quotation/invoice here. (ID: ${order._id})`
                        });
                    }
                }
            } catch (orderError: any) {
                console.error('[Seranex] ❌ Failed to parse order tag:', orderError.message);
            }
        }

        // ===============================================
        // SAVE & RESPOND
        // ===============================================

        await addMessage(phone, 'user', message);
        await addMessage(phone, 'assistant', reply);

        // 4. Background Memory Update (The Bond)
        updateUserMemory(phone, message, reply).catch((err: Error) => {
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
        const errorLog = `\n[${new Date().toISOString()}] ${error instanceof Error ? error.stack : error}\n`;
        try {
            fs.appendFileSync('error.log', errorLog);
        } catch (e) {
            console.error('Failed to write to error.log:', e);
        }

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

// Local admin handler removed - using agent.ts version

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
