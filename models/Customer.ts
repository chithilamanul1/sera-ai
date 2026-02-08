import mongoose, { Schema, model, models } from 'mongoose';

export interface ICustomer {
    phoneNumber: string; // formatting: +947...
    name?: string;
    address?: string;
    tags?: string[];
    isAiPaused: boolean; // Manual override
    aiPausedUntil?: Date; // Auto-pause expiry
    lastInteraction?: Date;
    discordThreadId?: string; // If we map discord threads to customers
}

const CustomerSchema = new Schema<ICustomer>(
    {
        phoneNumber: { type: String, required: true, unique: true },
        name: { type: String },
        address: { type: String },
        tags: { type: [String], default: [] },
        isAiPaused: { type: Boolean, default: false },
        aiPausedUntil: { type: Date },
        lastInteraction: { type: Date, default: Date.now },
        discordThreadId: { type: String },
    },
    { timestamps: true }
);

const Customer = models.Customer || model('Customer', CustomerSchema);

export default Customer;
