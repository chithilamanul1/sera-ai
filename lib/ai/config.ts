import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- OpenAI Setup ---
const apiKeyOpenAI = process.env.OPENAI_API_KEY;
if (!apiKeyOpenAI) {
    console.warn("Missing OPENAI_API_KEY. AI features may fail.");
}

export const openai = new OpenAI({
    apiKey: apiKeyOpenAI || 'dummy-key', // Prevent crash on build, but will fail runtime if missing
});

// --- Gemini Setup ---
const apiKeyGemini = process.env.GEMINI_API_KEY;
if (!apiKeyGemini) {
    console.warn("Missing GEMINI_API_KEY. Fallback AI may fail.");
}

const genAI = new GoogleGenerativeAI(apiKeyGemini || 'dummy-key');
export const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Updated to 2.5

// --- Constants ---
export const MODEL_OPENAI = "gpt-4o"; // High intelligence, multilingual
export const MODEL_GEMINI = "gemini-2.5-flash";
