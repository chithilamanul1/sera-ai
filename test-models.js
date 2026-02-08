const axios = require('axios');
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const key = process.env.GEMINI_API_KEY || 'AIzaSyDWZAtKeuFb6InlwwgAJmRjq-Y_JZEnbR4'; // hardcode to check user key directly

async function listModels() {
    try {
        console.log('Fetching models with key ending in', key.slice(-4));
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
            { family: 4 }
        );

        console.log('Available Models:');
        const models = response.data.models || [];
        models.forEach(m => {
            if (m.name.includes('gemini')) {
                console.log(`- ${m.name} (Supported: ${m.supportedGenerationMethods?.join(', ')})`);
            }
        });

    } catch (error) {
        console.error('Error listing models:', error.response?.data || error.message);
    }
}

listModels();
