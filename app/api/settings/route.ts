import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import dbConnect from '@/lib/db';
import SystemSettings from '@/models/SystemSettings';
import { logToDiscord } from '@/lib/discord/logger';

export async function GET(_req: NextRequest) {
    try {
        await dbConnect();
        let settings = await SystemSettings.findOne({ key: 'global' });
        if (!settings) {
            settings = await SystemSettings.create({ key: 'global', isAiActive: true });
        }
        return NextResponse.json(settings);
    } catch (_error) {
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const body = await req.json();
        const { isAiActive, geminiKeys, bulkKeys } = body;

        let settings = await SystemSettings.findOne({ key: 'global' });
        if (!settings) {
            settings = await SystemSettings.create({
                key: 'global',
                isAiActive: isAiActive !== undefined ? isAiActive : true,
                geminiKeys: geminiKeys || {},
                backupGeminiKeys: {}
            });
        } else {
            if (isAiActive !== undefined) settings.isAiActive = isAiActive;

            // Handle bulk replacement
            if (bulkKeys && Array.isArray(bulkKeys)) {
                // Move current keys to backup partition
                settings.backupGeminiKeys = { ...(settings.backupGeminiKeys || {}), ...(settings.geminiKeys || {}) };

                // Set new keys
                const newKeyMap: Record<string, string> = {};
                bulkKeys.forEach((k: string, i: number) => {
                    newKeyMap[`index_${i}`] = k;
                });
                settings.geminiKeys = newKeyMap;
                settings.markModified('geminiKeys');
                settings.markModified('backupGeminiKeys');
            } else if (geminiKeys) {
                // Individual update/merge
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
        if (bulkKeys) {
            await logToDiscord(
                'Bulk API Keys Updated',
                `Dumped **${bulkKeys.length}** new keys. Old keys moved to backup partition.`,
                'SUCCESS'
            );
        } else if (geminiKeys) {
            await logToDiscord(
                'API Keys Updated',
                `Gemini API Keys updated. Total active: **${Object.keys(settings.geminiKeys).length}**`,
                'INFO'
            );
        }

        return NextResponse.json(settings);
    } catch (err: unknown) { // Changed 'error: any' to 'err: unknown'
        if (err instanceof Error) {
            console.error("Settings Update Error:", err.message);
        } else {
            console.error("Settings Update Error:", err);
        }
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
