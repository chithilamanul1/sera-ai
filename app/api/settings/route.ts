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
        const { isAiActive, geminiKeys } = body;

        let settings = await SystemSettings.findOne({ key: 'global' });
        if (!settings) {
            settings = await SystemSettings.create({
                key: 'global',
                isAiActive: isAiActive !== undefined ? isAiActive : true,
                geminiKeys: geminiKeys || {}
            });
        } else {
            if (isAiActive !== undefined) settings.isAiActive = isAiActive;
            if (geminiKeys) {
                // Merge or replace keys
                settings.geminiKeys = { ...(settings.geminiKeys || {}), ...geminiKeys };
                settings.markModified('geminiKeys');
            }
            await settings.save();
        }

        // Log the change
        if (isAiActive !== undefined) {
            await logToDiscord(
                'System Settings Updated',
                `AI Status changed to: **${settings.isAiActive ? 'ACTIVE' : 'PAUSED'}**`,
                'WARN'
            );
        }
        if (geminiKeys) {
            await logToDiscord(
                'API Keys Updated',
                `Gemini API Keys updated via Discord/Admin. Total keys now in DB: **${Object.keys(settings.geminiKeys).length}**`,
                'INFO'
            );
        }

        return NextResponse.json(settings);
    } catch (error: any) {
        console.error("Settings Update Error:", error.message);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
