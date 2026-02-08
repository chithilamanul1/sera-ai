import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IQuote extends Document {
    projectId: string; // Unique ID for the project (e.g. generated from timestamp)
    clientName: string;
    clientPhone: string;
    items: string[];
    status: 'DRAFT' | 'WAITING_FOR_DEV' | 'SENT_TO_CLIENT' | 'ACCEPTED' | 'REJECTED';
    agreementStatus: 'NOT_STARTED' | 'DRAFT_SENT_TO_RIYON' | 'SIGNED_AND_SENT';
    isSigned: boolean;
    estimatedPrice?: number;
    devId: string; // The developer handling the estimation (e.g. Riyon's phone)
    pdfPath?: string; // Path to the generated PDF
    createdAt: Date;
    updatedAt: Date;
}

const QuoteSchema = new Schema<IQuote>({
    projectId: { type: String, required: true, unique: true },
    clientName: { type: String, required: true },
    clientPhone: { type: String, required: true },
    items: [{ type: String }],
    status: {
        type: String,
        enum: ['DRAFT', 'WAITING_FOR_DEV', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED'],
        default: 'DRAFT'
    },
    agreementStatus: {
        type: String,
        enum: ['NOT_STARTED', 'DRAFT_SENT_TO_RIYON', 'SIGNED_AND_SENT'],
        default: 'NOT_STARTED'
    },
    isSigned: { type: Boolean, default: false },
    estimatedPrice: { type: Number },
    devId: { type: String, required: true },
    pdfPath: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

export const Quote: Model<IQuote> = mongoose.models.Quote || mongoose.model<IQuote>('Quote', QuoteSchema);
