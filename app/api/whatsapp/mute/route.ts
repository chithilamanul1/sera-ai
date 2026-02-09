import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { MutedContact } from '@/models/Seranex';

export async function GET(req: NextRequest) {
    try {
        await dbConnect();
        const { searchParams } = new URL(req.url);
        const phone = searchParams.get('phone');

        if (phone) {
            const muted = await MutedContact.findOne({ phone });
            return NextResponse.json({ success: true, isMuted: !!muted, data: muted });
        }

        const allMuted = await MutedContact.find({});
        return NextResponse.json({ success: true, count: allMuted.length, data: allMuted });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const body = await req.json();
        const { phone, action, reason, durationHours } = body;

        if (!phone) {
            return NextResponse.json({ success: false, error: 'Phone number required' }, { status: 400 });
        }

        if (action === 'unmute') {
            await MutedContact.deleteOne({ phone });
            return NextResponse.json({ success: true, message: `Unmuted ${phone}` });
        }

        // Mute logic
        let expiresAt = null;
        if (durationHours && typeof durationHours === 'number') {
            expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + durationHours);
        }

        const muted = await MutedContact.findOneAndUpdate(
            { phone },
            {
                phone,
                reason: reason || 'Human Handoff',
                mutedAt: new Date(),
                expiresAt
            },
            { upsert: true, new: true }
        );

        return NextResponse.json({ success: true, message: `Muted ${phone}`, data: muted });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
