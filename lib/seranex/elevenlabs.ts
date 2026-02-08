import axios from 'axios';

/**
 * ElevenLabs TTS Utility
 */
export async function generateElevenLabsSpeech(text: string): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgmqS2iW9WcM'; // Default natural voice (Adam or similar)

    if (!apiKey) {
        throw new Error('ELEVENLABS_API_KEY is missing');
    }

    console.log(`[ElevenLabs] 🗣️ Generating premium speech...`);

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await axios.post(url, {
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
        }
    }, {
        headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': apiKey,
            'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
    });

    const buffer = Buffer.from(response.data);
    return buffer.toString('base64');
}
