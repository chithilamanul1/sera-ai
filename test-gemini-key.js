const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testKey() {
    const key = 'AIzaSyBh-Jm_uOLyZXvnvigojSGW6eG2D-mG-08';
    const genAI = new GoogleGenerativeAI(key);

    // Test multiple possible model IDs
    const modelsToTest = ["gemini-1.5-flash", "gemini-pro"];

    for (const modelId of modelsToTest) {
        console.log(`Testing model: ${modelId}...`);
        try {
            const model = genAI.getGenerativeModel({ model: modelId });
            const result = await model.generateContent("Hi");
            const response = await result.response;
            console.log(`✅ Success with ${modelId}!`);
            console.log("Response snippet:", response.text().substring(0, 50));
            return; // Exit on first success
        } catch (error) {
            console.log(`❌ Failed with ${modelId}:`, error.message.substring(0, 100));
        }
    }
    console.log("💀 KEY IS TOTALLY DEAD OR RESTRICTED.");
}

testKey();
