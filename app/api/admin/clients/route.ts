import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Client from '@/models/Client';

/**
 * GET /api/admin/clients
 * List all clients
 */
export async function GET() {
    try {
        await dbConnect();
        const clients = await Client.find({}).sort({ createdAt: -1 });
        return NextResponse.json(clients);
    } catch (error: Error | unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

/**
 * POST /api/admin/clients
 * Create a new client
 */
export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const data = await req.json();

        if (!data.name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Generate slug if not provided
        if (!data.slug) {
            data.slug = data.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        }

        const client = await Client.create(data);
        return NextResponse.json(client);
    } catch (error: Error | unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
