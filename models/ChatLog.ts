import mongoose, { Schema, model, models } from 'mongoose';

export enum ChatRole {
    USER = 'user',
    ASSISTANT = 'assistant',
    SYSTEM = 'system', // Logs/Notes
}

export interface IChatLog {
    customer: mongoose.Types.ObjectId;
    role: ChatRole;
    content: string; // The text content (transcribed if audio)
    audioUrl?: string; // If it was a voice note
    metadata?: Record<string, any>; // JSON blob for debugging/tokens
}

const ChatLogSchema = new Schema<IChatLog>(
    {
        customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
        role: {
            type: String,
            enum: Object.values(ChatRole),
            required: true,
        },
        content: { type: String, required: true },
        audioUrl: { type: String },
        metadata: { type: Map, of: Schema.Types.Mixed },
    },
    { timestamps: true }
);

// Index for quick retrieval of history by customer
ChatLogSchema.index({ customer: 1, createdAt: 1 });

const ChatLog = models.ChatLog || model('ChatLog', ChatLogSchema);

export default ChatLog;
