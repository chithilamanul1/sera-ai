import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/engine';
import Customer from '@/models/Customer';
import dbConnect from '@/lib/db';
import axios from 'axios';

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

        // Extract phone number from JID (format: 94771234567@s.whatsapp.net)
        const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');

        // Get message text
        const messageText = message.conversation ||
            message.extendedTextMessage?.text ||
            message.imageMessage?.caption ||
            '';

        if (!messageText) {
            return NextResponse.json({ status: 'no_text' });
        }

        console.log(`[ZapToBox] Message from ${phoneNumber}: ${messageText}`);

        // Find or create customer
        let customer = await Customer.findOne({ phoneNumber });
        if (!customer) {
            customer = await Customer.create({
                phoneNumber,
                name: 'WhatsApp User',
                isAiPaused: false
            });
        }

        // Check if AI is paused for this customer
        if (customer.isAiPaused) {
            console.log(`[ZapToBox] AI paused for ${phoneNumber}`);
            return NextResponse.json({ status: 'ai_paused' });
        }

        // Generate AI response
        const aiResponse = await generateAIResponse(
            messageText,
            [], // No history for now
            {
                phone: phoneNumber,
                customerName: customer.name,
                customerId: customer._id
            }
        );

        // Send reply via ZapToBox API
        await sendZapToBoxMessage(remoteJid, aiResponse.text);

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
