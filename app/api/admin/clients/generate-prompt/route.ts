import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * POST /api/admin/clients/generate-prompt
 * Takes business details and generates a specialized system prompt
 */
export async function POST(req: NextRequest) {
    try {
        const { name, businessType, industry, details, targetAudience, tone } = await req.json();

        if (!name || !details) {
            return NextResponse.json({ error: 'Name and details are required' }, { status: 400 });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        const prompt = `
            You are an expert AI Prompt Engineer specializing in WhatsApp Business Automation.
            Task: Create a "MASSIVE", highly detailed System Prompt for a WhatsApp AI Bot.
            
            BUSINESS PROFILE:
            - Name: ${name}
            - Type: ${businessType}
            - Industry: ${industry}
            - Details: ${details}
            - Target Audience: ${targetAudience || 'General public in Sri Lanka'}
            - Desired Tone: ${tone || 'Professional yet friendly'}
            
            REQUIREMENTS FOR THE GENERATED PROMPT:
            1. IDENTITY: Define the bot as a helpful assistant for ${name}.
            2. TONE CONTROL: Explicitly handle English, Sinhala, and Singlish mirroring the user's script.
            3. SALES LOGIC: Instructions on how to guide users toward purchasing/ordering.
            4. CONSTRAINTS: Prevent yapping, keep messages concise for WhatsApp.
            5. SRI LANKAN CONTEXT: Use natural Sri Lankan phrasing (avoid robotic translations).
            6. CAPABILITIES: Mention it can handle voice notes, images (receipts), and generate invoices (if applicable).
            
            Output ONLY the generated system prompt text, formatted for use in a code environment. 
            Do not include any conversational filler in your response.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedPrompt = response.text();

        return NextResponse.json({ prompt: generatedPrompt });

    } catch (error: Error | unknown) {
        console.error('Prompt Generation Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
