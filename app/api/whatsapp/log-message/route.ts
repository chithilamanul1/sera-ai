import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { addMessage } from '@/lib/seranex/agent';

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const { phone, message, role } = await req.json();

        if (!phone || !message) {
            return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 });
        }

        console.log(`[LogMsg] Logging ${role} message for ${phone}`);
        await addMessage(phone, role || 'assistant', message);

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const err = error as Error;
        console.error('[LogMsg] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
