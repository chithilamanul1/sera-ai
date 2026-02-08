import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Customer from '@/models/Customer';
import SystemSettings from '@/models/SystemSettings';
import { logToDiscord } from '@/lib/discord/logger';
import { generateAIResponse } from '@/lib/ai/engine';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'; // We will create this next

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

/**
 * Meta Webhook Verification (GET)
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[WhatsApp] Webhook Verified.');
        return new NextResponse(challenge, { status: 200 });
    } else {
        return new NextResponse('Forbidden', { status: 403 });
    }
}

/**
 * Incoming Messages (POST)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Check if this is a message status update (sent/delivered/read) -> Ignore for now
        if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
            return new NextResponse('OK', { status: 200 });
        }

        const value = body.entry?.[0]?.changes?.[0]?.value;
        const message = value?.messages?.[0];

        if (!message) {
            return new NextResponse('OK', { status: 200 }); // Not a message event
        }

        // 1. Identify Sender
        const senderPhone = message.from; // e.g., "94771234567"
        const senderName = value?.contacts?.[0]?.profile?.name || "Unknown";
        const messageType = message.type; // text, audio, etc.

        let userMessage = "";
        if (messageType === 'text') {
            userMessage = message.text.body;
        } else if (messageType === 'audio') {
            userMessage = "[AUDIO_MESSAGE]"; // Needs Whisper implementation later
        } else {
            userMessage = `[${messageType.toUpperCase()}_MEDIA_RECEIVED]`;
        }

        await dbConnect();

        // 2. Check Global AI Switch
        const settings = await SystemSettings.findOne({ key: 'global' });
        if (settings && settings.isAiActive === false) {
            console.log(`[AI] Global AI Pause active. Ignoring ${senderPhone}.`);
            return new NextResponse('OK', { status: 200 });
        }

        // 3. Check Per-Customer Pause
        let customer = await Customer.findOne({ phoneNumber: senderPhone });
        if (!customer) {
            customer = await Customer.create({
                phoneNumber: senderPhone,
                name: senderName,
            });
        }

        if (customer.isAiPaused) {
            console.log(`[AI] Paused for customer ${senderName} (${senderPhone}). Ignoring.`);
            return new NextResponse('OK', { status: 200 });
        }

        // 4. Trigger AI
        const history = [
            // TODO: Fetch last 5 chat logs from DB
        ];

        // Send "Typing..." indicator (Optional) or just process
        const aiResult = await generateAIResponse(userMessage, []);

        // 5. Send Reply
        await sendWhatsAppMessage(senderPhone, aiResult.text);

        // 6. Log Interaction
        await logToDiscord(
            "AI Reply Sent",
            `To: ${senderName}\nUser: ${userMessage}\nAI: ${aiResult.text}`,
            'INFO'
        );

        return new NextResponse('OK', { status: 200 });

    } catch (error: any) {
        console.error('[WhatsApp] Handler Error:', error);
        await logToDiscord('Webhook Error', error.message, 'ERROR');
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
