import Order, { OrderStatus } from '@/models/Order';
import Customer from '@/models/Customer';
import { Quote } from '@/models/Quote';
import { Finance } from '@/models/Finance';
import { logToDiscord } from '@/lib/discord/logger';
import { generateQuotePDF } from '@/lib/pdf-service';
import { TEAM_ROLES } from '../seranex/roles';

const getGlobal = () => global as Record<string, any>;

// Mock Inventory Data
const INVENTORY: Record<string, boolean> = {
    "toyota axio brake pads": true,
    "toyota premio oil filter": true,
    "honda fit battery": true,
    "suzuki wagon r bumper": false,
};

/**
 * Generate a Payment Link (Placeholder/Mock)
 */
export async function generatePaymentLink(amount: number, description: string, orderId: string) {
    // In the future, this will call PayHere/Stripe API
    const baseUrl = "https://sera.bot/pay";
    const shortId = orderId.split('-').pop(); // Simple short ID
    return `${baseUrl}/${shortId}?amt=${amount}&desc=${encodeURIComponent(description)}`;
}


// --- GOD MODE FUNCTIONS ---

/**
 * Route a task to a staff member via WhatsApp
 */
export async function routeTask(targetName: string, targetPhone: string, message: string, originalClientMsg: string) {
    console.log(`[ROUTE] Routing to ${targetName} (${targetPhone})`);

    if (getGlobal().sendWhatsAppMessage) {
        await getGlobal().sendWhatsAppMessage(targetPhone,
            `*New Task Routed by Sera*\n\n` +
            `📝 *Message*: ${message}\n` +
            `👤 *Client Said*: "${originalClientMsg}"`
        );
        return { success: true, message: `Routed to ${targetName}` };
    }

    return { success: true, message: `[SIMULATION] Routed to ${targetName}: ${message}` };
}

/**
 * Trigger a reminder to staff for a stuck project
 */
export async function triggerReminder(args: { target: string, phone: string, project_id: string, reason: string }) {
    console.log(`[REMINDER] Reminding ${args.target} about ${args.project_id}`);

    const message = `*⏰ Reminder from Sera*\n\n` +
        `Hey ${args.target}! 👋\n` +
        `Customer gen message ekak awa ${args.project_id} gena. \n` +
        `Reason: "${args.reason}"\n\n` +
        `Puluwan ikmanata update ekak danna! 💪`;

    if (getGlobal().sendWhatsAppMessage) {
        await getGlobal().sendWhatsAppMessage(args.phone, message);
    }

    return { success: true, message: `Reminder sent to ${args.target}.` };
}


/**
 * Log a financial transaction
 */
export async function logFinance(
    type: 'INCOME' | 'EXPENSE',
    amount: number,
    project: string,
    sourceUser: string,
    description?: string,
    category: 'PROJECT_FEE' | 'SERVER_COST' | 'STAFF_COMMISSION' | 'MARKETING_AD' = 'PROJECT_FEE',
    staffMember: string | null = null,
    status: 'PENDING' | 'PAID' = 'PAID'
) {
    console.log(`[FINANCE] Logging ${type}: ${amount} for ${project}`);

    try {
        const entry = await Finance.create({
            type,
            category,
            amount,
            project,
            sourceUser,
            staffMember: staffMember || undefined,
            status,
            description,
            paidAt: status === 'PAID' ? new Date() : undefined
        });

        // --- AUTOMATIC LIABILITY CREATION ---
        // If it's a PROJECT_FEE INCOME, create a PENDING commission for Riyon (60%)
        if (type === 'INCOME' && category === 'PROJECT_FEE') {
            const devCommission = amount * 0.6;
            await Finance.create({
                type: 'EXPENSE',
                category: 'STAFF_COMMISSION',
                amount: devCommission,
                project,
                sourceUser: 'System (Auto)',
                staffMember: 'Riyon',
                status: 'PENDING',
                description: `Commission for ${project}`
            });
            console.log(`[FINANCE] Auto-created liability for Riyon: ${devCommission}`);

            // WhatsApp Notification to Riyon
            if (getGlobal().sendWhatsAppMessage) {
                const financeMsg = `💰 *Income Registered!*\n\nProject: ${project}\nIncome: Rs. ${amount.toLocaleString()}\n*Your Share: Rs. ${devCommission.toLocaleString()}*\n\nGreat work! 🚀`;
                await getGlobal().sendWhatsAppMessage(TEAM_ROLES.CO_OWNER, financeMsg);
            }
        }

        return { success: true, message: `${type} logged: ${amount}`, entryId: entry._id };
    } catch (e) {
        console.error("Finance Log Error", e);
        return { success: false, message: "Failed to log finance" };
    }
}

/**
 * Mark a pending expense as PAID
 */
export async function markAsPaid(staffName: string, amount?: number) {
    console.log(`[FINANCE] Marking payment for ${staffName} (Amount: ${amount || 'any'}) as PAID`);

    try {
        const query: Record<string, any> = {
            staffMember: { $regex: new RegExp(staffName, 'i') },
            status: 'PENDING',
            type: 'EXPENSE'
        };

        if (amount) {
            query.amount = { $gte: amount - 10, $lte: amount + 10 };
        }

        const txn = await Finance.findOne(query).sort({ date: 1 });

        if (!txn) {
            return { success: false, message: `No pending bill found for ${staffName} matching that amount.` };
        }

        txn.status = 'PAID';
        txn.paidAt = new Date();
        await txn.save();

        const remaining = await Finance.aggregate([
            { $match: { staffMember: txn.staffMember, status: 'PENDING', type: 'EXPENSE' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const remainingAmount = remaining.length > 0 ? remaining[0].total : 0;

        return {
            success: true,
            message: `Marked ${txn.staffMember}'s ${txn.amount} as PAID. Remaining: ${remainingAmount}`,
            remaining: remainingAmount
        };
    } catch (e) {
        console.error("Mark Paid Error", e);
        return { success: false, message: "Failed to mark as paid" };
    }
}

/**
 * Request Payment from Customer
 */
export async function requestPayment(args: { amount: number, type: 'ADVANCE' | 'FULL', project_id: string, description: string }) {
    console.log(`[PAYMENT] Requesting ${args.type} of ${args.amount} for ${args.project_id}`);

    const payLink = await generatePaymentLink(args.amount, args.description, args.project_id);

    const message = `*💳 Payment Required: ${args.type}*\n\n` +
        `📦 **Project**: ${args.project_id}\n` +
        `💰 **Amount**: LKR ${args.amount}\n\n` +
        `👇 *Pay Securely Here*:\n${payLink}\n\n` +
        `*Note*: Once paid, send the screenshot here! 💪`;

    return {
        success: true,
        message: "Payment link generated.",
        actions: [{ type: 'SEND_TEXT', to: 'CUSTOMER', text: message }],
        link: payLink
    };
}

/**
 * Send current Location to Family
 */
export async function sendLocation(args: { latitude?: number, longitude?: number, description?: string }) {
    // Default to a "Study Location" if coords not provided (Simulation)
    const lat = args.latitude || 6.9271; // Colombo
    const lon = args.longitude || 79.8612;
    const desc = args.description || "In a client meeting / Studying";

    console.log(`[LOCATION] Sending location to family: ${lat}, ${lon}`);

    return {
        success: true,
        message: "Location sent to family.",
        actions: [{
            type: 'SEND_LOCATION',
            to: 'CUSTOMER',
            latitude: lat,
            longitude: lon,
            description: desc
        }]
    };
}



// --- QUOTE WORKFLOW FUNCTIONS ---

/**
 * Generate a Draft Quote (Spec Sheet)
 */
export async function generateDraftQuote(clientName: string, clientPhone: string, projectId: string, items: string[]) {
    const newQuote = await Quote.create({
        projectId,
        clientName,
        clientPhone,
        items,
        status: 'WAITING_FOR_DEV',
        agreementStatus: 'DRAFT_SENT_TO_RIYON',
        devId: TEAM_ROLES.CO_OWNER,
    });

    const pdfPath = await generateQuotePDF({
        id: projectId,
        clientName,
        items: items.map(item => ({ name: item, price: 0 })),
        total: 0
    }, 'QUOTATION');

    newQuote.pdfPath = pdfPath;
    await newQuote.save();

    const devMessage = `📝 *New Draft Specification*\n\nClient: ${clientName}\nProject: ${projectId}\nItems: ${items.join(', ')}\n\n*Review needed. Reply with prices.*`;
    if (getGlobal().sendWhatsAppMessage) {
        await getGlobal().sendWhatsAppMessage(TEAM_ROLES.CO_OWNER, devMessage);
    }

    return {
        success: true,
        quoteId: newQuote._id,
        pdfPath,
        message: "Draft generated and sent to dev.",
        actions: [{ type: 'SEND_FILE', to: TEAM_ROLES.CO_OWNER, path: pdfPath, caption: devMessage }]
    };
}

/**
 * Finalize a Quote (Add Price)
 */
export async function finalizeQuote(projectId: string, price: number) {
    const quote = await Quote.findOne({ projectId });
    if (!quote) return { success: false, message: "Quote not found" };

    quote.estimatedPrice = price;
    quote.status = 'SENT_TO_CLIENT';

    const pdfPath = await generateQuotePDF({
        id: quote.projectId,
        clientName: quote.clientName,
        clientPhone: quote.clientPhone,
        items: quote.items.map((item: string) => ({ name: item, price: 0 })),
        total: price
    }, 'QUOTATION');

    quote.pdfPath = pdfPath;
    await quote.save();

    return {
        success: true,
        quoteId: quote._id,
        pdfPath,
        message: "Final PDF generated.",
        actions: [{ type: 'SEND_FILE', to: quote.clientPhone, path: pdfPath, caption: "Here is your quotation!" }]
    };
}

/**
 * Sign a Quote (Riyon's Approval)
 */
export async function signQuote(projectId: string) {
    const quote = await Quote.findOne({ projectId });
    if (!quote) return { success: false, message: "Quote not found" };
    if (!quote.estimatedPrice) return { success: false, message: "Price not set. Cannot sign." };

    quote.isSigned = true;
    quote.agreementStatus = 'SIGNED_AND_SENT';
    quote.status = 'SENT_TO_CLIENT';

    const pdfPath = await generateQuotePDF({
        id: quote.projectId,
        clientName: quote.clientName,
        clientPhone: quote.clientPhone,
        items: quote.items.map((item: string) => ({ name: item, price: 0 })),
        total: quote.estimatedPrice
    }, 'QUOTATION');

    quote.pdfPath = pdfPath;
    await quote.save();

    return {
        success: true,
        quoteId: quote._id,
        pdfPath,
        message: "Signed agreement sent to client.",
        actions: [{ type: 'SEND_FILE', to: quote.clientPhone, path: pdfPath, caption: "Here is the formal agreement signed by our management." }]
    };
}

// --- FULL CIRCLE WORKFLOW FUNCTIONS ---

export async function generateSocialCaption(projectTitle: string) {
    return {
        caption: `🔥 Check out our latest work: ${projectTitle}!\n\n🚀 Fast, Mobile-Friendly, and Premium Design.\n#WebDesign #SriLanka`,
        designBrief: `Create a premium portfolio showcase for "${projectTitle}".`
    };
}

export async function forwardToDesign(projectTitle: string, brief: string) {
    const message = `*🎨 New Design Request*\n\n📦 **Project**: ${projectTitle}\n📝 **Brief**: ${brief}`;
    if (getGlobal().sendWhatsAppMessage) {
        await getGlobal().sendWhatsAppMessage(TEAM_ROLES.STUDIO_VIBES, message);
    }
    return { success: true, message: "Design brief sent to Studio Vibes." };
}

export async function forwardToMarketing(projectTitle: string, caption?: string) {
    await logFinance('EXPENSE', 350, projectTitle, 'Studio Vibes (Design Fee)', 'Design fee', 'SERVER_COST');
    const message = `*🚀 New Marketing Asset*\n\n📦 **Project**: ${projectTitle}\n📝 **Caption**: \n"${caption}"`;
    if (getGlobal().sendWhatsAppMessage) {
        await getGlobal().sendWhatsAppMessage(TEAM_ROLES.SKY_DESIGNERS, message);
    }
    return { success: true, message: "Forwarded to Sky Designers. Finance logged (-350)." };
}

export async function handleFeedbackLoop(feedback: string, projectTitle: string) {
    const message = `*⚠️ Design Needs Revision*\n\n📦 **Project**: ${projectTitle}\n🗣️ **Feedback**: "${feedback}"`;
    if (getGlobal().sendWhatsAppMessage) {
        await getGlobal().sendWhatsAppMessage(TEAM_ROLES.STUDIO_VIBES, message);
    }
    return { success: true, message: `Feedback sent to Studio Vibes: ${feedback}` };
}

export async function approveMarketing(projectTitle: string, budget: number = 2000) {
    await logFinance('EXPENSE', budget, projectTitle, 'Sky Designers (Ad Boost)', 'Marketing boost', 'MARKETING_AD');
    return { success: true, message: `Ad campaign approved. Finance logged (-${budget}).` };
}

// --- LEGACY FUNCTIONS ---

export async function executeCheckStock(args: { item_name: string, vehicle_model?: string }) {
    const query = args.item_name.toLowerCase();
    const foundKey = Object.keys(INVENTORY).find(k => k.includes(query));
    if (foundKey) {
        const isAvailable = INVENTORY[foundKey];
        return {
            available: isAvailable,
            message: isAvailable ? `Ow, api laga ${args.item_name} thiyanawa.` : `Samawen, danata ${args.item_name} iwarai.`
        };
    }
    return { available: false, message: "Hariata check karaganna ba." };
}

export async function executePlaceOrder(args: { items: { name: string, quantity?: number }[], delivery_address: string, customer_name: string, phone: string }) {
    try {
        const customer = await Customer.findOne({ phoneNumber: args.phone });
        const newOrder = await Order.create({
            customer: customer ? customer._id : null,
            shortId: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
            items: args.items.map((i) => ({ description: i.name, quantity: i.quantity || 1 })),
            status: OrderStatus.PENDING,
            notes: `Address: ${args.delivery_address}`
        });
        await logToDiscord('New Order Placed', `Order ${newOrder.shortId} for ${args.customer_name}`, 'SUCCESS');
        return { success: true, orderId: newOrder.shortId, message: `Order eka confirm kala. ID: ${newOrder.shortId}` };
    } catch (error) {
        console.error("Order Failed", error);
        return { success: false, message: "System error while placing order." };
    }
}
