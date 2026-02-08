import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import axios from 'axios';

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './session' }),
    puppeteer: {
        headless: true,
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        args: ['--no-sandbox']
    }
});

client.on('ready', async () => {
    console.log('Bot is ready for test');
    const ownerPhone = '94772148511@c.us';
    try {
        await client.sendMessage(ownerPhone, 'Test message from Antigravity: I have restarted the bot. Are you seeing this?');
        console.log('Test message sent');
    } catch (err) {
        console.error('Failed to send test message:', err);
    }
    process.exit(0);
});

client.initialize();
