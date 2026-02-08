export interface WhiteLabelConfig {
    company: {
        name: string;
        tagline: string;
        location: string;
        hours: {
            display: string;
            open: number;
            close: number;
        };
        contact: {
            business: string;
            owner: string;
        };
    };
    personality: {
        name: string;
        tone: string;
        casualWords: string[];
    };
    services: Array<{ name: string; price: number }>;
    bank?: {
        name: string;
        accountName: string;
        accountNumber: string;
        branch: string;
    };
}
