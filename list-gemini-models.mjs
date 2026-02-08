import fetch from 'node-fetch';

const key = 'AIzaSyBh-Jm_uOLyZXvnvigojSGW6eG2D-mG-08';

async function listModels() {
    console.log(`Listing models for key ...${key.substring(key.length - 4)}`);
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error(`❌ API Error: ${JSON.stringify(data.error)}`);
        } else {
            console.log('✅ Models available:');
            data.models?.forEach(m => console.log(` - ${m.name}`));
        }
    } catch (err) {
        console.error(`❌ Fetch Fail: ${err.message}`);
    }
}

listModels();
