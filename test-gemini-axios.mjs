import axios from 'axios';

const key = 'AIzaSyBh-Jm_uOLyZXvnvigojSGW6eG2D-mG-08';
const modelName = 'gemini-1.5-flash';
const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${key}`;

async function testAxios() {
    console.log(`Testing Gemini via AXIOS (mimicking engine.ts)...`);
    console.log(`URL: ${url.replace(key, 'HIDDEN_KEY')}`);

    const payload = {
        contents: [{
            role: 'user',
            parts: [{ text: "Say 'Hello from Axios'" }]
        }]
    };

    try {
        const response = await axios.post(url, payload, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        console.log(`✅ AXIOS SUCCESS! Status: ${response.status}`);
        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`Response: ${text}`);

    } catch (err) {
        console.error(`❌ AXIOS FAIL: ${err.message}`);
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error(`Data:`, JSON.stringify(err.response.data, null, 2));
        } else if (err.request) {
            console.error(`No response received. Request failed.`);
        }
    }
}

testAxios();
