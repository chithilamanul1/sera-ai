import { MODEL_GEMINI, openai, MODEL_OPENAI } from './config';
import { SYSTEM_PROMPT } from './prompts';
import {
    routeTask,
    logFinance,
    generateDraftQuote,
    finalizeQuote,
    signQuote,
    markAsPaid,
    requestPayment,
    triggerReminder,
    generateSocialCaption,
    forwardToDesign,
    forwardToMarketing,
    handleFeedbackLoop,
    approveMarketing,
    sendLocation
} from './functions';
import ChatLog, { ChatRole } from '@/models/ChatLog';
import axios from 'axios';
import keyRotator from '../seranex/gemini-keys';

export interface AIResponse {
    text: string;
    usedModel: string;
    actions?: Record<string, unknown>[]; // For routing, finance, etc.
}

/**
 * Detect the script and style of the user's message
 */
function detectLanguageStyle(text: string): "SINHALA_SCRIPT" | "SINGLISH" | "ENGLISH" {
    // 1. Check for Sinhala Unicode Characters (Sinhala Script)
    // Range: \u0D80-\u0DFF
    const sinhalaScriptPattern = /[\u0D80-\u0DFF]/;
    if (sinhalaScriptPattern.test(text)) {
        return "SINHALA_SCRIPT"; // e.g. "කොහොමද"
    }

    // 2. Check for Singlish Keywords (Latin Script but Sinhala words)
    const singlishKeywords = [
        "kohomada", "kianna", "keeyada", "wade", "puluwan",
        "gnan", "ganan", "aulak", "damma", "malli", "aiya",
        "ela", "hari", "nadda", "kawada", "kawuda"
    ];
    const lowerText = text.toLowerCase();
    if (singlishKeywords.some(word => lowerText.includes(word))) {
        return "SINGLISH"; // e.g. "kohomada ganan"
    }

    // 3. Default to English
    return "ENGLISH"; // e.g. "How much is it?"
}

export async function generateAIResponse(
    userMessage: string,
    history: { role: 'user' | 'assistant' | 'system' | 'model'; content: string }[],
    contextData: { phone?: string, customerName?: string; customerId?: string | undefined } = {},
    systemPromptOverride?: string // Added for dynamic prompts
): Promise<AIResponse> {

    // Log User Message
    if (contextData.customerId) {
        await ChatLog.create({
            customer: contextData.customerId,
            role: ChatRole.USER,
            content: userMessage
        }).catch(e => console.error("Log error", e));
    }

    let finalResponseText = "";
    let finalModel = MODEL_GEMINI;
    const actions: Record<string, unknown>[] = [];

    // --- LANGUAGE DETECTION ---
    const langStyle = detectLanguageStyle(userMessage);
    console.log(`[AI] Detected Style: ${langStyle}`);

    // Choose Prompt & Inject Style Hint
    const styleHint = `\n\n**IMPORTANT STYLE HINT:** The detected language mode for this response is **${langStyle}**. STRICTLY follow the mirroring rules for this mode defined in the system prompt.`;
    const promptToUse = (systemPromptOverride || SYSTEM_PROMPT) + styleHint;

    try {
        console.log(`[AI] Using ${MODEL_GEMINI}...`);



        // --- GEMINI CALL (With Key Rotation & Robust Logic) ---
        const geminiRes = await callGeminiRobust(userMessage, history, promptToUse);
        const rawText = geminiRes.text;
        finalModel = geminiRes.model;

        // --- JSON PARSING (GOD MODE) ---
        // Look for JSON block at the end
        const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/) || rawText.match(/{[\s\S]*}/);

        if (jsonMatch) {
            try {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const data = JSON.parse(jsonStr);

                console.log("[AI] JSON Action Detected:", data.action);

                // Remove JSON from text for the user response (unless it's just the JSON)
                finalResponseText = rawText.replace(jsonMatch[0], "").trim();

                // Handler Logic
                switch (data.action) {
                    case 'REPLY_USER':
                        // If reply text is in JSON, use it. Otherwise use the text before JSON.
                        if (data.text) finalResponseText = data.text;
                        break;

                    case 'ROUTE_TASK':
                        const routeRes = await routeTask(data.target, data.phone, data.message_content, data.original_client_message);
                        actions.push({ type: 'NOTIFY_STAFF', ...data, status: routeRes });
                        finalResponseText = data.reply_to_user || finalResponseText || "Mama team ekata kiwwa. Poddak inna.";
                        break;

                    case 'LOG_FINANCE':
                        await logFinance(data.type, data.amount, data.project, data.source_user);
                        finalResponseText = data.reply_to_owner || "Finance logged.";
                        break;

                    case 'GENERATE_QUOTE':
                        // Assume data contains items list
                        const quoteRes = await generateDraftQuote(
                            contextData.customerName || "Client",
                            contextData.phone || "0000000000",
                            `PRJ-${Date.now()}`,
                            data.items || []
                        );
                        if (quoteRes.actions) actions.push(...quoteRes.actions);
                        finalResponseText = data.reply_to_user || "Draft quote generated.";
                        break;

                    case 'SET_PRICE':
                        // Riyon setting price
                        await finalizeQuote(data.project_id, data.price);
                        finalResponseText = data.reply_to_user || "Price updated and quote finalized.";
                        break;

                    case 'GENERATE_PORTFOLIO_CONTENT':
                        const captionRes = await generateSocialCaption(data.project_title || "Project");
                        const designRes = await forwardToDesign(data.project_title || "Project", captionRes.designBrief);
                        actions.push({ type: 'PORTFOLIO_START', ...captionRes, ...designRes });
                        finalResponseText = data.reply_to_user || "Portfolio workflow started. Sent to Studio Vibes.";
                        break;

                    case 'FORWARD_DESIGN':
                        const fwdDesignRes = await forwardToDesign(data.project_title, data.brief);
                        actions.push({ type: 'DESIGN_FORWARDED', ...fwdDesignRes });
                        finalResponseText = "Design brief forwarded.";
                        break;

                    case 'FORWARD_TO_MARKETING':
                        const fwdMktRes = await forwardToMarketing(data.project_title, data.caption);
                        actions.push({ type: 'MARKETING_FORWARDED', ...fwdMktRes });
                        finalResponseText = "Forwarded to Sky Designers for marketing check.";
                        break;

                    case 'FEEDBACK_LOOP':
                        const feedRes = await handleFeedbackLoop(data.feedback, data.project_title);
                        actions.push({ type: 'FEEDBACK_SENT', ...feedRes });
                        finalResponseText = "Feedback sent back to Studio Vibes.";
                        break;

                    case 'APPROVE_MARKETING':
                        const appMktRes = await approveMarketing(data.project_title, data.budget);
                        actions.push({ type: 'MARKETING_APPROVED', ...appMktRes });
                        finalResponseText = "Marketing approved and budget logged.";
                        break;

                    case 'SIGN_QUOTE':
                        const signRes = await signQuote(data.project_id);
                        if (signRes.actions) actions.push(...signRes.actions);
                        finalResponseText = data.reply_to_user || "Quote signed and sent to client.";
                        break;

                    case 'MARK_AS_PAID':
                        const paidRes = await markAsPaid(data.staff_name, data.amount);
                        finalResponseText = data.reply_to_owner || paidRes.message;
                        break;

                    case 'REQUEST_PAYMENT':
                        const payRes = await requestPayment({
                            amount: data.amount,
                            type: data.type,
                            project_id: data.project_id,
                            description: data.description
                        });
                        if (payRes.actions) actions.push(...payRes.actions);
                        finalResponseText = data.reply_to_user || "Payment link generated.";
                        break;

                    case 'TRIGGER_REMINDER':
                        const remindRes = await triggerReminder({
                            target: data.target,
                            phone: data.phone,
                            project_id: data.project_id,
                            reason: data.reason
                        });
                        finalResponseText = data.reply_to_user || remindRes.message;
                        break;

                    case 'SEND_LOCATION':
                        const locRes = await sendLocation({
                            latitude: data.latitude,
                            longitude: data.longitude,
                            description: data.description
                        });
                        if (locRes.actions) actions.push(...locRes.actions);
                        finalResponseText = data.reply_to_user || "Location sent.";
                        break;
                }

            } catch (jsonError) {
                console.warn("[AI] Failed to parse JSON", jsonError);
                finalResponseText = rawText; // Fallback to raw text
            }
        } else {
            // No JSON, just text
            finalResponseText = rawText;
        }

    } catch (error: unknown) {
        console.error(`[AI] Gemini exhausted or failed, attempting OpenAI fallback...`, error);

        try {
            console.log(`[AI] Falling back to OpenAI (${MODEL_OPENAI})...`);

            // Map roles correctly for OpenAI
            const openAIHistory = history.map(m => {
                let role: 'user' | 'assistant' | 'system' = 'user';
                if (m.role === 'assistant' || m.role === 'model') role = 'assistant';
                else if (m.role === 'system') role = 'system';
                return { role, content: m.content };
            });

            const openaiResponse = await openai.chat.completions.create({
                model: MODEL_OPENAI,
                messages: [
                    { role: 'system', content: promptToUse },
                    ...openAIHistory,
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 1000
            });

            const rawText = openaiResponse.choices[0].message.content || "";
            finalModel = MODEL_OPENAI;

            // Simple logic for OpenAI - if it returns JSON, process it
            const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/) || rawText.match(/{[\s\S]*}/);
            if (jsonMatch) {
                try {
                    const jsonStr = jsonMatch[1] || jsonMatch[0];
                    const data = JSON.parse(jsonStr);
                    finalResponseText = rawText.replace(jsonMatch[0], "").trim();
                    // Basic action support for fallback
                    if (data.action === 'REPLY_USER' && data.text) finalResponseText = data.text;
                } catch (jsonErr) {
                    console.warn("[AI] Fallback JSON parse failed", jsonErr);
                    finalResponseText = rawText;
                }
            } else {
                finalResponseText = rawText;
            }

            console.log(`[AI] OpenAI fallback SUCCESS!`);

        } catch (openaiError: unknown) {
            const err = openaiError as Error;
            console.error(`[AI] OpenAI also failed:`, err.message);
            finalResponseText = "Sorry, technical error.";
            finalModel = 'error';
        }
    }

    // Log Assistant Message
    if (contextData.customerId && finalResponseText) {
        await ChatLog.create({
            customer: contextData.customerId,
            role: ChatRole.ASSISTANT,
            content: finalResponseText,
            metadata: { model: finalModel }
        }).catch(e => console.error("Log error", e));
    }

    return { text: finalResponseText, usedModel: finalModel, actions };
}

// Robust Gemini Call with Key Rotation (Ported from route.ts)
async function callGeminiRobust(
    userMsg: string,
    hist: { role: string; content: string }[],
    sysPrompt: string
): Promise<{ text: string; model: string }> {

    // Construct payload for REST API
    const payload = {
        system_instruction: {
            parts: [{ text: sysPrompt || SYSTEM_PROMPT }]
        },
        contents: [] as { role: string; parts: { text: string }[] }[],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800
        }
    };

    // Filter and alternate history (Gemini is VERY strict: user, model, user, model...)
    let lastRole = '';
    for (const msg of hist) {
        const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';

        // Gemini MUST start with 'user'
        if (payload.contents.length === 0 && role === 'model') continue;

        if (role !== lastRole) {
            payload.contents.push({
                role: role,
                parts: [{ text: msg.content || '...' }]
            });
            lastRole = role;
        }
    }


    // Add current message (MUST be user)
    if (lastRole === 'user') {
        if (payload.contents.length > 0) {
            payload.contents[payload.contents.length - 1].parts[0].text += `\n\n${userMsg}`;
        } else {
            payload.contents.push({ role: 'user', parts: [{ text: userMsg }] });
        }
    } else {
        payload.contents.push({ role: 'user', parts: [{ text: userMsg }] });
    }

    // Models to rotate through
    const models = [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-pro',
        'gemini-1.5-flash'
    ];
    let currentModelIndex = 0;
    let totalAttempts = models.length * keyRotator.getKeyCount(); // Multiply by key count

    while (totalAttempts > 0) {
        // Safe access to models array
        const modelName = models[currentModelIndex % models.length];
        const currentKey = keyRotator.getCurrentKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentKey}`;


        try {
            console.log(`[GeminiEngine] 🚀 Attempting ${modelName} with Key #${keyRotator.getCurrentIndex()}...`);

            const response = await axios.post(url, payload, {
                timeout: 15000,
                family: 4, // FORCE IPv4
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data && response.data.candidates && response.data.candidates.length > 0) {
                const text = response.data.candidates[0].content.parts[0].text;
                return { text, model: modelName };
            } else {
                throw new Error('Empty response from Gemini');
            }

        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(`[GeminiEngine] ⚠️ Fail (${modelName}): ${errorMsg.substring(0, 100)}...`);

            totalAttempts--;

            if (totalAttempts > 0) {
                // If we've tried all keys for this model, switch model
                if (totalAttempts % keyRotator.getKeyCount() === 0) {
                    currentModelIndex++;
                } else {
                    keyRotator.rotate();
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    throw new Error('All Gemini keys and models exhausted in Engine.');
}
