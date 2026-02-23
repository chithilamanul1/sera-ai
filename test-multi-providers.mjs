import axios from 'axios';

const keys = {
    GROQ: "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",
    SAMBANOVA: "4e758b94-8eda-41a1-8c34-51856fa42ef0",
    NVIDIA: "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"
};

const configs = [
    { name: 'GROQ', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', key: keys.GROQ },
    { name: 'SAMBANOVA', url: 'https://api.sambanova.ai/v1/chat/completions', model: 'Meta-Llama-3.1-8B-Instruct', key: keys.SAMBANOVA },
    { name: 'NVIDIA', url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'meta/llama-3.1-70b-instruct', key: keys.NVIDIA }
];

async function testProvider(p) {
    console.log(`\n--- Testing ${p.name} ---`);
    try {
        const start = Date.now();
        const res = await axios.post(p.url, {
            model: p.model,
            messages: [{ role: 'user', content: "Respond with 'Provider Active'" }],
            max_tokens: 10
        }, {
            headers: { 'Authorization': `Bearer ${p.key}`, 'Content-Type': 'application/json' },
            timeout: 10000
        });
        const latency = Date.now() - start;
        console.log(`✅ SUCCESS [${latency}ms]: ${res.data.choices[0].message.content}`);
    } catch (err) {
        console.error(`❌ FAIL: ${err.message}`);
        if (err.response) console.error(`Data:`, JSON.stringify(err.response.data));
    }
}

async function runAll() {
    for (const p of configs) {
        await testProvider(p);
    }
}

runAll();
