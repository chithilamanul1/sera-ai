import { GoogleGenerativeAI } from '@google/generative-ai';

// Hardcoded test of the new key provided by user
const key = 'AIzaSyBh-Jm_uOLyZXvnvigojSGW6eG2D-mG-08';

async function testGemini() {
    console.log(`Testing key ending in ...${key.substring(key.length - 4)} with v1...`);
    try {
        // The SDK uses v1beta by default in some versions, but let's try to force a stable model check
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // Note: The @google/generative-ai SDK usually abstracts the version, but 404 on v1beta 
        // with 'gemini-1.5-flash' might mean the key is restricted to a specific region or project
        // that doesn't have the model enabled.

        const result = await model.generateContent("hello");
        console.log(`✅ Success (v1): ${result.response.text()}`);
    } catch (err) {
        console.error(`❌ Fail (v1): ${err.message}`);
    }
}

testGemini();
