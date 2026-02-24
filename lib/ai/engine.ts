import {
    MODEL_GEMINI,
    openai,
    MODEL_OPENAI,
    MODEL_GROQ,
    MODEL_SAMBANOVA,
    MODEL_NVIDIA,
    GROQ_API_KEY,
    SAMBANOVA_API_KEY,
    NVIDIA_API_KEY
} from './config';
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
import { notifyGeminiRateLimit, sendErrorToDiscord } from '../seranex/notifications';
import ChatLog, { ChatRole } from '@/models/ChatLog';
import axios from 'axios';
import keyRotator from '../seranex/gemini-keys';
export { keyRotator };

// Circuit Breaker: Track models that return 404s/400s to avoid retrying them
const failedModels = new Set<string>();

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
    console.log(`[AI-DIAGNOSTIC] generateAIResponse entry (v10)`);

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



        // --- TASK-BASED ROUTING & MULTI-PROVIDER FALLBACK ---
        const aiRes = await callSuitableProvider(userMessage, history, promptToUse);
        const rawText = aiRes.text;
        finalModel = aiRes.model;

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
                } catch (jsonErr: unknown) {
                    console.warn("[AI] Fallback JSON parse failed", (jsonErr as Error).message);
                    finalResponseText = rawText;
                }
            } else {
                finalResponseText = rawText;
            }

            console.log(`[AI] OpenAI fallback SUCCESS!`);

        } catch (openaiError: unknown) {
            const err = openaiError as Error;
            console.error(`[AI] OpenAI also failed:`, err.message);

            // Detailed error for admin
            const failureReason = `All AI backends failed.\nGemini error: ${error}\nOpenAI error: ${err.message}`;
            await sendErrorToDiscord(failureReason, 'CRITICAL: TOTAL AI EXHAUSTION (v10)');

            finalResponseText = "🛑 I'm having some technical trouble connecting to my AI brain (v10). Please send your request again in a moment or contact my human manager! 🙏";
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
        systemInstruction: {
            parts: [{ text: sysPrompt || SYSTEM_PROMPT }]
        },
        contents: [] as { role: string; parts: { text: string }[] }[],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800
        }
    };

    // Filter and alternate history
    let lastRole = '';
    for (const msg of hist) {
        const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';
        if (payload.contents.length === 0 && role === 'model') continue;

        if (role !== lastRole) {
            payload.contents.push({
                role: role,
                parts: [{ text: msg.content || '...' }]
            });
            lastRole = role;
        }
    }

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
    // Models to rotate through (Stable versions only)
    const models = [
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-1.0-pro'
    ];

    // --- TIER 1: FAST LANE (Master Key / Paid) ---
    const masterKey = keyRotator.getMasterKey();
    if (masterKey) {
        for (const modelName of models.slice(0, 2)) { // Try Flash and Flash-Lite first
            // Fast Lane also respects the circuit breaker
            if (failedModels.has(modelName)) continue;

            try {
                const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${masterKey}`;
                console.log(`[GeminiEngine] ⚡ FAST LANE: Attempting ${modelName}...`);

                const response = await axios.post(url, payload, {
                    timeout: 10000,
                    family: 4,
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return { text: response.data.candidates[0].content.parts[0].text, model: modelName };
                }
            } catch (err: unknown) {
                const axiosError = err as Record<string, unknown>;
                const response = axiosError?.response as Record<string, unknown>;
                const status = response?.status || 'UNKNOWN';

                console.log(` [Seranex] 🎙️ Fast Lane Fail (${modelName}) Status: ${status}`);

                if (status === 404 || status === 400) {
                    console.error(`[GeminiEngine] ❌ Fast Lane Model ${modelName} broken. URL: https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?...`);
                    failedModels.add(modelName);
                }

                if (status === 429) {
                    await notifyGeminiRateLimit(modelName, masterKey.substring(masterKey.length - 4), 0);
                }
            }
        }
    }

    // --- TIER 2: ROBUST ROTATION (Backups/Free) ---
    let currentModelIndex = 0;
    let totalAttempts = models.length * keyRotator.getKeyCount();

    while (totalAttempts > 0) {
        const modelName = models[currentModelIndex % models.length];

        // CIRCUIT BREAKER: Skip known broken models
        if (failedModels.has(modelName)) {
            console.warn(`[GeminiEngine] ⚠️ Skipping broken model: ${modelName}`);
            currentModelIndex++;
            totalAttempts--; // Decrement to prevent infinite loop
            continue;
        }

        const keyIndex = totalAttempts % keyRotator.getKeyCount();
        const currentKey = keyRotator.getBackupKey(keyIndex);
        const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${currentKey}`;

        try {
            console.log(`[GeminiEngine] 🛡️ ROTATION: Attempting ${modelName} with Key #${keyIndex + 1}...`);

            const response = await axios.post(url, payload, {
                timeout: 12000,
                family: 4,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return { text: response.data.candidates[0].content.parts[0].text, model: modelName };
            }
        } catch (err: unknown) {
            const axiosError = err as Record<string, unknown>;
            const response = axiosError?.response as Record<string, unknown>;
            const errorData = response?.data as Record<string, unknown>;
            const errorInner = errorData?.error as Record<string, unknown>;
            const errorMsg = (errorInner?.message as string) || (axiosError.message as string) || 'Unknown error';
            const errorStatus = (response?.status as number) || 'UNKNOWN';

            console.log(` [Seranex] 🎙️ Fail (${modelName}): Status ${errorStatus} - ${errorMsg.substring(0, 100)}`);

            if (errorInner) {
                console.log(` [Seranex] 🛑 Full error:`, JSON.stringify(errorInner).substring(0, 200));
            }

            if (response?.status === 429) {
                await notifyGeminiRateLimit(modelName, currentKey.substring(currentKey.length - 4), keyIndex);
            } else if (response?.status === 404 || response?.status === 400) {
                // HARD FAILURE: Model does not exist or invalid request
                console.error(`[GeminiEngine] ❌ Model ${modelName} broken (${response.status}). TARGET URL: ${url}`);
                failedModels.add(modelName);
            }

            totalAttempts--;
            if (totalAttempts > 0 && totalAttempts % keyRotator.getKeyCount() === 0) {
                currentModelIndex++;
            }
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    // --- TIER 3: EMERGENCY PARTITION (Old/Backup Keys) ---
    if (keyRotator.getTier3KeyCount() > 0) {
        console.log(`[GeminiEngine] 🚨 Tier 2 exhausted. Trying Tier 3 (Backup Partition)...`);
        for (let i = 0; i < keyRotator.getTier3KeyCount(); i++) {
            const backupKey = keyRotator.getTier3Key(i);
            const modelName = 'gemini-1.5-flash'; // Use the most robust/cheap model for emergency
            try {
                const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${backupKey}`;
                const response = await axios.post(url, payload, { timeout: 15000, family: 4 });
                if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return { text: response.data.candidates[0].content.parts[0].text, model: `${modelName}-backup` };
                }
            } catch {
                // Silently continue through backup pool
            }
        }
    }

    throw new Error('All Gemini keys (Primary, Backup, and Emergency) exhausted in Engine.');
}

/**
 * Call generic OpenAI-compatible APIs (Groq, SambaNova, NVIDIA)
 */
async function callOpenAICompatible(
    url: string,
    key: string,
    model: string,
    systemPrompt: string,
    history: { role: string; content: string }[],
    userMessage: string
): Promise<string> {
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({
            role: (m.role === 'assistant' || m.role === 'model') ? 'assistant' : 'user',
            content: m.content || ''
        })),
        { role: 'user', content: userMessage }
    ];

    const response = await axios.post(
        url,
        {
            model: model,
            messages: messages,
            temperature: 0.7,
            max_tokens: 800
        },
        {
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        }
    );

    return response.data?.choices?.[0]?.message?.content || "";
}

/**
 * Route to suitable provider based on task context
 */
async function callSuitableProvider(
    userMessage: string,
    history: { role: string; content: string }[],
    prompt: string
): Promise<{ text: string, model: string }> {
    // 1. Task Detection
    const isSlang = detectLanguageStyle(userMessage) === "SINGLISH";
    const isFinancial = userMessage.toLowerCase().includes("keeyada") || userMessage.toLowerCase().includes("ganan") || userMessage.toLowerCase().includes("price");

    // Priority Map:
    // - Complex/Finance/JSON: Gemini 2.0 (High Intelligence)
    // - Fast Chat/Slang: SambaNova/Groq (Lowest Latency)

    const providers = [];

    if (isFinancial) {
        providers.push({ name: 'GEMINI', call: () => callGeminiRobust(userMessage, history, prompt) });
    } else if (isSlang) {
        providers.push({
            name: 'SAMBANOVA',
            call: async () => ({
                text: await callOpenAICompatible("https://api.sambanova.ai/v1/chat/completions", SAMBANOVA_API_KEY!, MODEL_SAMBANOVA, prompt, history, userMessage),
                model: MODEL_SAMBANOVA
            })
        });
        providers.push({
            name: 'GROQ',
            call: async () => ({
                text: await callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", GROQ_API_KEY!, MODEL_GROQ, prompt, history, userMessage),
                model: MODEL_GROQ
            })
        });
    }

    // Default Waterfall if specific detection fails or for broad coverage
    providers.push({ name: 'GEMINI', call: () => callGeminiRobust(userMessage, history, prompt) });
    providers.push({
        name: 'SAMBANOVA',
        call: async () => ({
            text: await callOpenAICompatible("https://api.sambanova.ai/v1/chat/completions", SAMBANOVA_API_KEY!, MODEL_SAMBANOVA, prompt, history, userMessage),
            model: MODEL_SAMBANOVA
        })
    });
    providers.push({
        name: 'GROQ',
        call: async () => ({
            text: await callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", GROQ_API_KEY!, MODEL_GROQ, prompt, history, userMessage),
            model: MODEL_GROQ
        })
    });
    providers.push({
        name: 'NVIDIA',
        call: async () => ({
            text: await callOpenAICompatible("https://integrate.api.nvidia.com/v1/chat/completions", NVIDIA_API_KEY!, MODEL_NVIDIA, prompt, history, userMessage),
            model: MODEL_NVIDIA
        })
    });

    let lastError: any = null;
    for (const provider of providers) {
        try {
            console.log(`[AI-ROUTER] Attempting ${provider.name}...`);
            return await provider.call();
        } catch (err: any) {
            console.warn(`[AI-ROUTER] ${provider.name} failed:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error("All suitable providers failed.");
}
