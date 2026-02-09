import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// The WhatsApp Bot runs on a specific port (usually 3001)
const WHATSAPP_BOT_URL = process.env.WHATSAPP_BOT_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
    try {
        const { phone, message } = await req.json();

        if (!phone || !message) {
            return NextResponse.json({ success: false, error: 'Missing phone or message' }, { status: 400 });
        }

        // Forward the message request to the WhatsApp bot's internal API
        // bot.js likely handles actions/messages via its own management server or listener
        // If it doesn't have a direct endpoint, we can use a "trigger" or direct bot.sendMessage call
        // But the most robust way is to have the bot listen for incoming "broadcast" events.

        // For now, let's assume we have a way to pipe this into the bot.
        // We can use a webhook or a direct axios call if the bot exposes a port.
        const response = await axios.post(`${WHATSAPP_BOT_URL}/send-message`, {
            phone,
            message
        }, { timeout: 5000 });

        return NextResponse.json({ success: true, botResponse: response.data });
    } catch (error: any) {
        console.error('[Broadcast API] Error:', error.message);
        return NextResponse.json({
            success: false,
            error: error.message,
            note: 'Ensure the WhatsApp bot is running and its internal API is accessible.'
        }, { status: 500 });
    }
}
