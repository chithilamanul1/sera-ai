import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://furynetworkslk_db_user:xPD9sZY3Wps7euhi@serabot.4rnpgr5.mongodb.net/?appName=serabot";

const messageSchema = new mongoose.Schema({
    role: String,
    content: String,
    timestamp: { type: Date, default: Date.now }
});

const conversationSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    messages: [messageSchema],
    userProfile: {
        style: String,
        interests: [String],
        language: String,
        bondLevel: Number
    },
    lastUpdated: { type: Date, default: Date.now }
});

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

async function cleanHistory() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const phone = '94774139621'; // Amma's phone
        const conv = await Conversation.findOne({ phone });

        if (conv) {
            console.log(`Found conversation for ${phone}. Messages: ${conv.messages.length}`);

            // Just clear the messages to give a fresh "Amma" experience
            conv.messages = [];
            conv.userProfile = {
                style: 'respectful',
                interests: [],
                language: 'si',
                bondLevel: 100
            };
            await conv.save();
            console.log('✅ History cleared and profile updated for Amma.');
        } else {
            console.log('No conversation found for this phone.');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

cleanHistory();
