// Transcription Result Interface
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
    } catch (error: any) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        console.error('[Whisper] ❌ Fallback failed:', error.message);
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
    } catch (geminiError) {
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

    // Clean MIME type for Gemini
    let cleanMimeType = mimeType.split(';')[0].trim();
    if (cleanMimeType === 'audio/ogg' || cleanMimeType.includes('opus')) {
        cleanMimeType = 'audio/ogg'; // Gemini likes simple types
    }

    const models = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-pro-latest'];
    let currentModelIndex = 0;
    let totalAttempts = models.length * keyRotator.getKeyCount();

    while (totalAttempts > 0) {
        const modelName = models[currentModelIndex];
        const currentKey = keyRotator.getCurrentKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentKey}`;

        try {
            console.log(` [Seranex] 🎙️ Attempting ${modelName} with Key #${keyRotator.getCurrentIndex()}...`);

            const response = await axios.post(url, {
                contents: [{
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                data: audioBase64,
                                mimeType: cleanMimeType
                            }
                        },
                        {
                            text: "Transcribe this audio precisely. If the language is Sinhala, use Sinhala script. If it is English, use English. If it is Singlish, transcribe the Sinhala words in English characters. Only return the transcription text, nothing else."
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1, // Low temp for more accurate transcription
                    maxOutputTokens: 1000
                }
            }, {
                timeout: 15000, // Voice can be big, give more time
                family: 4,      // FORCE IPv4 to avoid timeouts
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data && response.data.candidates && response.data.candidates.length > 0) {
                const text = response.data.candidates[0].content.parts[0].text.trim();
                const language = detectLanguage(text);
                return { text, language, confidence: 1.0 };
            } else {
                throw new Error('Empty response from Gemini');
            }

        } catch (error: any) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            console.log(` [Seranex] ⚠️ ${modelName} Fail: ${errorMsg.substring(0, 60)}...`);

            totalAttempts--;

            if (totalAttempts > 0) {
                if (totalAttempts % keyRotator.getKeyCount() === 0) {
                    currentModelIndex++;
                } else {
                    keyRotator.rotate();
                    // Small delay after rotation
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
    }

    throw new Error('All Gemini keys and models exhausted.');
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
