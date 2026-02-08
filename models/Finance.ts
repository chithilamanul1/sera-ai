import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFinance extends Document {
    type: 'INCOME' | 'EXPENSE';
    category: 'PROJECT_FEE' | 'SERVER_COST' | 'STAFF_COMMISSION' | 'MARKETING_AD';
    amount: number;
    project: string;
    sourceUser: string;
    staffMember?: string; // "Riyon", "Studio Vibes", etc.
    status: 'PENDING' | 'PAID';
    staffShare?: number;
    description?: string;
    paidAt?: Date;
    date: Date;
}

const FinanceSchema = new Schema<IFinance>({
    type: { type: String, enum: ['INCOME', 'EXPENSE'], required: true },
    category: {
        type: String,
        enum: ['PROJECT_FEE', 'SERVER_COST', 'STAFF_COMMISSION', 'MARKETING_AD'],
        default: 'PROJECT_FEE'
    },
    amount: { type: Number, required: true },
    project: { type: String, required: true },
    sourceUser: { type: String, required: true },
    staffMember: { type: String, default: null },
    status: { type: String, enum: ['PENDING', 'PAID'], default: 'PAID' }, // Default to PAID for manual logs
    staffShare: { type: Number, default: 0 },
    description: { type: String },
    paidAt: { type: Date },
    date: { type: Date, default: Date.now }
});

export const Finance: Model<IFinance> = mongoose.models.Finance || mongoose.model<IFinance>('Finance', FinanceSchema);
