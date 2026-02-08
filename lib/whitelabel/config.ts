import { WhiteLabelConfig } from './types';

const config: WhiteLabelConfig = {
    company: {
        name: 'seranex lanka',
        tagline: 'Best websites and software mobile app services for the chepest prices',
        location: 'seeduwa',
        hours: {
            display: '10 am-11pm',
            open: 9,
            close: 18
        },
        contact: {
            business: '0728382638',
            owner: '0772148511'
        }
    },
    personality: {
        name: 'Sera',
        tone: 'all',
        casualWords: ['aiye', 'akke', 'bro', 'macho']
    },
    services: [
        { name: 'General Inquiry', price: 0 }
    ],
    bank: {
        name: 'HNB Bank',
        accountName: 'BJS Fernando',
        accountNumber: '209020108826',
        branch: 'Seeduwa'
    }
};

// Helper to get pricing text
export const getPricingText = () => {
    return `Prices patan ganne 15k-25k wage sir. Requirement anuwa wenas wenawa.`;
};

// Helper to get bank details
export const getBankText = () => {
    const { bank } = config;
    if (!bank) return `Bank details not configured.`;
    return `💰 *Advance Payment Details* 💰
    
🏦 Bank: ${bank.name}
👤 Name: ${bank.accountName}
🔢 Acc: ${bank.accountNumber}
📍 Branch: ${bank.branch}

Please send the slip here after payment. 💪`;
};

export default config;
