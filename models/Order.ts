import mongoose, { Schema, model, models } from 'mongoose';

export enum OrderStatus {
    PENDING = 'pending',
    CONFIRMED = 'confirmed',
    SHIPPED = 'shipped',
    DELIVERED = 'delivered',
    CANCELLED = 'cancelled',
}

export interface IOrderItem {
    description: string;
    quantity?: number;
    price?: number;
}

export interface IOrder {
    customer: mongoose.Types.ObjectId;
    shortId: string; // Friendly ID for humans e.g. "ORD-123"
    items: IOrderItem[];
    status: OrderStatus;
    totalAmount?: number;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
    {
        customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
        shortId: { type: String, required: true, unique: true },
        items: [
            {
                description: { type: String, required: true },
                quantity: { type: Number, default: 1 },
                price: { type: Number },
            },
        ],
        status: {
            type: String,
            enum: Object.values(OrderStatus),
            default: OrderStatus.PENDING,
        },
        totalAmount: { type: Number },
        notes: { type: String },
    },
    { timestamps: true }
);

const Order = models.Order || model('Order', OrderSchema);

export default Order;
