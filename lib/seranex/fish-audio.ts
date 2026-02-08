import axios from 'axios';

/**
 * Fish Audio TTS Service
 * High-quality AI Voice
 */
export async function generateFishAudioSpeech(text: string): Promise<string> {
    const apiKey = process.env.FISH_AUDIO_API_KEY;
    if (!apiKey) throw new Error('FISH_AUDIO_API_KEY is not defined');

    console.log(`[FishAudio] 🗣️ Generating premium speech for: "${text.substring(0, 50)}..."`);

    try {
        const response = await axios.post(
            'https://api.fish.audio/v1/tts',
            {
                text: text,
                reference_id: '7f92f8afb8ec43bf81f50517e65fe601', // Default high-quality female voice
                format: 'mp3',
                latency: 'normal'
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: 10000, // 10 seconds timeout
                family: 4 // Force IPv4
            }
        );

        const buffer = Buffer.from(response.data);
        return buffer.toString('base64');
    } catch (error: any) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        console.error('[FishAudio] ❌ Error:', errorMsg);
        throw new Error(`Fish Audio failed: ${errorMsg}`);
    }
}
