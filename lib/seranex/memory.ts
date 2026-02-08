import axios from 'axios';
import { Conversation } from '@/models/Seranex';

/**
 * Interface for User Profile stored in DB
 */
export interface UserProfile {
    name?: string;
    style: 'professional' | 'casual' | 'rude' | 'unknown';
    interests: string[];
    job?: string;
    notes?: string;
    language: 'en' | 'si' | 'singlish';
    bondLevel: number;
}

/**
 * Updates the user's memory/profile based on the latest interaction
 */
export async function updateUserMemory(phone: string, message: string, assistantReply?: string) {
    // Relative import for key rotator
    const { default: keyRotator } = await import('./gemini-keys');

    try {
        // 1. Get current profile
        const conversation = await Conversation.findOne({ phone });
        if (!conversation) return;

        const currentProfile: UserProfile = {
            style: 'unknown',
            interests: [],
            language: 'en',
            bondLevel: 0,
            ...((conversation as any).userProfile || {})
        };

        // 2. Analyze with Gemini
        if (message.length < 3) return;

        const prompt = `
        You are a User Profiler for a Sales Bot.
        Current Profile: ${JSON.stringify(currentProfile)}
        New User Message: "${message}"
        Bot Reply Context: "${assistantReply || ''}"

        Task: Update JSON fields ONLY. Return JSON object.
        Fields: name, job, interests, style, language, bondLevel (increase/decrease -10 to +10).
        `;

        const payload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
        };

        // Rotation models (names verified by API listing for this account)
        const models = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-pro-latest'];
        let success = false;
        let attempts = models.length * keyRotator.getKeyCount();

        while (attempts > 0 && !success) {
            const modelName = models[Math.floor(attempts / keyRotator.getKeyCount())] || models[0];
            const currentKey = keyRotator.getCurrentKey();
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentKey}`;

            try {
                const response = await axios.post(url, payload, {
                    timeout: 8000,
                    family: 4, // Force IPv4
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const text = response.data.candidates[0].content.parts[0].text;
                    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

                    let updates: Partial<UserProfile> = {};
                    try {
                        updates = JSON.parse(cleanText);
                    } catch (e) {
                        // Fallback attempt to find JSON in text
                        const match = cleanText.match(/\{[\s\S]*\}/);
                        if (match) updates = JSON.parse(match[0]);
                    }

                    if (updates) {
                        // Merge logic
                        const newProfile = { ...currentProfile };
                        if (updates.name) newProfile.name = updates.name;
                        if (updates.style) newProfile.style = updates.style;
                        // Clamping bond level
                        if (typeof updates.bondLevel === 'number') {
                            newProfile.bondLevel = Math.max(0, Math.min(100, (newProfile.bondLevel || 0) + updates.bondLevel));
                        }

                        await Conversation.findOneAndUpdate({ phone }, { $set: { userProfile: newProfile } });
                        console.log(`[Memory] 🧠 Updated bond for ${phone}: ${newProfile.bondLevel}`);
                        success = true;
                    }
                }
            } catch (err: any) {
                // If 429, rotate key. If 404, will try next model in next loop anyway.
                keyRotator.rotate();
                attempts--;
            }
        }

    } catch (error) {
        console.error('[Memory] ❌ Critical failure:', error instanceof Error ? error.message : error);
    }
}
