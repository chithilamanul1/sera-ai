import axios from 'axios';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

export async function sendWhatsAppMessage(to: string, text: string) {
    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
        console.warn("[WhatsApp] Missing Credentials. Message NOT sent:", text);
        return;
    }

    try {
        const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

        await axios.post(
            url,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: to,
                type: "text",
                text: { preview_url: false, body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`[WhatsApp] Sent to ${to}: ${text.substring(0, 20)}...`);

    } catch (error: any) {
        console.error(`[WhatsApp] Send Failed:`, error.response?.data || error.message);
        throw new Error("Failed to send WhatsApp message");
    }
}
