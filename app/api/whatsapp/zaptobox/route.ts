import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/engine';
import Customer from '@/models/Customer';
import dbConnect from '@/lib/db';
import axios from 'axios';
import { sendConsoleLog } from '@/lib/seranex/notifications';
import { addMessage, getHistory } from '@/lib/seranex/agent';

const ZAPTOBOX_URL = process.env.ZAPTOBOX_URL || 'http://localhost:3333';
const ZAPTOBOX_TOKEN = process.env.ZAPTOBOX_TOKEN || 'seraauto_zaptobox_secret_token_2026';

// Receive incoming messages from ZapToBox webhook
export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const body = await req.json();

        console.log('[ZapToBox Webhook] Received:', JSON.stringify(body, null, 2));

        // ZapToBox sends different event types
        const eventType = body.event || body.type;

        // Only process incoming messages
        if (eventType !== 'messages.upsert' && eventType !== 'message') {
            return NextResponse.json({ status: 'ignored', event: eventType });
        }

        // Extract message details from ZapToBox payload
        const message = body.data?.message || body.message;
        const remoteJid = body.data?.key?.remoteJid || body.from;

        if (!message || !remoteJid) {
            return NextResponse.json({ status: 'no_message' });
        }

        // Get message text
        const messageText = message.conversation ||
            message.extendedTextMessage?.text ||
            message.imageMessage?.caption ||
            '';

        if (!messageText) {
            return NextResponse.json({ status: 'no_text' });
        }

        // Extract phone number from JID (format: 94771234567@s.whatsapp.net)
        const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');

        // --- AI AUTO-PAUSE LOGIC ---
        // Detect if the message was sent by the owner (manual reply from the phone)
        const isFromMe = body.data?.key?.fromMe || body.fromMe || false;

        if (isFromMe) {
            console.log(`[ZapToBox] Detected manual reply for ${phoneNumber}. Pausing AI & Saving history...`);

            // 1. Save owner message to history so AI can read it later
            await addMessage(phoneNumber, 'assistant', messageText);

            // 2. Pause AI
            await Customer.findOneAndUpdate(
                { phoneNumber },
                { isAiPaused: true },
                { upsert: true }
            );

            await sendConsoleLog('warn', `AI PAUSED for customer ${phoneNumber}`, {
                reason: 'Manual reply from owner detected',
                message: messageText
            });

            return NextResponse.json({ status: 'ai_paused_by_owner' });
        }

        // --- INCOMING MESSAGE HANDLING ---
        console.log(`[ZapToBox] Message from ${phoneNumber}: ${messageText}`);

        // 1. Save user message to history
        await addMessage(phoneNumber, 'user', messageText);

        // 2. Find or create customer
        let customer = await Customer.findOne({ phoneNumber });
        if (!customer) {
            customer = await Customer.create({
                phoneNumber,
                name: 'WhatsApp User',
                isAiPaused: false
            });
        }

        // 3. AUTO-UNPAUSE LOGIC
        // If customer replies while AI is paused, automatically unpause it
        if (customer.isAiPaused) {
            console.log(`[ZapToBox] Customer ${phoneNumber} replied. Automatically unpausing AI...`);
            customer.isAiPaused = false;
            await customer.save();

            await sendConsoleLog('info', `AI AUTO-UNPAUSED for customer ${phoneNumber}`, {
                reason: 'Customer replied to manual conversation'
            });
        }

        // 4. FETCH HISTORY (Analyze last 10 messages)
        const history = await getHistory(phoneNumber, 10);
        console.log(`[ZapToBox] Fetched ${history.length} history items for context.`);

        // 5. Generate AI response with history context
        const aiResponse = await generateAIResponse(
            messageText,
            history.map(m => ({ role: m.role as 'user' | 'assistant' | 'system' | 'model', content: m.content })),
            {
                phone: phoneNumber,
                customerName: customer.name,
                customerId: customer._id
            }
        );

        // 6. Send reply via ZapToBox API
        await sendZapToBoxMessage(remoteJid, aiResponse.text);

        // 7. Save AI reply to history
        await addMessage(phoneNumber, 'assistant', aiResponse.text);

        return NextResponse.json({
            status: 'success',
            response: aiResponse.text,
            model: aiResponse.usedModel
        });

    } catch (error: unknown) {
        console.error('[ZapToBox Webhook] Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// Send message via ZapToBox API
async function sendZapToBoxMessage(to: string, text: string) {
    try {
        const response = await axios.post(
            `${ZAPTOBOX_URL}/message/send-text`,
            {
                jid: to,
                message: text
            },
            {
                headers: {
                    'Authorization': `Bearer ${ZAPTOBOX_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('[ZapToBox] Message sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('[ZapToBox] Failed to send message:', error);
        throw error;
    }
}

// Health check endpoint
export async function GET() {
    return NextResponse.json({
        status: 'ZapToBox webhook ready',
        zaptobox_url: ZAPTOBOX_URL
    });
}
