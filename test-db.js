const mongoose = require('mongoose');

// Hardcoded URI for testing isolation
const MONGODB_URI = "mongodb+srv://furynetworkslk_db_user:DMYQONN9CTBmmxEj@serabot.4rnpgr5.mongodb.net/?appName=serabot";

async function testConnection() {
    try {
        console.log("Attempting to connect to MongoDB...");
        await mongoose.connect(MONGODB_URI);
        console.log("SUCCESS: Connected to MongoDB!");

        // Check if we can write/read
        const TestSchema = new mongoose.Schema({ name: String });
        const TestModel = mongoose.model('ConnectionTest', TestSchema);

        console.log("Creating test doc...");
        await TestModel.create({ name: "Ping" });
        console.log("SUCCESS: Document Created!");

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error("FAILURE: Connection Failed.");
        console.error(error);
        process.exit(1);
    }
}

testConnection();
