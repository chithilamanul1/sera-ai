import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Order, { OrderStatus } from '@/models/Order';
import ChatLog from '@/models/ChatLog';

export async function GET() {
    try {
        await dbConnect();

        // 1. Calculate Pending Orders
        const pendingOrders = await Order.countDocuments({ status: OrderStatus.PENDING });

        // 2. Calculate Total Sales (Confirmed Orders)
        // Assuming items have a 'price' field, but currently our model is simple (item/quantity).
        // We will just count confirmed orders for now or simulate a value.
        const confirmedOrders = await Order.find({ status: OrderStatus.CONFIRMED });
        // Mock revenue calculation: Each order approx LKR 5000
        const revenue = confirmedOrders.length * 5000;

        // 3. Active Chats (Unique customers in last 24h)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const activeChats = await ChatLog.distinct('customer', {
            createdAt: { $gte: yesterday }
        });

        return NextResponse.json({
            revenue: revenue,
            pendingOrders: pendingOrders,
            activeChats: activeChats.length
        });

    } catch (error: any) {
        console.error("Stats API Error", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
