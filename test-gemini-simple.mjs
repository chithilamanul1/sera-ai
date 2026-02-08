import { GoogleGenerativeAI } from '@google/generative-ai';

// Hardcoded test of the new key provided by user
const key = 'AIzaSyBh-Jm_uOLyZXvnvigojSGW6eG2D-mG-08';

async function testGemini() {
    console.log(`Testing key ending in ...${key.substring(key.length - 4)}`);
    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent("Say 'hello'");
        console.log(`✅ Success: ${result.response.text()}`);
    } catch (err) {
        console.error(`❌ Fail: ${err.message}`);
    }
}

testGemini();
