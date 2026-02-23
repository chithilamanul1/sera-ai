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
export const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Updated to 2.0

// --- Constants ---
export const MODEL_OPENAI = "gpt-4o"; // High intelligence, multilingual
export const MODEL_GEMINI = "gemini-2.0-flash";

// --- New Providers ---
export const MODEL_GROQ = "llama-3.3-70b-versatile";
export const MODEL_SAMBANOVA = "Meta-Llama-3.1-8B-Instruct";
export const MODEL_NVIDIA = "meta/llama-3.1-70b-instruct";

export const GROQ_API_KEY = process.env.GROQ_API_KEY || "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";
export const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY || "4e758b94-8eda-41a1-8c34-51856fa42ef0";
export const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "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";

