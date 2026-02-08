import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
if (!process.env.GEMINI_API_KEY) {
    console.error(' [Seranex] ❌ CRITICAL: GEMINI_API_KEY is missing in environment variables!');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

export interface TranscriptionResult {
    text: string;
    language: 'en' | 'si' | 'unknown';
    duration?: number;
    confidence?: number;
}

/**
 * Transcribe voice message from base64 audio
 * @param audioBase64 - Base64 encoded audio data
 * @param mimeType - MIME type of the audio (e.g., 'audio/ogg', 'audio/mpeg')
 * @returns Transcription result with text and detected language
 */
export async function transcribeVoice(
    audioBase64: string,
    mimeType: string = 'audio/ogg'
): Promise<TranscriptionResult> {
    try {
        console.log(` [Seranex] 🤖 Transcribing with Gemini 2.0 Flash...`);

        // Gemini 2.0 Flash can process audio directly from Base64
        const result = await model.generateContent([
            {
                inlineData: {
                    data: audioBase64,
                    mimeType: mimeType
                }
            },
            "Transcribe this audio precisely. If the language is Sinhala, use Sinhala script. If it is English, use English. If it is Singlish, transcribe the Sinhala words in English characters. Only return the transcription text, nothing else."
        ]);

        const text = result.response.text().trim();

        // Detect language from text
        const language = detectLanguage(text);

        return {
            text: text,
            language,
            confidence: 1.0
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(' [Seranex] ❌ Gemini Transcription Error:', errorMessage);

        if (errorMessage.includes('429')) {
            throw new Error('Gemini Rate Limit Exceeded. Please try again in 1 minute.');
        }

        throw new Error(`Failed to transcribe voice message: ${errorMessage}`);
    }
}


/**
 * Detect language from transcribed text
 * Checks for Sinhala words in romanized form
 */
function detectLanguage(text: string): 'en' | 'si' | 'unknown' {
    const textLower = text.toLowerCase();

    // Common Sinhala words in romanized form
    const sinhalaPatterns = [
        // Common words
        'oyata', 'mata', 'api', 'oya', 'ekak', 'denna', 'karanna',
        'hadanna', 'balanna', 'kiyanna', 'eliya', 'hari', 'nisa',
        'neda', 'wage', 'mokada', 'koheda', 'kawda', 'kawadawala',
        // Common phrases
        'website ekak', 'app ekak', 'price eka', 'one neda',
        'hadanawa', 'gaak', 'ganna', 'hoyanna', 'danna',
        // Questions
        'kohomada', 'mokakda', 'kawadada', 'aethda', 'puluwanda',
        // Common Singlish
        'bn', 'nane', 'owa', 'eka', 'eke', 'ekata'
    ];

    // Count Sinhala pattern matches
    let sinhalaCount = 0;
    for (const pattern of sinhalaPatterns) {
        if (textLower.includes(pattern)) {
            sinhalaCount++;
        }
    }

    // If more than 2 Sinhala patterns, it's likely Singlish/Sinhala
    if (sinhalaCount >= 2) {
        return 'si';
    }

    // Check for pure English patterns
    const englishPatterns = ['hello', 'hi', 'please', 'thank you', 'would like', 'want to'];
    let englishCount = 0;
    for (const pattern of englishPatterns) {
        if (textLower.includes(pattern)) {
            englishCount++;
        }
    }

    if (englishCount > 0 && sinhalaCount === 0) {
        return 'en';
    }

    // Mixed or unclear - default to Singlish (common in Sri Lanka)
    return sinhalaCount > 0 ? 'si' : 'unknown';
}

/**
 * Process voice message from WhatsApp
 * Downloads, transcribes, and returns the text
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
