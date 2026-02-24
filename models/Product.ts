import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Product / Inventory Schema
 * Linked to a specific Client
 */
export interface IProduct extends Document {
    clientId: mongoose.Types.ObjectId;
    name: string;
    description: string;
    price: number;
    currency: string;
    stock: number;
    category?: string;
    imageUrl?: string;
    metadata: Record<string, unknown>; // Extra fields like "size", "parts", etc.
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>({
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    currency: { type: String, default: 'LKR' },
    stock: { type: Number, default: 0 },
    category: { type: String },
    imageUrl: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

// For AI searching across products
ProductSchema.index({ name: 'text', description: 'text' });

const Product: Model<IProduct> = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
export default Product;
