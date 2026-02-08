/**
 * White-Label Bot Setup Wizard
 * run with: node scripts/setup-whitelabel.js
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    console.log('\n🤖 WHITE-LABEL BOT SETUP WIZARD 🤖\n');
    console.log('This will configure the bot for a new client.\n');

    // 1. Company Info
    const companyName = await ask('1. Company Name (e.g., ABC Travels): ') || 'My Company';
    const tagline = await ask('2. Tagline (e.g., Best Service in Town): ') || 'Your trusted partner';
    const location = await ask('3. Location (e.g., Colombo): ') || 'Sri Lanka';
    const businessPhone = await ask('4. Business Phone (e.g., 9477...): ') || '94770000000';
    const ownerPhone = await ask('5. Owner Personal Phone (for escalation): ') || '94770000000';
    const workingHours = await ask('6. Working Hours (e.g., 9 AM - 5 PM): ') || '9:00 AM - 6:00 PM';

    // 2. Personality
    console.log('\n--- Bot Personality ---\n');
    const botName = await ask('7. Bot Name (e.g., Sera): ') || 'AI Assistant';
    const tone = await ask('8. Tone (friendly, professional, casual): ') || 'friendly and professional';

    // 3. API Keys
    console.log('\n--- API Configuration ---\n');
    const openaiKey = await ask('9. OpenAI API Key (sk-...): ');
    if (!openaiKey) console.warn('⚠️ OpenAI Key missing - Voice transcription won\'t work!');

    const discordWebhook = await ask('10. Discord Webhook URL (for logs): ');
    if (!discordWebhook) console.warn('⚠️ Discord Webhook missing - Logging won\'t work!');

    // 4. Generate Config
    const configPath = path.join(__dirname, '../lib/whitelabel/config.ts');

    const configContent = `import { WhiteLabelConfig } from './types';

const config: WhiteLabelConfig = {
    company: {
        name: '${companyName.replace(/'/g, "\\'")}',
        tagline: '${tagline.replace(/'/g, "\\'")}',
        location: '${location.replace(/'/g, "\\'")}',
        hours: {
            display: '${workingHours.replace(/'/g, "\\'")}',
            open: 9,
            close: 18
        },
        contact: {
            business: '${businessPhone}',
            owner: '${ownerPhone}'
        }
    },
    personality: {
        name: '${botName.replace(/'/g, "\\'")}',
        tone: '${tone.replace(/'/g, "\\'")}',
        casualWords: ['aiye', 'akke', 'bro', 'macho']
    },
    services: [
        { name: 'General Inquiry', price: 0 }
    ]
};

// Helper to get pricing text
export const getPricingText = () => {
    return \`Unknown pricing - please contact admin.\`;
};

// Helper to get bank details
export const getBankText = () => {
    return \`Bank details not configured.\`;
};

export default config;
`;

    // Ensure directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(configPath, configContent);
    console.log(`\n✅ Generated config: ${configPath}`);

    // 5. Generate .env
    const envPath = path.join(__dirname, '../.env.local');
    const now = new Date().toLocaleDateString();
    const envContent = `
# --- WHITE-LABEL CONFIG (${now}) ---
OPENAI_API_KEY=${openaiKey || ''}
DISCORD_WEBHOOK_URL=${discordWebhook || ''}
OWNER_PERSONAL_PHONE=${ownerPhone}
MONGODB_URI=mongodb://localhost:27017/${companyName.toLowerCase().replace(/\s+/g, '_')}_bot
`;

    fs.appendFileSync(envPath, envContent);
    console.log(`✅ Updated .env: ${envPath} (Appended)`);

    console.log('\n🎉 SETUP COMPLETE! 🎉');
    console.log('Run the following to start:');
    console.log('  npm run dev');
    console.log('  cd whatsapp-bot && npm start');

    rl.close();
}

main();
