import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { Conversation } from '@/models/Seranex';

export async function GET(req: NextRequest) {
    try {
        await dbConnect();

        // Get unique phone numbers (all customers who have messaged the bot)
        const phones = await Conversation.distinct('phone');

        return NextResponse.json({
            success: true,
            count: phones.length,
            phones
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
