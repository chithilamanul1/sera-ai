/**
 * Gemini API Key Rotator
 * Handles multiple API keys to bypass rate limits (429 errors)
 */

class GeminiKeyRotator {
    private keys: string[] = [];
    private currentIndex: number = 0;

    constructor() {
        this.initializeKeys();
    }

    /**
     * Load keys from environment variables
     * Looks for GEMINI_API_KEY, GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
     */
    private initializeKeys() {
        const foundKeys: string[] = [];

        // Check primary key first
        if (process.env.GEMINI_API_KEY) {
            foundKeys.push(process.env.GEMINI_API_KEY);
        }

        // Check for indexed keys (up to 10)
        for (let i = 1; i <= 10; i++) {
            const key = process.env[`GEMINI_API_KEY_${i}`];
            if (key && !foundKeys.includes(key)) {
                foundKeys.push(key);
            }
        }

        this.keys = foundKeys;
        console.log(`[KeyRotator] 🔑 Initialized with ${this.keys.length} Gemini API keys.`);
    }

    /**
     * Get the current active key
     */
    public getCurrentKey(): string {
        if (this.keys.length === 0) {
            return process.env.GEMINI_API_KEY || '';
        }
        return this.keys[this.currentIndex];
    }

    /**
     * Switch to the next key in the rotation
     */
    public rotate(): string {
        if (this.keys.length <= 1) return this.getCurrentKey();

        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        const newKey = this.keys[this.currentIndex];

        console.log(`[KeyRotator] 🔄 Rate limit hit! Rotating to API Key #${this.currentIndex + 1} (ending in ...${newKey.substring(newKey.length - 4)})`);

        return newKey;
    }

    /**
     * Get total number of keys available
     */
    public getKeyCount(): number {
        return this.keys.length;
    }

    /**
     * Get current key index (1-based)
     */
    public getCurrentIndex(): number {
        return this.currentIndex + 1;
    }
}

// Export as a singleton
const keyRotator = new GeminiKeyRotator();
export default keyRotator;
