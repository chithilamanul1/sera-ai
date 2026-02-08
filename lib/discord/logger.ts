// Discord integration temporarily disabled due to Next.js/Turbopack compatibility issues.
// import client, { initDiscord } from './bot';
// import { TextChannel, EmbedBuilder, ColorResolvable } from 'discord.js';

export async function logToDiscord(title: string, message: string, level: string = 'INFO', fields: any[] = []) {
    // Mock implementation to prevent crash
    console.log(`[Discord Log Stub] [${level}] ${title}: ${message}`);
    return;
}
