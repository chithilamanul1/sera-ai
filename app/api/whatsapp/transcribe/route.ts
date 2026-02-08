/**
 * Voice Transcription API Endpoint
 * POST /api/whatsapp/transcribe
 * 
 * Receives base64 audio from WhatsApp bot and transcribes using Whisper
 */

import { NextRequest, NextResponse } from 'next/server';
// Forced update to V2 to bypass Next.js root conflict cache
import { processWhatsAppVoice } from '@/lib/seranex/voice-v2';
import { sendErrorToDiscord } from '@/lib/seranex/notifications';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { audioBase64, mimeType } = body;

        if (!audioBase64) {
            return NextResponse.json({
                success: false,
                error: 'No audio data provided'
            }, { status: 400 });
        }

        // Process voice message
        const result = await processWhatsAppVoice(
            audioBase64,
            mimeType || 'audio/ogg'
        );

        return NextResponse.json({
            success: true,
            text: result.text,
            language: result.language,
            duration: result.duration
        });

    } catch (error: any) {
        console.error(' [Seranex] ❌ API Route Error:', error.message);

        // Send error to Discord
        await sendErrorToDiscord(
            'Voice Transcription Error',
            error instanceof Error ? error.message : 'Unknown error'
        );

        return NextResponse.json({
            success: false,
            error: error.message || 'Transcription failed',
            details: error.stack
        }, { status: 500 });
    }
}
