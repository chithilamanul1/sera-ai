import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Client Management Schema
 * Each client represents a business using the Xera platform
 */
export interface IClient extends Document {
    name: string;
    slug: string; // URL friendly name
    businessType: string;
    industry: string;
    whatsappNumber?: string;
    adminPhones: string[];

    // AI Configuration
    systemPrompt: string; // The "massive" specialized prompt
    aiModel: string;
    personalityTags: string[];

    // Business Details for AI Context
    businessDetails: string;
    bankDetails?: string;
    location?: string;

    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const ClientSchema = new Schema<IClient>({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    businessType: { type: String, default: 'General' },
    industry: { type: String },
    whatsappNumber: { type: String },
    adminPhones: [{ type: String }],

    systemPrompt: { type: String },
    aiModel: { type: String, default: 'gemini-2.0-flash' },
    personalityTags: [{ type: String }],

    businessDetails: { type: String },
    bankDetails: { type: String },
    location: { type: String },

    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

const Client: Model<IClient> = mongoose.models.Client || mongoose.model<IClient>('Client', ClientSchema);
export default Client;
