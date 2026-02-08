import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import dbConnect from '@/lib/db';
import { Finance } from '@/models/Finance';
import moment from 'moment';

export async function GET() {
    try {
        await dbConnect();

        const startOfWeek = moment().subtract(7, 'days').startOf('day').toDate();
        const endOfWeek = moment().endOf('day').toDate();

        // 1. Get This Week's Income
        const incomeTxns = await Finance.find({
            type: 'INCOME',
            date: { $gte: startOfWeek, $lte: endOfWeek }
        });
        const totalIncome = incomeTxns.reduce((sum, t) => sum + t.amount, 0);

        // 2. Get This Week's PAID Expenses
        const paidExpenses = await Finance.find({
            type: 'EXPENSE',
            status: 'PAID',
            paidAt: { $gte: startOfWeek, $lte: endOfWeek }
        });
        const totalPaid = paidExpenses.reduce((sum, t) => sum + t.amount, 0);

        // 3. Get OUTSTANDING Debts (All Pending)
        const pendingDebts = await Finance.find({
            type: 'EXPENSE',
            status: 'PENDING'
        });
        const totalPending = pendingDebts.reduce((sum, t) => sum + t.amount, 0);

        // --- GENERATE REPORT TEXT ---
        let report = `📊 *WEEKLY FINANCIAL REPORT* 📊\n`;
        report += `🗓 _${moment(startOfWeek).format('MMM DD')} - ${moment(endOfWeek).format('MMM DD')}_\n\n`;

        report += `🟢 *INCOME (Money In):* LKR ${totalIncome.toLocaleString()}\n`;
        incomeTxns.forEach(t => report += `   + ${t.description || t.project}: ${t.amount.toLocaleString()}\n`);

        report += `\n🔴 *ALREADY PAID (Money Out):* LKR ${totalPaid.toLocaleString()}\n`;
        if (paidExpenses.length === 0) {
            report += `   _No payments made this week._\n`;
        } else {
            paidExpenses.forEach(t => report += `   - ${t.description || t.project}: ${t.amount.toLocaleString()}\n`);
        }

        report += `\n⚠️ *PENDING BILLS (Need to Pay):* LKR ${totalPending.toLocaleString()}\n`;
        if (pendingDebts.length === 0) {
            report += `   _No pending payments! Great job!_\n`;
        } else {
            pendingDebts.forEach(t => report += `   ❗ ${t.staffMember} (${t.description || t.project}): ${t.amount.toLocaleString()}\n`);
        }

        const netProfit = totalIncome - totalPaid;
        report += `\n💰 *NET PROFIT (This Week):* LKR ${netProfit.toLocaleString()}\n`;
        report += `_Reply 'Paid All' or 'Paid [Name]' to settle bills._`;

        return NextResponse.json({ success: true, report });

    } catch (error: any) {
        console.error("Report Generation Error", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
