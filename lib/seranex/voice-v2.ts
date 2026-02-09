// Transcription Result Interface
import { notifyGeminiRateLimit } from './notifications';

export interface TranscriptionResult {
    text: string;
    language: 'en' | 'si' | 'unknown';
    duration?: number;
    confidence?: number;
}

/**
 * Ultimate Fallback: OpenAI Whisper
 */
async function transcribeWhisper(audioBase64: string): Promise<TranscriptionResult> {
    const OpenAI = (await import('openai')).default;
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    const tempFilePath = path.join(os.tmpdir(), `voice_fallback_${Date.now()}.ogg`);

    try {
        const buffer = Buffer.from(audioBase64, 'base64');
        fs.writeFileSync(tempFilePath, buffer);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-1",
        });

        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        return {
            text: transcription.text.trim(),
            language: 'unknown',
            confidence: 1.0
        };
    } catch (err: unknown) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        const errorMsg = (err as Error).message || 'Unknown error';
        console.error('[Whisper] ❌ Fallback failed:', errorMsg);
        throw new Error('Both Gemini and OpenAI Whisper transcription failed.');
    }
}

/**
 * Primary Voice Transcription (Flipped to Gemini as requested)
 */
export async function transcribeVoice(
    audioBase64: string,
    mimeType: string = 'audio/ogg'
): Promise<TranscriptionResult> {
    console.log(` [Seranex] 🎙️ Primary attempt: GEMINI TRANSCRIPTION...`);

    try {
        return await transcribeGeminiFallback(audioBase64, mimeType);
    } catch {
        console.log(` [Seranex] ⚠️ Gemini failed. Falling back to OPENAI WHISPER...`);
        return await transcribeWhisper(audioBase64);
    }
}

/**
 * Internal helper for Gemini rotation logic
 */
async function transcribeGeminiFallback(audioBase64: string, mimeType: string): Promise<TranscriptionResult> {
    const { default: keyRotator } = await import('./gemini-keys');
    const axios = (await import('axios')).default;

    let cleanMimeType = mimeType.split(';')[0].trim();
    if (cleanMimeType === 'audio/ogg' || cleanMimeType.includes('opus')) {
        cleanMimeType = 'audio/ogg';
    }

    const models = [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash-latest'
    ];

    // --- TIER 1: FAST LANE (Master Key) ---
    const masterKey = keyRotator.getMasterKey();
    if (masterKey) {
        for (const modelName of models.slice(0, 2)) {
            try {
                console.log(` [Seranex] 🎙️ FAST LANE Voice: Attempting ${modelName}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${masterKey}`;
                const response = await axios.post(url, {
                    contents: [{
                        role: 'user',
                        parts: [
                            { inlineData: { data: audioBase64, mimeType: cleanMimeType } },
                            { text: "Transcribe this audio precisely. Sinhala/English/Singlish support. Only return text." }
                        ]
                    }]
                }, { timeout: 15000, family: 4 });

                if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const text = response.data.candidates[0].content.parts[0].text.trim();
                    return { text, language: detectLanguage(text), confidence: 1.0 };
                }
            } catch (err: unknown) {
                const axiosError = err as Record<string, unknown>;
                const response = axiosError?.response as Record<string, unknown>;
                console.log(` [Seranex] 🎙️ Fast Lane Voice (${modelName}) Fail.`);
                if (response?.status === 429) {
                    await notifyGeminiRateLimit(modelName, masterKey.substring(masterKey.length - 4), 0);
                }
            }
        }
    }

    // --- TIER 2: ROBUST ROTATION ---
    let currentModelIndex = 0;
    let totalAttempts = models.length * keyRotator.getKeyCount();

    while (totalAttempts > 0) {
        const modelName = models[currentModelIndex % models.length];
        const keyIndex = totalAttempts % keyRotator.getKeyCount();
        const currentKey = keyRotator.getBackupKey(keyIndex);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentKey}`;

        try {
            console.log(` [Seranex] 🎙️ ROTATION Voice: Attempting ${modelName} with Key #${keyIndex + 1}...`);

            const response = await axios.post(url, {
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { data: audioBase64, mimeType: cleanMimeType } },
                        { text: "Transcribe precisely. Only return text." }
                    ]
                }]
            }, { timeout: 15000, family: 4 });

            if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                const text = response.data.candidates[0].content.parts[0].text.trim();
                return { text, language: detectLanguage(text), confidence: 1.0 };
            }

        } catch (err: unknown) {
            const axiosError = err as Record<string, unknown>;
            const response = axiosError?.response as Record<string, unknown>;
            const errorData = response?.data as Record<string, unknown>;
            const errorInner = errorData?.error as Record<string, unknown>;
            const errorMsg = (errorInner?.message as string) || (axiosError?.message as string) || 'Unknown error';
            const errorStatus = (response?.status as number) || 'UNKNOWN';

            console.log(` [Seranex] 🎙️ Fail (${modelName}): Status ${errorStatus} - ${errorMsg.substring(0, 100)}`);

            if (errorInner) {
                console.log(` [Seranex] 🛑 Full error:`, JSON.stringify(errorInner).substring(0, 200));
            }

            if (response?.status === 429) {
                await notifyGeminiRateLimit(modelName, currentKey.substring(currentKey.length - 4), keyIndex);
            }

            totalAttempts--;
            if (totalAttempts > 0 && totalAttempts % keyRotator.getKeyCount() === 0) {
                currentModelIndex++;
            }
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    // --- TIER 3: EMERGENCY PARTITION ---
    if (keyRotator.getTier3KeyCount() > 0) {
        console.log(` [Seranex] 🎙️ Tier 2 exhausted. Trying Tier 3 (Backup Partition)...`);
        for (let i = 0; i < keyRotator.getTier3KeyCount(); i++) {
            const backupKey = keyRotator.getTier3Key(i);
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${backupKey}`;
                const response = await axios.post(url, {
                    contents: [{
                        role: 'user',
                        parts: [
                            { inlineData: { data: audioBase64, mimeType: cleanMimeType } },
                            { text: "Transcribe precisely. Only return text." }
                        ]
                    }]
                }, { timeout: 20000, family: 4 });

                if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const text = response.data.candidates[0].content.parts[0].text.trim(); // Added .trim()
                    return { text, language: detectLanguage(text), confidence: 1.0 }; // Changed to return TranscriptionResult
                }
            } catch { // Changed from catch to catch {}
                // Silently continue through backup pool
            }
        }
    }

    throw new Error('All Gemini keys (Primary, Backup, and Emergency) exhausted for voice.'); // Changed error message
}

/**
 * Detect language from transcribed text
 */
function detectLanguage(text: string): 'en' | 'si' | 'unknown' {
    const textLower = text.toLowerCase();
    const sinhalaPatterns = [
        'oyata', 'mata', 'api', 'oya', 'ekak', 'denna', 'karanna',
        'hadanna', 'balanna', 'kiyanna', 'eliya', 'hari', 'nisa',
        'neda', 'wage', 'mokada', 'koheda', 'kawda', 'kawadawala',
        'website ekak', 'app ekak', 'price eka', 'one neda',
        'hadanawa', 'gaak', 'ganna', 'hoyanna', 'danna',
        'kohomada', 'mokakda', 'kawadada', 'aethda', 'puluwanda',
        'bn', 'nane', 'owa', 'eka', 'eke', 'ekata'
    ];

    let sinhalaCount = 0;
    for (const pattern of sinhalaPatterns) {
        if (textLower.includes(pattern)) sinhalaCount++;
    }

    if (sinhalaCount >= 2) return 'si';

    const englishPatterns = ['hello', 'hi', 'please', 'thank you', 'would like', 'want to'];
    let englishCount = 0;
    for (const pattern of englishPatterns) {
        if (textLower.includes(pattern)) englishCount++;
    }

    if (englishCount > 0 && sinhalaCount === 0) return 'en';
    return sinhalaCount > 0 ? 'si' : 'unknown';
}

/**
 * Process voice message from WhatsApp
 */
export async function processWhatsAppVoice(
    mediaBase64: string,
    mimeType: string
): Promise<TranscriptionResult> {
    console.log(`🎤 Processing voice message (${mimeType})...`);
    const result = await transcribeVoice(mediaBase64, mimeType);
    console.log(`📝 Transcribed: "${result.text}" (${result.language})`);
    return result;
}

const voiceService = {
    transcribeVoice,
    processWhatsAppVoice,
    detectLanguage
};

export default voiceService;
