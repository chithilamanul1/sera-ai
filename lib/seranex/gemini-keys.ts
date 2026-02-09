/**
 * Gemini API Key Rotator
 * Handles multiple API keys to bypass rate limits (429 errors)
 */

import SystemSettings from '../../models/SystemSettings';
import dbConnect from '../db';

class GeminiKeyRotator {
    private keys: string[] = [];
    private currentIndex: number = 0;
    private masterKey: string = '';
    private lastRefreshed: number = 0;

    constructor() {
        this.initializeKeys();
    }

    private async initializeKeys() {
        // Load from ENV first (Sync)
        this.loadFromEnv();

        // Attempt to load from DB (Async) - Don't block constructor but load as soon as possible
        this.refreshFromDb().catch(e => console.error("[KeyRotator] DB Refresh failed:", e.message));
    }

    private loadFromEnv() {
        const foundKeys: string[] = [];
        if (process.env.GEMINI_API_KEY) {
            this.masterKey = process.env.GEMINI_API_KEY;
            foundKeys.push(this.masterKey);
        }
        for (let i = 1; i <= 10; i++) {
            const key = process.env[`GEMINI_API_KEY_${i}`];
            if (key && !foundKeys.includes(key)) {
                foundKeys.push(key);
            }
        }
        this.keys = foundKeys;
    }

    /**
     * Refresh keys from MongoDB overrides
     */
    public async refreshFromDb() {
        try {
            await dbConnect();
            const settings = await SystemSettings.findOne({ key: 'global' });
            if (settings?.geminiKeys) {
                const dbKeys = settings.geminiKeys;

                // Update Master Key if index_0 or master exists
                if (dbKeys['master']) {
                    this.masterKey = dbKeys['master'];
                } else if (dbKeys['index_0']) {
                    this.masterKey = dbKeys['index_0'];
                }

                // Update whole keys array
                const newKeys: string[] = [];
                // Collect keys in order index_0, index_1...
                for (let i = 0; i <= 10; i++) {
                    const key = dbKeys[`index_${i}`];
                    if (key) newKeys.push(key);
                }

                if (newKeys.length > 0) {
                    this.keys = newKeys;
                }

                this.lastRefreshed = Date.now();
                console.log(`[KeyRotator] 🔄 Keys updated from DB. Total: ${this.keys.length}`);
            }
        } catch (err) {
            console.error("[KeyRotator] Error refreshing from DB:", err);
        }
    }

    public getMasterKey(): string {
        // Auto-refresh every 5 minutes if requested
        if (Date.now() - this.lastRefreshed > 5 * 60 * 1000) {
            this.refreshFromDb().catch(() => { });
        }
        return this.masterKey || this.keys[0] || '';
    }

    public getBackupKey(index: number): string {
        if (this.keys.length === 0) return this.masterKey;
        const safeIndex = index % this.keys.length;
        return this.keys[safeIndex];
    }

    public getKeyCount(): number {
        return this.keys.length;
    }

    public getCurrentKey(): string { return this.getMasterKey(); }
    public rotate(): string { return this.getMasterKey(); }
    public getCurrentIndex(): number { return 1; }
}

// Export as a singleton
const keyRotator = new GeminiKeyRotator();
export default keyRotator;
