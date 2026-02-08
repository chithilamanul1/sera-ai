import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import dbConnect from '@/lib/db';
import SystemSettings from '@/models/SystemSettings';
import { logToDiscord } from '@/lib/discord/logger';

export async function GET(req: NextRequest) {
    try {
        await dbConnect();
        let settings = await SystemSettings.findOne({ key: 'global' });
        if (!settings) {
            settings = await SystemSettings.create({ key: 'global', isAiActive: true });
        }
        return NextResponse.json(settings);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const body = await req.json();
        const { isAiActive } = body;

        let settings = await SystemSettings.findOne({ key: 'global' });
        if (!settings) {
            settings = await SystemSettings.create({ key: 'global', isAiActive });
        } else {
            settings.isAiActive = isAiActive;
            await settings.save();
        }

        // Log the change
        await logToDiscord(
            'System Settings Updated',
            `AI Status changed to: **${isAiActive ? 'ACTIVE' : 'PAUSED'}**`,
            'WARN'
        );

        return NextResponse.json(settings);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
