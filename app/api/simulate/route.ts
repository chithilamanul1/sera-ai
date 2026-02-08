import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/engine';
import Customer from '@/models/Customer';
import dbConnect from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        await dbConnect();

        const body = await req.json();
        const { message, history } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Find or Create Simulator Customer
        // logic: use a fixed phone number for simulator
        let customer = await Customer.findOne({ phoneNumber: '000-SIMULATOR' });
        if (!customer) {
            customer = await Customer.create({
                phoneNumber: '000-SIMULATOR',
                name: 'Dashboard Simulator',
                isAiPaused: false
            });
        }

        // Call Engine directly with mock context + DB ID
        const response = await generateAIResponse(
            message,
            history || [],
            {
                phone: customer.phoneNumber,
                customerName: customer.name,
                customerId: customer._id
            }
        );

        return NextResponse.json(response);

    } catch (error: any) {
        console.error("Simulation API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
