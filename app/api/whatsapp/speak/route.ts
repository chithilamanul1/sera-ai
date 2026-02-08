import { NextRequest, NextResponse } from 'next/server';
import { EdgeTTS } from 'edge-tts-universal';
import { generateElevenLabsSpeech } from '@/lib/seranex/elevenlabs';
import { generateFishAudioSpeech } from '@/lib/seranex/fish-audio';

export async function POST(req: NextRequest) {
    try {
        const { text } = await req.json();

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        // --- FISH AUDIO (ULTRA PREMIUM) ---
        if (process.env.FISH_AUDIO_API_KEY) {
            try {
                const audioBase64 = await generateFishAudioSpeech(text);
                return NextResponse.json({
                    success: true,
                    audioBase64,
                    mimeType: 'audio/mp3',
                    provider: 'fish-audio'
                });
            } catch (fishError: any) {
                console.error('[Seranex] ❌ Fish Audio Failed:', fishError.message);
                // Fall through to ElevenLabs/Edge-TTS
            }
        }

        // --- ELEVENLABS (PREMIUM) ---
        if (process.env.ELEVENLABS_API_KEY) {
            try {
                const audioBase64 = await generateElevenLabsSpeech(text);
                return NextResponse.json({
                    success: true,
                    audioBase64,
                    mimeType: 'audio/mp3',
                    provider: 'elevenlabs'
                });
            } catch (elError: any) {
                console.error('[Seranex] ❌ ElevenLabs Failed, falling back to Edge-TTS:', elError.message);
                // Fall through to Edge-TTS
            }
        }

        // --- EDGE-TTS (FREE) ---
        console.log(`[Seranex] 🗣️ Generating free speech (Edge-TTS) for: "${text.substring(0, 50)}..."`);

        const tts = new EdgeTTS(text, 'si-LK-ThiliniNeural', {
            rate: '+10%',
            pitch: '+0Hz'
        });

        const result = await tts.synthesize();
        const arrayBuffer = await result.audio.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const audioBase64 = buffer.toString('base64');

        return NextResponse.json({
            success: true,
            audioBase64,
            mimeType: 'audio/mp3',
            provider: 'edge-tts'
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[Seranex] ❌ TTS Error:', errorMessage);
        return NextResponse.json({
            success: false,
            error: 'TTS Failed',
            details: errorMessage
        }, { status: 500 });
    }
}
