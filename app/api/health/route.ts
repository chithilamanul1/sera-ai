import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import SystemSettings from '@/models/SystemSettings';
import { keyRotator } from '@/lib/ai/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await dbConnect();
        const settings = await SystemSettings.findOne({ key: 'global' });

        return NextResponse.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'Seranex Lanka API',
            geminiKeys: {
                active: keyRotator.getKeyCount(),
                backup: keyRotator.getTier3KeyCount()
            },
            dbKeys: {
                active: Object.keys(settings?.geminiKeys || {}).length,
                backup: Object.keys(settings?.backupGeminiKeys || {}).length
            },
            version: '1.2.0'
        });
    } catch (_err) {
        return NextResponse.json({ status: 'error', message: 'DB Error' }, { status: 500 });
    }
}
