const { GoogleGenerativeAI } = require('@google/generative-ai');
const dns = require('node:dns');

// FORCE IPv4
dns.setDefaultResultOrder('ipv4first');

const apiKey = process.env.GEMINI_API_KEY_1 || 'YOUR_GEMINI_KEY_HERE';
// I'll rely on the user having the env loaded or I'll try to read it from the file if needed.
// Actually, I should probably read the session .env or just ask the code to print the error.
// For now let's try to mock the key or assume I can't read it directly easily without viewing .env first.
// Wait, I can't see the .env content in tool outputs usually.
// I'll imply the key usage from the existing keyRotator logic if I were running in context, 
// but here I'm running a script.
// I will try to load dotenv.

require('dotenv').config({ path: './whatsapp-bot/.env' });

async function testGemini() {
    console.log('Testing Gemini Connectivity...');
    const key = process.env.GEMINI_API_KEY_1;
    if (!key) {
        console.error('No GEMINI_API_KEY_1 found in environment.');
        return;
    }
    console.log(`Using Key ending in: ${key.slice(-4)}`);

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    try {
        const result = await model.generateContent("Hello, are you working?");
        const response = await result.response;
        console.log('Success! Response:', response.text());
    } catch (error) {
        console.error('Gemini Failed!');
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        if (error.cause) {
            console.error('Error Cause:', error.cause);
        }
        console.error('Full Error:', error);
    }
}

testGemini();
