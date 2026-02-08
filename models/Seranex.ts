import mongoose, { Schema, Document, Model } from 'mongoose';

// Bot Settings Schema - Stores prices, instructions, admin commands
export interface IBotSettings extends Document {
    key: string;
    value: any;
    updatedBy: string;
    updatedAt: Date;
}

const BotSettingsSchema = new Schema<IBotSettings>({
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String, default: 'system' },
    updatedAt: { type: Date, default: Date.now }
});

// Conversation Schema - Stores chat history for context
export interface IConversation extends Document {
    phone: string;
    messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
        timestamp: Date;
    }>;
    customerMood: string;
    isCustomer: boolean;
    isFrequentCustomer?: boolean;
    orderStatus: 'none' | 'collecting_requirements' | 'pending_quote' | 'quote_sent' | 'confirmed' | 'completed';
    requirements: any;
    quotation: any;
    userProfile?: {
        name?: string;
        style: 'professional' | 'casual' | 'rude' | 'unknown';
        interests: string[];
        job?: string;
        notes?: string;
        language: 'en' | 'si' | 'singlish';
        bondLevel: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>({
    phone: { type: String, required: true, unique: true, index: true },
    messages: [{
        role: { type: String, enum: ['user', 'assistant', 'system'] },
        content: String,
        timestamp: { type: Date, default: Date.now }
    }],
    customerMood: { type: String, default: 'neutral' },
    isCustomer: { type: Boolean, default: true },
    isFrequentCustomer: { type: Boolean, default: false }, // For aiye/akke vs sir/miss
    orderStatus: {
        type: String,
        enum: ['none', 'collecting_requirements', 'pending_quote', 'quote_sent', 'confirmed', 'completed'],
        default: 'none'
    },
    requirements: { type: Schema.Types.Mixed, default: {} },
    quotation: { type: Schema.Types.Mixed, default: null },
    // Persist user personality & bond details
    userProfile: {
        type: {
            name: String,
            style: { type: String, enum: ['professional', 'casual', 'rude', 'unknown'], default: 'unknown' },
            interests: [String],
            job: String,
            notes: String,
            language: { type: String, enum: ['en', 'si', 'singlish'], default: 'en' },
            bondLevel: { type: Number, default: 0 } // 0-100
        },
        default: {}
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Order Schema - Confirmed orders
export interface IOrder extends Document {
    phone: string;
    customerName: string;
    requirements: any;
    quotation: {
        items: Array<{ name: string; price: number }>;
        total: number;
        advance: number;
    };
    status: 'pending_payment' | 'payment_received' | 'in_progress' | 'completed' | 'cancelled';
    paymentStatus: 'pending' | 'partial' | 'full';
    discordNotified: boolean;
    createdAt: Date;
}

const OrderSchema = new Schema<IOrder>({
    phone: { type: String, required: true },
    customerName: { type: String, default: 'Customer' },
    requirements: { type: Schema.Types.Mixed },
    quotation: {
        items: [{ name: String, price: Number }],
        total: Number,
        advance: Number
    },
    status: {
        type: String,
        enum: ['pending_payment', 'payment_received', 'in_progress', 'completed', 'cancelled'],
        default: 'pending_payment'
    },
    paymentStatus: { type: String, enum: ['pending', 'partial', 'full'], default: 'pending' },
    discordNotified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Pending Quotes (awaiting admin approval)
export interface IPendingQuote extends Document {
    phone: string;
    customerName: string;
    requirements: any;
    suggestedQuote: {
        items: Array<{ name: string; price: number }>;
        total: number;
    };
    adminApproved: boolean;
    adminPhone: string;
    createdAt: Date;
}

const PendingQuoteSchema = new Schema<IPendingQuote>({
    phone: { type: String, required: true },
    customerName: { type: String, default: 'Customer' },
    requirements: { type: Schema.Types.Mixed },
    suggestedQuote: {
        items: [{ name: String, price: Number }],
        total: Number
    },
    adminApproved: { type: Boolean, default: false },
    adminPhone: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// Export models
export const BotSettings: Model<IBotSettings> = mongoose.models.BotSettings || mongoose.model<IBotSettings>('BotSettings', BotSettingsSchema);
export const Conversation: Model<IConversation> = mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
export const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
export const PendingQuote: Model<IPendingQuote> = mongoose.models.PendingQuote || mongoose.model<IPendingQuote>('PendingQuote', PendingQuoteSchema);
