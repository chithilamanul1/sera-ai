import { Client, GatewayIntentBits, TextChannel } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Global cache to prevent multiple instances in dev hot-reload
declare global {
    var discordClient: Client | undefined;
}

let client: Client;

if (process.env.NODE_ENV === 'production') {
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent, // Privileged intent, needed for reading commands
        ],
    });
} else {
    if (!global.discordClient) {
        global.discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
    }
    client = global.discordClient;
}

// Initialize connection logic
export const initDiscord = async () => {
    if (client.isReady()) return client;

    if (!DISCORD_TOKEN) {
        console.warn("Skipping Discord Login: No Token Provided");
        return null;
    }

    try {
        await client.login(DISCORD_TOKEN);
        console.log(`[Discord] Logged in as ${client.user?.tag}`);
    } catch (err) {
        console.error(`[Discord] Login Failed:`, err);
    }
    return client;
};

export default client;
