/**
 * Seranex Lanka AI Prompts
 * System instructions for the AI agent
 * Now uses white-label dynamic prompts!
 */

import generateSystemPrompt, { quickResponses } from '../whitelabel/prompts';

// Use the white-label dynamic prompt generator
export const SERANEX_SYSTEM_PROMPT = generateSystemPrompt();

// Export quick responses for use in route.ts
export const FRIEND_REDIRECT_MESSAGE = quickResponses.friendRedirect;
export const COMPLAINT_TRANSFER_MESSAGE = quickResponses.complaintTransfer;
export const BUSINESS_HOURS_MESSAGE = quickResponses.afterHours;
export const WELCOME_MESSAGE = quickResponses.greeting.singlish;
export const BANK_DETAILS_MESSAGE = quickResponses.orderConfirmed;

// Order confirmation template
export const ORDER_CONFIRMATION_TEMPLATE = (details: Record<string, unknown>) => `
🎉 *ORDER CONFIRMED!*

Thank you for choosing Seranex Lanka!

📋 *Order Details:*
${Object.entries(details).map(([k, v]) => `• ${k}: ${v}`).join('\n')}

${quickResponses.orderConfirmed}
`;

// Bank details helper
export const getBankDetailsText = () => quickResponses.orderConfirmed;

// Quote formatter
export const formatQuotationText = (
   customer: string,
   phone: string,
   requirements: Record<string, unknown>,
   price: number
) => `
📋 *NEW QUOTATION REQUEST*

👤 Customer: ${customer}
📞 Phone: ${phone}

📝 Requirements:
${Object.entries(requirements).map(([k, v]) => `• ${k}: ${v}`).join('\n')}

💰 Estimated Price: Rs. ${price.toLocaleString()}
`;

// Order notification for Discord
export const formatOrderNotification = (
   customer: string,
   phone: string,
   requirements: Record<string, unknown>,
   price: number
) => `
🎉 *NEW ORDER CONFIRMED!*

👤 Customer: ${customer}
📞 Phone: ${phone}

📝 Order Details:
${Object.entries(requirements).map(([k, v]) => `• ${k}: ${v}`).join('\n')}

💰 Total: Rs. ${price.toLocaleString()}
💳 Advance (40%): Rs. ${(price * 0.4).toLocaleString()}
`;
