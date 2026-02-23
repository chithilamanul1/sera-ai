import { GoogleGenerativeAI } from '@google/generative-ai';

// Hardcoded test of the key
const key = 'AIzaSyBh-Jm_uOLyZXvnvigojSGW6eG2D-mG-08';

async function testGemini2() {
    console.log(`Testing Gemini 2.0 Flash with key ending in ...${key.substring(key.length - 4)}`);
    try {
        const genAI = new GoogleGenerativeAI(key);
        // Test 2.0 Flash
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent("Respond with '2.0 Active'");
        console.log(`✅ Success: ${result.response.text()}`);
    } catch (err) {
        console.error(`❌ Fail: ${err.message}`);
    }
}

testGemini2();
