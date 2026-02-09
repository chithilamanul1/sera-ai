// lib/pdf-service.ts
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface QuoteItem {
    name: string;
    price: number;
}

export interface QuoteData {
    id: string;
    clientName: string;
    clientPhone?: string;
    items: QuoteItem[];
    total: number;
    advance?: number;
    notes?: string;
}

/**
 * Generate a Professional PDF for a Invoice/Quote
 */
export async function generateQuotePDF(data: QuoteData, type: 'QUOTATION' | 'INVOICE' = 'QUOTATION'): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });

            // Ensure temp directory exists
            const tempDir = path.join(process.cwd(), 'public', 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const filename = `${type}_${data.id}_${Date.now()}.pdf`;
            const filePath = path.join(tempDir, filename);
            const writeStream = fs.createWriteStream(filePath);

            doc.pipe(writeStream);

            // --- THEME COLORS ---
            const primaryColor = '#00D4AA'; // Seranex Teal
            const secondaryColor = '#2C3E50';

            // --- HEADER & LOGO ---
            doc.fillColor(primaryColor)
                .font('Helvetica-Bold')
                .fontSize(24)
                .text('SERANEX LANKA', 50, 50)
                .fontSize(10)
                .font('Helvetica')
                .fillColor(secondaryColor)
                .text('Software & Web development Solutions', 50, 75);

            doc.fontSize(20)
                .fillColor(secondaryColor)
                .font('Helvetica-Bold')
                .text(type, 400, 50, { align: 'right' });

            doc.fontSize(10)
                .font('Helvetica')
                .text(`ID: ${data.id}`, 400, 75, { align: 'right' })
                .text(`Date: ${new Date().toLocaleDateString()}`, 400, 90, { align: 'right' });

            // --- DIVIDER ---
            doc.moveTo(50, 110).lineTo(550, 110).strokeColor(primaryColor).lineWidth(2).stroke();

            // --- CLIENT INFO ---
            doc.moveDown(2);
            doc.fillColor('black').fontSize(12).font('Helvetica-Bold').text('BILL TO:', 50, 130);
            doc.fontSize(10).font('Helvetica').text(data.clientName, 50, 145);
            if (data.clientPhone) doc.text(`Phone: ${data.clientPhone}`, 50, 160);

            // --- TABLE HEADER ---
            doc.moveDown(3);
            const tableTop = 200;
            doc.fillColor(secondaryColor).fontSize(10).font('Helvetica-Bold').text('Description', 50, tableTop);
            doc.text('Amount (LKR)', 400, tableTop, { align: 'right' });

            doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor('#EEEEEE').lineWidth(1).stroke();

            // --- ITEMS ---
            doc.font('Helvetica');
            let currentY = tableTop + 30;
            data.items.forEach(item => {
                doc.fillColor('black').fontSize(10).text(item.name, 50, currentY);
                doc.text(item.price.toLocaleString(), 400, currentY, { align: 'right' });
                currentY += 20;

                // Page break if needed
                if (currentY > 700) {
                    doc.addPage();
                    currentY = 50;
                }
            });

            // --- TOTALS ---
            doc.moveTo(50, currentY + 10).lineTo(550, currentY + 10).strokeColor(primaryColor).lineWidth(1).stroke();
            currentY += 25;

            doc.fontSize(12).fillColor(secondaryColor).font('Helvetica-Bold').text('TOTAL:', 300, currentY);
            doc.fillColor('black').text(`Rs. ${data.total.toLocaleString()}.00`, 400, currentY, { align: 'right' });

            if (data.advance) {
                currentY += 20;
                doc.fontSize(10).fillColor('gray').text('Advance Required:', 300, currentY);
                doc.text(`Rs. ${data.advance.toLocaleString()}.00`, 400, currentY, { align: 'right' });
            }

            // --- BANK DETAILS ---
            doc.moveDown(4);
            doc.fontSize(12).fillColor(primaryColor).text('PAYMENT DETAILS', 50, doc.y, { underline: true });
            doc.fontSize(10).fillColor('black');
            doc.text('Bank: HNB Bank');
            doc.text('Branch: Seeduwa');
            doc.text('Account Name: BJS Fernando');
            doc.text('Account No: 209020108826');

            // --- FOOTER ---
            const footerY = 750;
            doc.fontSize(8).fillColor('gray').text('This is a computer-generated document. No signature required.', 50, footerY, { align: 'center', width: 500 });
            doc.text('Contact: +94 76 829 0477 | Email: seranexlanka@gmail.com', 50, footerY + 10, { align: 'center', width: 500 });

            doc.end();

            writeStream.on('finish', () => {
                resolve(filePath);
            });

            writeStream.on('error', (err) => {
                reject(err);
            });

        } catch (error) {
            reject(error);
        }
    });
}
